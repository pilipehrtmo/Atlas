import { describe, expect, it } from 'vitest';
import { asOfLookup, benchmarkReturns, performanceHistory, type Transaction } from '../src/index.js';

const prices: Record<string, Record<string, string>> = {
  AAA: { '2025-01-02': '10', '2025-01-03': '11', '2025-01-06': '12', '2025-01-07': '12' },
};
const priceOn = (s: string, d: string) => prices[s]?.[d] ?? null;
const noFx = () => null;
const dates = ['2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07'];

describe('performanceHistory', () => {
  it('cash-tracked: a deposit is not performance, price moves are', () => {
    const txs: Transaction[] = [
      { date: '2025-01-02', type: 'DEPOSIT', amount: '1000', currency: 'USD' },
      { date: '2025-01-02', type: 'BUY', symbol: 'AAA', quantity: '50', price: '10', currency: 'USD' },
      { date: '2025-01-06', type: 'DEPOSIT', amount: '500', currency: 'USD' },
    ];
    const h = performanceHistory(txs, dates, priceOn, noFx, 'USD');
    expect(h.method).toBe('cash-tracked');
    expect(h.points.map((p) => p.value)).toEqual(['1000', '1050', '1600', '1600']);
    // Day 2: 1050/1000; day 3: 1600/(1050+500) ; day 4 flat.
    expect(Number(h.points[1].cumulativeReturn)).toBeCloseTo(0.05, 10);
    expect(Number(h.twr)).toBeCloseTo((1050 / 1000) * (1600 / 1550) - 1, 10);
    expect(h.gaps).toBe(0);
  });

  it('holdings-only: buys are inflows and sells are outflows', () => {
    const txs: Transaction[] = [
      { date: '2025-01-02', type: 'BUY', symbol: 'AAA', quantity: '10', price: '10', currency: 'USD' },
      { date: '2025-01-06', type: 'SELL', symbol: 'AAA', quantity: '5', price: '12', currency: 'USD' },
    ];
    const h = performanceHistory(txs, dates, priceOn, noFx, 'USD');
    expect(h.method).toBe('holdings-only');
    expect(h.points.map((p) => p.value)).toEqual(['100', '110', '60', '60']);
    // 100 -> 110 (+10%), then 110 - 60 proceeds = 50 base -> 60 (+20%).
    expect(Number(h.twr)).toBeCloseTo(1.1 * 1.2 - 1, 10);
  });

  it('a missing price is a gap, never zero, and breaks the chain', () => {
    const txs: Transaction[] = [
      { date: '2025-01-02', type: 'BUY', symbol: 'AAA', quantity: '1', price: '10', currency: 'USD' },
      { date: '2025-01-02', type: 'BUY', symbol: 'BBB', quantity: '1', price: '5', currency: 'USD' },
    ];
    const h = performanceHistory(txs, dates, priceOn, noFx, 'USD');
    expect(h.points.every((p) => p.value === null)).toBe(true);
    expect(h.points[0].missing).toContain('BBB price');
    expect(h.twr).toBeNull();
    expect(h.gaps).toBe(4);
  });

  it('converts foreign holdings with the FX rate of each date', () => {
    const txs: Transaction[] = [{ date: '2025-01-02', type: 'BUY', symbol: 'AAA', quantity: '10', price: '10', currency: 'EUR' }];
    const fx = (c: string, d: string) => (c === 'EUR' ? (d < '2025-01-06' ? '1.1' : '1.2') : null);
    const h = performanceHistory(txs, dates, priceOn, fx, 'USD');
    expect(h.points.map((p) => p.value)).toEqual(['110', '121', '144', '144']);
  });

  it('days before the first transaction have no value and are not gaps', () => {
    const txs: Transaction[] = [{ date: '2025-01-06', type: 'BUY', symbol: 'AAA', quantity: '1', price: '12', currency: 'USD' }];
    const h = performanceHistory(txs, dates, priceOn, noFx, 'USD');
    expect(h.points[0].value).toBeNull();
    expect(h.gaps).toBe(0);
    expect(h.twr).toBe('0');
  });

  it('a window starting after the first transaction opens at that day\'s value', () => {
    const txs: Transaction[] = [
      { date: '2024-12-01', type: 'DEPOSIT', amount: '1000', currency: 'USD' },
      { date: '2024-12-01', type: 'BUY', symbol: 'AAA', quantity: '10', price: '9', currency: 'USD' },
    ];
    const h = performanceHistory(txs, dates, priceOn, noFx, 'USD');
    expect(h.points[0].cumulativeReturn).toBe('0');
    expect(Number(h.twr)).toBeCloseTo(1030 / 1010 - 1, 10);
  });
});

describe('benchmark helpers', () => {
  it('asOfLookup carries values forward within the staleness limit', () => {
    const f = asOfLookup([{ date: '2025-01-02', value: '1' }, { date: '2025-01-06', value: '2' }], 3);
    expect(f('2025-01-01')).toBeNull();
    expect(f('2025-01-04')).toBe('1');
    expect(f('2025-01-06')).toBe('2');
    expect(f('2025-01-20')).toBeNull();
  });
  it('benchmarkReturns is relative to the first available close', () => {
    expect(benchmarkReturns(['a', 'b', 'c'], (d) => ({ a: null, b: '100', c: '110' })[d] ?? null)).toEqual([null, '0', '0.1']);
  });
});
