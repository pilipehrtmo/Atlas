import Decimal from 'decimal.js';

/** Isolated Decimal constructor so Atlas settings never leak into other users of decimal.js. */
export const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = InstanceType<typeof D>;

export function dec(v: string | number | Dec): Dec {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new RangeError(`Not a finite number: ${v}`);
  return new D(v);
}

/** Parses a provider string; returns null for empty, ".", "None", "-", or non-numeric values. */
export function parseDecimal(v: unknown): Dec | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? new D(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/,/g, '').replace(/%$/, '');
  if (s === '' || s === '.' || s === '-' || /^(none|null|n\/a|nan)$/i.test(s)) return null;
  try {
    const d = new D(s);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function toFixedOrNull(d: Dec | null, places: number): string | null {
  return d === null ? null : d.toFixed(places);
}
