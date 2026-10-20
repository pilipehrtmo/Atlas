import { D, ratio, simpleReturn, type Provenance, type ProviderResult, type Quote } from '@atlas/core';
import { DEMO_COMPANIES, DEMO_INDICES } from './providers/demo.js';
import type { DataService } from './providers/service.js';

type QuoteRow = { symbol: string; name: string; result: ProviderResult<Quote> };

/** Live-mode benchmarks are ETFs used as proxies, and are labelled that way, because index levels need an index-data license. */
const LIVE_BENCHMARKS = [
  { symbol: 'SPY', name: 'S&P 500 proxy (SPY ETF)' },
  { symbol: 'QQQ', name: 'Nasdaq-100 proxy (QQQ ETF)' },
  { symbol: 'IWM', name: 'Russell 2000 proxy (IWM ETF)' },
  { symbol: 'GLD', name: 'Gold proxy (GLD ETF)' },
];

/** Live movers are computed over this fixed list of large US companies, not the whole market, and say so. */
export const LIVE_LARGE_CAPS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'BRK.B', 'AVGO', 'TSLA', 'JPM',
  'LLY', 'V', 'XOM', 'UNH', 'MA', 'COST', 'WMT', 'NFLX', 'ORCL', 'AMD',
];
/** Sector performance in live mode uses the Select Sector SPDR ETFs as proxies. */
const LIVE_SECTOR_ETFS: [string, string][] = [
  ['XLK', 'Technology'], ['XLC', 'Communication Services'], ['XLY', 'Consumer Discretionary'], ['XLP', 'Consumer Staples'],
  ['XLE', 'Energy'], ['XLF', 'Financials'], ['XLV', 'Health Care'], ['XLI', 'Industrials'], ['XLB', 'Materials'],
  ['XLRE', 'Real Estate'], ['XLU', 'Utilities'],
];

export async function marketOverview(data: DataService) {
  const benchmarks = data.mode === 'demo' ? DEMO_INDICES : LIVE_BENCHMARKS;
  const quotes: QuoteRow[] = await Promise.all(
    benchmarks.map(async (b) => ({ symbol: b.symbol, name: b.name, result: await data.call('quote', (p) => p.quote?.(b.symbol)) })),
  );
  const [fx, curve] = await Promise.all([data.call('fx', (p) => p.fxRates?.('USD')), data.call('rates', (p) => p.yieldCurve?.())]);

  let movers: { gainers: QuoteRow[]; losers: QuoteRow[]; provenance: Provenance | null } | { unavailable: string } = {
    unavailable: 'Market movers need a market-wide quote feed. None is configured in live mode yet.',
  };
  let sectors: { sector: string; changePercent: string; members: number }[] | { unavailable: string } = {
    unavailable: 'Sector performance needs a market-wide quote feed or sector index data.',
  };
  if (data.mode === 'demo') {
    const rows: QuoteRow[] = await Promise.all(DEMO_COMPANIES.map(async (c) => ({ symbol: c.symbol, name: c.name, result: await data.call('quote', (p) => p.quote?.(c.symbol)) })));
    const ok = rows.filter((r) => r.result.status === 'ok') as (QuoteRow & { result: { status: 'ok'; data: Quote; provenance: Provenance } })[];
    const sorted = [...ok].sort((a, b) => Number(b.result.data.changePercent) - Number(a.result.data.changePercent));
    movers = { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse(), provenance: ok[0]?.result.provenance ?? null };
    const bySector = new Map<string, string[]>();
    for (const r of ok) {
      const s = DEMO_COMPANIES.find((c) => c.symbol === r.symbol)!.sector;
      bySector.set(s, [...(bySector.get(s) ?? []), r.result.data.changePercent!]);
    }
    sectors = [...bySector.entries()]
      .map(([sector, v]) => ({ sector, members: v.length, changePercent: v.reduce((a, x) => a.plus(x), new D(0)).div(v.length).toFixed(2) }))
      .sort((a, b) => Number(b.changePercent) - Number(a.changePercent));
  }
  let sectorMethod = 'Equal-weighted average of constituent daily % change';
  if (data.mode === 'live' && data.routes.quote) {
    const quoteRows = (list: [string, string][]) => Promise.all(list.map(async ([symbol, name]) => ({ symbol, name, result: await data.call('quote', (p) => p.quote?.(symbol)) })));
    const [caps, etfs] = await Promise.all([quoteRows(LIVE_LARGE_CAPS.map((s) => [s, s])), quoteRows(LIVE_SECTOR_ETFS)]);
    const okCaps = caps.filter((r) => r.result.status === 'ok' && r.result.data.changePercent !== null) as (QuoteRow & { result: { status: 'ok'; data: Quote; provenance: Provenance } })[];
    if (okCaps.length >= 5) {
      const sorted = [...okCaps].sort((a, b) => Number(b.result.data.changePercent) - Number(a.result.data.changePercent));
      movers = { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse(), provenance: okCaps[0].result.provenance };
    } else if (caps[0]?.result.status === 'unavailable') movers = { unavailable: caps[0].result.reason };
    const okEtfs = etfs.filter((r) => r.result.status === 'ok' && r.result.data.changePercent !== null) as (QuoteRow & { result: { status: 'ok'; data: Quote } })[];
    if (okEtfs.length) {
      sectors = okEtfs.map((r) => ({ sector: `${r.name} (${r.symbol})`, members: 1, changePercent: r.result.data.changePercent! })).sort((a, b) => Number(b.changePercent) - Number(a.changePercent));
      sectorMethod = 'Daily % change of the Select Sector SPDR ETF for each sector (a proxy, not the index itself)';
    }
  }
  return { mode: data.mode, benchmarks: quotes, movers, sectors, sectorMethod, fx, curve, moversUniverse: data.mode === 'live' ? `${LIVE_LARGE_CAPS.length} large US companies` : 'demo universe' };
}

