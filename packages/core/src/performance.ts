import { D, dec, type Dec } from './decimal.js';
import { buildLedger, sortTransactions, type LedgerState, type Transaction } from './portfolio.js';

/**
 * Portfolio performance history. Replays the ledger day by day, values it at each
 * date's close, and chain-links daily returns into a time-weighted return (TWR).
 *
 * Two flow conventions, chosen per portfolio (documented in docs/CALCULATIONS.md):
 *  - cash-tracked (the portfolio has at least one DEPOSIT): value = holdings + cash;
 *    external flows are DEPOSIT (+) and WITHDRAWAL (-).
 *  - holdings-only (no DEPOSIT): cash is not modelled, so value = holdings; a BUY
 *    (cost incl. fee) is an inflow, a SELL (proceeds after fee) and a DIVIDEND are
 *    outflows paid to the investor, and a FEE is an inflow.
 *
 * A day whose value cannot be computed (missing price or FX rate) is null, never
 * zero. It breaks the chain: cumulative returns after it are null, because the
 * return across the gap is unknown, and the result counts the gap.
 */

export interface HistoryPoint {
  date: string;
  /** Portfolio value in base currency at the close; null if any component is missing. */
  value: string | null;
  /** External flow in base currency on this date (see conventions above). */
  flow: string;
  /** Cumulative TWR from the first complete date to this date; null when unavailable. */
  cumulativeReturn: string | null;
  missing: string[];
}

export interface PerformanceHistory {
  method: 'cash-tracked' | 'holdings-only';
  baseCurrency: string;
  points: HistoryPoint[];
  /** TWR over the whole window; null when any day in it could not be valued. */
  twr: string | null;
  /** Dates with no value, which break the TWR chain. */
  gaps: number;
}

/** Price lookup: close for `symbol` on `date` (or the latest close before it), in the instrument currency. */
export type PriceOn = (symbol: string, date: string) => string | null;
/** FX lookup: base-currency units per one unit of `ccy` on `date`. */
export type FxOn = (ccy: string, date: string) => string | null;

export function performanceHistory(
  transactions: Transaction[],
  dates: string[],
  priceOn: PriceOn,
  fxOn: FxOn,
  baseCurrency: string,
): PerformanceHistory {
  const base = baseCurrency.toUpperCase();
  const txs = sortTransactions(transactions);
  const method: PerformanceHistory['method'] = txs.some((t) => t.type === 'DEPOSIT') ? 'cash-tracked' : 'holdings-only';
  const toBase = (amount: Dec, ccy: string, date: string): Dec | null => {
    if (ccy.toUpperCase() === base) return amount;
    const r = fxOn(ccy.toUpperCase(), date);
    return r === null ? null : amount.times(dec(r));
  };

  const flowOf = (t: Transaction): Dec => {
    const amt = (v?: string) => (v ? dec(v) : new D(0));
    if (method === 'cash-tracked') {
      if (t.type === 'DEPOSIT') return amt(t.amount);
      if (t.type === 'WITHDRAWAL') return amt(t.amount).neg();
      return new D(0);
    }
    switch (t.type) {
      case 'BUY': return amt(t.quantity).times(amt(t.price)).plus(amt(t.fee));
      case 'SELL': return amt(t.quantity).times(amt(t.price)).minus(amt(t.fee)).neg();
      case 'DIVIDEND': return amt(t.amount).neg();
      case 'FEE': return amt(t.amount);
      case 'WITHDRAWAL': return amt(t.amount).neg();
      default: return new D(0);
    }
  };

  const points: HistoryPoint[] = [];
  // When the window starts after the first transaction, the chain opens at the first day's value;
  // otherwise it opens at zero and the first day's flows are the base.
  const opensEmpty = txs.length > 0 && dates.length > 0 && txs[0].date >= dates[0];
  let i = 0;
  let ledger: LedgerState = { positions: [], cash: {}, realizedPnl: {} };
  let prevValue: Dec | null = null;
  let growth: Dec | null = null; // null until the chain opens, or once it is broken
  let broken = false;
  let gaps = 0;

  for (const date of dates) {
    let flow = new D(0);
    const missing: string[] = [];
    const before = i;
    while (i < txs.length && txs[i].date <= date) {
      const t = txs[i];
      const f = flowOf(t);
      if (!f.isZero()) {
        const fb = toBase(f, t.currency, date);
        if (fb === null) missing.push(`${t.currency}/${base} FX for ${t.type} on ${t.date}`);
        else flow = flow.plus(fb);
      }
      i++;
    }
    if (i === 0) {
      // Nothing recorded yet: no value and no return, and not a gap.
      points.push({ date, value: null, flow: '0', cumulativeReturn: null, missing: [] });
      continue;
    }
    if (i !== before) ledger = buildLedger(txs.slice(0, i));

    let value = new D(0);
    for (const p of ledger.positions) {
      const q = dec(p.quantity);
      if (q.isZero()) continue;
      const px = priceOn(p.symbol, date);
      if (px === null) { missing.push(`${p.symbol} price`); continue; }
      const mv = toBase(q.times(dec(px)), p.currency, date);
      if (mv === null) missing.push(`${p.currency}/${base} FX`);
      else value = value.plus(mv);
    }
    if (method === 'cash-tracked') {
      for (const [ccy, amt] of Object.entries(ledger.cash)) {
        const b = toBase(dec(amt), ccy, date);
        if (b === null) missing.push(`${ccy}/${base} FX`);
        else value = value.plus(b);
      }
    }

    if (missing.length) {
      gaps++;
      broken = true;
      growth = null;
      points.push({ date, value: null, flow: flow.toString(), cumulativeReturn: null, missing });
      continue;
    }
    if (!broken) {
      if (prevValue === null) {
        if (opensEmpty) growth = flow.gt(0) ? value.div(flow) : null;
        else growth = new D(1);
      } else if (growth !== null) {
        const b = prevValue.plus(flow);
        growth = b.gt(0) ? growth.times(value.div(b)) : null;
      }
    }
    prevValue = value;
    points.push({ date, value: value.toString(), flow: flow.toString(), cumulativeReturn: growth === null ? null : growth.minus(1).toString(), missing });
  }

  const last = [...points].reverse().find((p) => p.value !== null);
  return { method, baseCurrency: base, points, twr: !broken && last ? last.cumulativeReturn : null, gaps };
}

/** Benchmark cumulative return over the same dates, from closes (carried forward by the lookup). */
export function benchmarkReturns(dates: string[], closeOn: (date: string) => string | null): (string | null)[] {
  let first: Dec | null = null;
  return dates.map((d) => {
    const c = closeOn(d);
    if (c === null) return null;
    if (first === null) first = dec(c);
    return first.isZero() ? null : dec(c).div(first).minus(1).toString();
  });
}

/** Lookup that returns the latest value on or before `date`, at most `maxStaleDays` calendar days old. */
export function asOfLookup(series: { date: string; value: string }[], maxStaleDays = 7): (date: string) => string | null {
  const s = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  return (date: string) => {
    let lo = 0, hi = s.length - 1, hit = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].date <= date) { hit = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (hit < 0) return null;
    const age = (Date.parse(date) - Date.parse(s[hit].date)) / 86_400_000;
    return age <= maxStaleDays ? s[hit].value : null;
  };
}
