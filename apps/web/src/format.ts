/** Display formatting. Every formatter renders missing values as an explicit "n/a"; nothing becomes 0. */
export const NA = 'n/a';

const toNum = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

export function fmtNum(v: string | number | null | undefined, digits = 2): string {
  const n = toNum(v);
  if (n === null || !Number.isFinite(n)) return NA;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: string | number | null | undefined, digits = 2, isFraction = false, signed = true): string {
  let n = toNum(v);
  if (n === null || !Number.isFinite(n)) return NA;
  if (isFraction) n *= 100;
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function fmtSigned(v: string | number | null | undefined, digits = 2): string {
  const n = toNum(v);
  if (n === null || !Number.isFinite(n)) return NA;
  return `${n > 0 ? '+' : ''}${fmtNum(n, digits)}`;
}

/** Compact money/size: 1.23T, 456.7B, 12.3M, 45.6K. */
export function fmtCompact(v: string | number | null | undefined, digits = 2): string {
  const n = toNum(v);
  if (n === null || !Number.isFinite(n)) return NA;
  const a = Math.abs(n);
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  return `${(n / d).toFixed(s ? digits : 0)}${s}`;
}

export function fmtInt(v: string | number | null | undefined): string {
  const n = toNum(v);
  if (n === null || !Number.isFinite(n)) return NA;
  return Math.round(n).toLocaleString('en-US');
}

export const tone = (v: string | number | null | undefined) => {
  const n = toNum(v);
  return n === null || n === 0 ? '' : n > 0 ? 'up' : 'down';
};

export function ageDays(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}
