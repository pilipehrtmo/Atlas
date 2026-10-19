import { describe, expect, it } from 'vitest';
import { annualizeReturn, cagr, priceToEarnings, ratio, simpleReturn, timeWeightedReturn, parseDecimal, sum } from '../src/index.js';

describe('decimal parsing', () => {
  it('treats provider placeholders as missing, not zero', () => {
    for (const v of ['', '.', '-', 'None', 'N/A', null, undefined, 'abc']) expect(parseDecimal(v)).toBeNull();
    expect(parseDecimal('1,234.50')!.toString()).toBe('1234.5');
    expect(parseDecimal('-0.75%')!.toString()).toBe('-0.75');
  });
  it('avoids binary floating point error', () => {
    expect(sum(['0.1', '0.2'])).toBe('0.3');
  });
});

describe('returns', () => {
  it('simple return', () => {
    expect(simpleReturn('100', '110')).toBe('0.1');
    expect(simpleReturn('0', '110')).toBeNull();
    expect(simpleReturn(null, '110')).toBeNull();
  });
  it('annualizes over a 365-day year', () => {
    expect(Number(annualizeReturn('0.21', 730))).toBeCloseTo(0.1, 12);
    expect(annualizeReturn('0.1', 0)).toBeNull();
  });
  it('CAGR', () => {
    expect(Number(cagr('100', '121', 2))).toBeCloseTo(0.1, 12);
    expect(cagr('-5', '121', 2)).toBeNull();
  });
  it('time-weighted return ignores external flows', () => {
    // Start 100, grows 10% to 110. Deposit 890 -> 1000, grows 10% to 1100. TWR = 1.1*1.1-1 = 0.21
    const r = timeWeightedReturn('100', [
      { value: '110', flowAtStart: '0' },
      { value: '1100', flowAtStart: '890' },
    ]);
    expect(r).toBe('0.21');
  });
});

describe('ratios', () => {
  it('P/E is not meaningful for non-positive EPS', () => {
    expect(priceToEarnings('150', '6')).toBe('25');
    expect(priceToEarnings('150', '0')).toBeNull();
    expect(priceToEarnings('150', '-2')).toBeNull();
    expect(priceToEarnings('150', null)).toBeNull();
  });
  it('ratio guards zero denominators', () => {
    expect(ratio('1', '0')).toBeNull();
    expect(ratio('1', '4')).toBe('0.25');
  });
});
