import { asOfLookup, benchmarkReturns, buildLedger, performanceHistory, type HistoryRange, type Provenance, type Transaction } from '@atlas/core';
import { rangeStart } from './providers/types.js';
import type { DataService } from './providers/service.js';

const RANGE_DAYS: Record<string, number> = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '5Y': 1827, MAX: 3660 };

/**
 * Daily value and time-weighted return for a portfolio over `range`, with an optional
 * benchmark. Every price and FX series used is listed with its provenance; anything
 * unavailable is reported, never filled in.
 */
export async function portfolioHistory(data: DataService, txs: Transaction[], baseCurrency: string, range: HistoryRange, benchmark: string | null) {
  const ledger = buildLedger(txs);
  const symbols = ledger.positions.map((p) => p.symbol);
  const currencies = [...new Set([...ledger.positions.map((p) => p.currency), ...txs.map((t) => t.currency.toUpperCase())])].filter((c) => c !== baseCurrency);
  const sources: { item: string; provenance: Provenance }[] = [];
  const unavailable: { item: string; reason: string }[] = [];

  const series = async (sym: string) => {
    const r = await data.call('history', (p) => p.history?.(sym, range));
    if (r.status !== 'ok') { unavailable.push({ item: sym, reason: r.reason }); return null; }
    sources.push({ item: sym, provenance: r.provenance });
    return r.data;
  };
  const [bars, benchBars, fx] = await Promise.all([
    Promise.all(symbols.map(async (s) => [s, await series(s)] as const)),
    benchmark ? series(benchmark) : Promise.resolve(null),
    Promise.all(currencies.map(async (c) => {
      const r = await data.call('fx', (p) => p.fxHistory?.(c, baseCurrency, RANGE_DAYS[range] ?? 366));
      if (r.status !== 'ok') { unavailable.push({ item: `${c}/${baseCurrency}`, reason: r.reason }); return [c, null] as const; }
      sources.push({ item: `${c}/${baseCurrency}`, provenance: r.provenance });
      return [c, r.data] as const;
    })),
  ]);

  const priceLookups = new Map(bars.map(([s, b]) => [s, b ? asOfLookup(b.map((x) => ({ date: x.date, value: String(x.close) }))) : () => null]));
  const fxLookups = new Map(fx.map(([c, d]) => [c, d ? asOfLookup(d.map((x) => ({ date: x.date, value: String(x.rate) }))) : () => null]));

  // Dates: every session any series has, from the range start (or the first transaction) to the latest data.
  const all = new Set<string>();
  for (const [, b] of bars) for (const x of b ?? []) all.add(x.date);
  for (const x of benchBars ?? []) all.add(x.date);
  let dates = [...all].sort();
  const latest = dates.at(-1);
  const start = latest ? rangeStart(range, new Date(latest)) : null;
  const firstTx = txs.map((t) => t.date).sort()[0];
  const from = [start ? start.toISOString().slice(0, 10) : '', firstTx ?? ''].sort().at(-1)!;
  dates = dates.filter((d) => d >= from);

  const history = performanceHistory(txs, dates, (s, d) => priceLookups.get(s)?.(d) ?? null, (c, d) => fxLookups.get(c)?.(d) ?? null, baseCurrency);
  const benchLookup = benchBars ? asOfLookup(benchBars.map((x) => ({ date: x.date, value: String(x.close) }))) : null;
  return {
    ...history,
    range,
    benchmark: benchmark && benchLookup ? { symbol: benchmark, returns: benchmarkReturns(dates, benchLookup) } : null,
    sources,
    unavailable,
  };
}
