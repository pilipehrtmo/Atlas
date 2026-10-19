import { D, dec, type Dec } from './decimal.js';

/**
 * Financial formulas. Conventions, also documented in docs/CALCULATIONS.md:
 *  - All money math uses decimal arithmetic; inputs and outputs are decimal strings.
 *  - Missing inputs produce null, never zero.
 *  - Ratios are returned as fractions (0.05 = 5%), not percentages.
 */

/** (end - start) / start. Null when either is missing or start is zero. */
export function simpleReturn(start: string | null, end: string | null): string | null {
  if (start === null || end === null) return null;
  const s = dec(start);
  if (s.isZero()) return null;
  return dec(end).minus(s).div(s).toString();
}

/** Annualizes a total return over `days` calendar days using a 365-day year. */
export function annualizeReturn(totalReturn: string, days: number): string | null {
  if (days <= 0) return null;
  const growth = dec(totalReturn).plus(1);
  if (growth.lte(0)) return null;
  return growth.pow(new D(365).div(days)).minus(1).toString();
}

export interface ValuationPoint {
  /** Portfolio value at the end of the period, after the period's flow. */
  value: string;
  /** External cash flow at the START of the period (deposit +, withdrawal -). */
  flowAtStart: string;
}

/**
 * Time-weighted return: chain-links sub-period returns so external deposits and
 * withdrawals do not count as performance. `initialValue` is the value before
 * the first period. r_i = V_i / (V_{i-1} + F_i) - 1.
 */
export function timeWeightedReturn(initialValue: string, points: ValuationPoint[]): string | null {
  let prev = dec(initialValue);
  let growth = new D(1);
  for (const p of points) {
    const base = prev.plus(dec(p.flowAtStart));
    if (base.lte(0)) return null;
    growth = growth.times(dec(p.value).div(base));
    prev = dec(p.value);
  }
  return growth.minus(1).toString();
}

/** Price / earnings per share. Null when EPS is missing or not positive (not meaningful). */
export function priceToEarnings(price: string | null, eps: string | null): string | null {
  if (price === null || eps === null) return null;
  const e = dec(eps);
  if (e.lte(0)) return null;
  return dec(price).div(e).toString();
}

/** Ratio a / b, null if either is missing or b is zero. */
export function ratio(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  const den = dec(b);
  if (den.isZero()) return null;
  return dec(a).div(den).toString();
}

/** Compound annual growth rate between two positive values over `years`. */
export function cagr(start: string | null, end: string | null, years: number): string | null {
  if (start === null || end === null || years <= 0) return null;
  const s = dec(start);
  const e = dec(end);
  if (s.lte(0) || e.lte(0)) return null;
  return e.div(s).pow(new D(1).div(years)).minus(1).toString();
}

export function sum(values: string[]): string {
  return values.reduce<Dec>((acc, v) => acc.plus(dec(v)), new D(0)).toString();
}
