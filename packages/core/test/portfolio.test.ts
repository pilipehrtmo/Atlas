import { describe, expect, it } from 'vitest';
import { buildLedger, LedgerError, valuePortfolio, type Transaction } from '../src/index.js';

const base: Transaction[] = [
  { date: '2024-01-02', type: 'DEPOSIT', amount: '10000', currency: 'USD' },
  { date: '2024-01-03', type: 'BUY', symbol: 'AAA', quantity: '10', price: '100', fee: '1', currency: 'USD' },
  { date: '2024-02-01', type: 'BUY', symbol: 'AAA', quantity: '10', price: '120', fee: '1', currency: 'USD' },
];

describe('ledger', () => {
  it('computes weighted average cost including buy fees', () => {
    const l = buildLedger(base);
    const p = l.positions.find((x) => x.symbol === 'AAA')!;
    expect(p.quantity).toBe('20');
    expect(p.totalCost).toBe('2202');
    expect(p.averageCost).toBe('110.1');
    expect(l.cash.USD).toBe('7798');
  });

  it('realizes P&L on sells at average cost, net of fees', () => {
    const l = buildLedger([...base, { date: '2024-03-01', type: 'SELL', symbol: 'AAA', quantity: '5', price: '130', fee: '2', currency: 'USD' }]);
    const p = l.positions[0];
    // proceeds 650-2=648, cost removed 5*110.1=550.5 -> 97.5
    expect(p.realizedPnl).toBe('97.5');
    expect(p.quantity).toBe('15');
    expect(p.totalCost).toBe('1651.5');
    expect(p.averageCost).toBe('110.1');
    expect(l.cash.USD).toBe('8446');
  });

  it('rejects selling more than held', () => {
    expect(() => buildLedger([...base, { date: '2024-03-01', type: 'SELL', symbol: 'AAA', quantity: '25', price: '130', currency: 'USD' }])).toThrow(LedgerError);
  });

  it('applies splits to quantity without changing cost', () => {
    const l = buildLedger([...base, { date: '2024-04-01', type: 'SPLIT', symbol: 'AAA', splitRatio: '4', currency: 'USD' }]);
    const p = l.positions[0];
    expect(p.quantity).toBe('80');
    expect(p.totalCost).toBe('2202');
    expect(p.averageCost).toBe('27.525');
  });

  it('orders by date regardless of input order', () => {
    const l = buildLedger([base[2], base[1], base[0]]);
    expect(l.positions[0].quantity).toBe('20');
  });

  it('tracks dividends as cash and per-position income', () => {
    const l = buildLedger([...base, { date: '2024-05-01', type: 'DIVIDEND', symbol: 'AAA', amount: '12.34', currency: 'USD' }]);
    expect(l.positions[0].dividends).toBe('12.34');
    expect(l.cash.USD).toBe('7810.34');
  });

  it('closes positions completely and resets cost', () => {
    const l = buildLedger([...base, { date: '2024-03-01', type: 'SELL', symbol: 'AAA', quantity: '20', price: '110.1', currency: 'USD' }]);
    expect(l.positions[0].quantity).toBe('0');
    expect(l.positions[0].totalCost).toBe('0');
    expect(l.positions[0].averageCost).toBeNull();
    expect(l.positions[0].realizedPnl).toBe('0');
  });
});

describe('valuation', () => {
  it('values positions and cash, computing weights only when complete', () => {
    const l = buildLedger(base);
    const v = valuePortfolio(l, { AAA: { price: '125', asOf: '2024-06-01', provider: 'test' } }, 'USD', {});
    expect(v.positions[0].marketValue).toBe('2500');
    expect(v.positions[0].unrealizedPnl).toBe('298');
    expect(v.totalValue).toBe('10298');
    expect(Number(v.positions[0].weight)).toBeCloseTo(2500 / 10298, 12);
    expect(v.missing).toEqual([]);
  });

  it('never treats a missing price as zero', () => {
    const l = buildLedger(base);
    const v = valuePortfolio(l, {}, 'USD', {});
    expect(v.positions[0].marketValue).toBeNull();
    expect(v.totalValue).toBeNull();
    expect(v.valuedSubtotal).toBe('7798');
    expect(v.missing).toEqual([{ item: 'AAA', reason: 'No price available' }]);
    expect(v.positions[0].weight).toBeNull();
  });

  it('converts foreign holdings with explicit FX and flags missing rates', () => {
    const l = buildLedger([
      { date: '2024-01-02', type: 'DEPOSIT', amount: '1000', currency: 'EUR' },
      { date: '2024-01-03', type: 'BUY', symbol: 'SAP', quantity: '2', price: '150', currency: 'EUR' },
    ]);
    const prices = { SAP: { price: '160', asOf: '2024-06-01', provider: 'test' } };
    const ok = valuePortfolio(l, prices, 'USD', { EUR: '1.1' });
    expect(ok.totalValue).toBe('1122'); // (320 + 700) * 1.1
    const bad = valuePortfolio(l, prices, 'USD', {});
    expect(bad.totalValue).toBeNull();
    expect(bad.missing.map((m) => m.item)).toEqual(['SAP', 'EUR cash']);
  });
});