/** Screener rows. Demo mode computes metrics over the fictional universe; live mode is not implemented yet. */
export async function screenerUniverse(data: DataService) {
  if (data.mode !== 'demo' || !data.demo) {
    return { status: 'unavailable' as const, reason: 'The live screener needs market-wide fundamentals and prices. Planned: SEC XBRL frames for fundamentals plus a licensed price feed.' };
  }
  const demo = data.demo;
  const rows = await Promise.all(
    DEMO_COMPANIES.map(async (c) => {
      const [q, h, f] = await Promise.all([demo.quote(c.symbol), demo.history(c.symbol, '1Y'), demo.fundamentals(c.symbol)]);
      if (q.status !== 'ok' || h.status !== 'ok' || f.status !== 'ok') return null;
      const line = (k: string) => f.data.lines.find((l) => l.key === k)?.annual ?? [];
      const last = (k: string) => line(k).at(-1)?.value ?? null;
      const prev = (k: string) => line(k).at(-2)?.value ?? null;
      const price = q.data.price;
      const shares = last('sharesOutstanding');
      const eps = last('epsDiluted');
      const marketCap = shares ? new D(price).times(shares).toString() : null;
      const pe = eps && new D(eps).gt(0) ? new D(price).div(eps).toString() : null;
      const vols = h.data.slice(-30).map((b) => b.volume ?? 0);
      return {
        symbol: c.symbol, name: c.name, sector: c.sector, country: c.country, currency: c.currency,
        price: Number(price), changePercent: Number(q.data.changePercent),
        marketCap: marketCap ? Number(marketCap) : null,
        pe: pe ? Number(pe) : null,
        revenueGrowth: num(simpleReturn(prev('revenue'), last('revenue'))),
        netMargin: num(ratio(last('netIncome'), last('revenue'))),
        debtToEquity: num(ratio(last('longTermDebt'), last('equity'))),
        dividendYield: num(ratio(last('dividendsPerShare'), price)),
        return1Y: num(simpleReturn(String(h.data[0].close), price)),
        avgVolume30: vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : null,
        fiscalYear: line('revenue').at(-1)?.fiscalYear ?? null,
      };
    }),
  );
  return {
    status: 'ok' as const,
    rows: rows.filter(Boolean),
    provenance: { provider: 'demo', providerName: 'Atlas Demo', asOf: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString(), timeliness: 'synthetic' as const },
    definitions: {
      pe: 'Price / latest fiscal-year diluted EPS. Blank when EPS is not positive.',
      revenueGrowth: 'Latest fiscal-year revenue vs prior fiscal year.',
      netMargin: 'Net income / revenue, latest fiscal year.',
      debtToEquity: 'Long-term debt / stockholders\' equity, latest fiscal year end.',
      dividendYield: 'Latest fiscal-year declared dividends per share / current price.',
      return1Y: 'Price return over the last year, not dividend-adjusted.',
    },
  };
}

const num = (s: string | null) => (s === null ? null : Number(s));
