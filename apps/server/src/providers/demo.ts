import { D, type Bar, type CompanyProfile, type FundamentalLine, type FundamentalPoint, type Fundamentals, type FxRate, type HistoryRange, type MacroSeries, type Provenance, type ProviderResult, type Quote, type SymbolMatch, type YieldCurve } from '@atlas/core';
import { LINES } from './lines.js';
import { rangeStart, unavailable, type MacroCatalogEntry, type Provider, type ProviderInfo } from './types.js';

/**
 * Demo mode: a deterministic, entirely synthetic market of fictional companies.
 * Nothing here is real. Tickers and names are invented, every response is
 * labelled "synthetic", and demo mode never serves filings or news because
 * fabricated documents and headlines would be indistinguishable from real ones.
 */

interface DemoCompany {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
  exchange: string;
  startPrice: number;
  drift: number; // annual
  vol: number; // annual
  revenue0: number; // first fiscal year revenue
  growth: number;
  netMargin: number;
  shares: number;
  payout: number;
  leverage: number; // debt / equity
}

export const DEMO_COMPANIES: DemoCompany[] = [
  { symbol: 'NOVA', name: 'Novacore Systems (Demo)', sector: 'Technology', industry: 'Enterprise Software', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 84, drift: 0.18, vol: 0.32, revenue0: 8.2e9, growth: 0.17, netMargin: 0.24, shares: 1.1e9, payout: 0, leverage: 0.3 },
  { symbol: 'QBIT', name: 'Quantabit Semiconductor (Demo)', sector: 'Technology', industry: 'Semiconductors', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 42, drift: 0.25, vol: 0.45, revenue0: 5.1e9, growth: 0.26, netMargin: 0.19, shares: 2.4e9, payout: 0.05, leverage: 0.2 },
  { symbol: 'HLXM', name: 'Helixmed Therapeutics (Demo)', sector: 'Health Care', industry: 'Biotechnology', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 61, drift: 0.04, vol: 0.38, revenue0: 2.3e9, growth: 0.08, netMargin: -0.06, shares: 4.1e8, payout: 0, leverage: 0.5 },
  { symbol: 'MRDN', name: 'Meridian Care Group (Demo)', sector: 'Health Care', industry: 'Health Care Providers', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 118, drift: 0.07, vol: 0.2, revenue0: 31e9, growth: 0.05, netMargin: 0.06, shares: 6.2e8, payout: 0.35, leverage: 0.8 },
  { symbol: 'ORBT', name: 'Orbital Freight Lines (Demo)', sector: 'Industrials', industry: 'Logistics', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 37, drift: 0.05, vol: 0.28, revenue0: 12.4e9, growth: 0.04, netMargin: 0.07, shares: 3.3e8, payout: 0.3, leverage: 1.1 },
  { symbol: 'KSTL', name: 'Kestrel Aerospace (Demo)', sector: 'Industrials', industry: 'Aerospace & Defense', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 152, drift: 0.09, vol: 0.24, revenue0: 19e9, growth: 0.06, netMargin: 0.09, shares: 2.8e8, payout: 0.4, leverage: 0.9 },
  { symbol: 'PNRG', name: 'Pinegrove Energy (Demo)', sector: 'Energy', industry: 'Integrated Oil & Gas', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 55, drift: 0.03, vol: 0.33, revenue0: 44e9, growth: 0.02, netMargin: 0.1, shares: 1.6e9, payout: 0.5, leverage: 0.4 },
  { symbol: 'TDWL', name: 'Tidewell Power & Light (Demo)', sector: 'Utilities', industry: 'Electric Utilities', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 64, drift: 0.04, vol: 0.16, revenue0: 9.8e9, growth: 0.03, netMargin: 0.12, shares: 5.1e8, payout: 0.65, leverage: 1.6 },
  { symbol: 'BRKV', name: 'Brookvale Bancorp (Demo)', sector: 'Financials', industry: 'Regional Banks', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 48, drift: 0.05, vol: 0.27, revenue0: 7.4e9, growth: 0.04, netMargin: 0.22, shares: 7.5e8, payout: 0.38, leverage: 1.2 },
  { symbol: 'LDGR', name: 'Ledgerline Payments (Demo)', sector: 'Financials', industry: 'Payments', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 210, drift: 0.12, vol: 0.26, revenue0: 14e9, growth: 0.11, netMargin: 0.29, shares: 4.4e8, payout: 0.15, leverage: 0.5 },
  { symbol: 'CRVN', name: 'Caravan Outfitters (Demo)', sector: 'Consumer Discretionary', industry: 'Specialty Retail', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 29, drift: 0.02, vol: 0.36, revenue0: 6.6e9, growth: 0.03, netMargin: 0.04, shares: 2.2e8, payout: 0, leverage: 1.4 },
  { symbol: 'FFDS', name: 'Freshfield Foods (Demo)', sector: 'Consumer Staples', industry: 'Packaged Foods', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 73, drift: 0.04, vol: 0.15, revenue0: 17e9, growth: 0.025, netMargin: 0.09, shares: 5.8e8, payout: 0.6, leverage: 0.9 },
  { symbol: 'STLW', name: 'Stillwater Materials (Demo)', sector: 'Materials', industry: 'Specialty Chemicals', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 96, drift: 0.06, vol: 0.25, revenue0: 11e9, growth: 0.04, netMargin: 0.11, shares: 2.6e8, payout: 0.33, leverage: 0.7 },
  { symbol: 'ATRM', name: 'Atrium Realty Trust (Demo)', sector: 'Real Estate', industry: 'REIT - Office', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 34, drift: -0.02, vol: 0.29, revenue0: 2.1e9, growth: 0.01, netMargin: 0.18, shares: 3.9e8, payout: 0.9, leverage: 1.9 },
  { symbol: 'SGNL', name: 'Signalwave Media (Demo)', sector: 'Communication Services', industry: 'Interactive Media', country: 'US', currency: 'USD', exchange: 'DEMO-X', startPrice: 132, drift: 0.14, vol: 0.34, revenue0: 26e9, growth: 0.13, netMargin: 0.21, shares: 1.3e9, payout: 0, leverage: 0.2 },
  { symbol: 'EURX', name: 'Eurolux Industrie AG (Demo)', sector: 'Industrials', industry: 'Machinery', country: 'DE', currency: 'EUR', exchange: 'DEMO-EU', startPrice: 88, drift: 0.05, vol: 0.22, revenue0: 15e9, growth: 0.035, netMargin: 0.08, shares: 3.1e8, payout: 0.4, leverage: 0.8 },
];

export const DEMO_INDICES = [
  { symbol: 'DM500', name: 'Demo 500 Index', startPrice: 3800, drift: 0.09, vol: 0.17 },
  { symbol: 'DMTECH', name: 'Demo Tech 100', startPrice: 11000, drift: 0.14, vol: 0.24 },
  { symbol: 'DMSML', name: 'Demo Small Cap 2000', startPrice: 1700, drift: 0.05, vol: 0.23 },
  { symbol: 'DMEUR', name: 'Demo Europe 50', startPrice: 3600, drift: 0.05, vol: 0.18 },
  { symbol: 'DMGOLD', name: 'Demo Gold (USD/oz)', startPrice: 1550, drift: 0.09, vol: 0.15 },
  { symbol: 'DMOIL', name: 'Demo Crude (USD/bbl)', startPrice: 61, drift: 0.02, vol: 0.38 },
  { symbol: 'DMBTC', name: 'Demo Bitcoin (USD)', startPrice: 7200, drift: 0.45, vol: 0.7 },
];

const DEMO_FX: Record<string, number> = { EUR: 0.92, GBP: 0.79, JPY: 149, CHF: 0.88, CAD: 1.36, AUD: 1.52, CNY: 7.2, INR: 83, IDR: 15600, SGD: 1.35, HKD: 7.8, MXN: 17.5 };

const EPOCH = Date.UTC(2020, 0, 1);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Last completed weekday session on or before `now`. Demo sessions "close" at 21:00 UTC. */
function lastSession(now: Date): number {
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (now.getUTCHours() < 21) t -= 86400000;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= 86400000;
  return t;
}

const seriesCache = new Map<string, Bar[]>();

function generateBars(symbol: string, start: number, drift: number, vol: number, now: Date): Bar[] {
  const end = lastSession(now);
  const key = `${symbol}:${end}`;
  const cached = seriesCache.get(key);
  if (cached) return cached;
  const r = rng(hash(symbol));
  const dt = 1 / 252;
  const bars: Bar[] = [];
  let close = start;
  for (let t = EPOCH; t <= end; t += 86400000) {
    if ([0, 6].includes(new Date(t).getUTCDay())) continue;
    const open = close * (1 + gauss(r) * vol * 0.15 * Math.sqrt(dt));
    close = open * Math.exp((drift - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * gauss(r));
    const hi = Math.max(open, close) * (1 + Math.abs(gauss(r)) * vol * 0.3 * Math.sqrt(dt));
    const lo = Math.min(open, close) * (1 - Math.abs(gauss(r)) * vol * 0.3 * Math.sqrt(dt));
    const volume = Math.round((2e6 + r() * 6e6) * (1 + Math.abs(gauss(r)) * 0.5));
    bars.push({ date: iso(t), open: round(open), high: round(hi), low: round(lo), close: round(close), volume });
  }
  seriesCache.set(key, bars);
  return bars;
}

const ccyOf = (c: object): string => (c as { currency?: string }).currency ?? 'USD';

const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

export class DemoProvider implements Provider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  info(): ProviderInfo {
    return {
      id: 'demo',
      name: 'Atlas Demo (synthetic)',
      homepage: '',
      terms: 'Synthetic data generated locally for demonstration. Fictional companies; not market data.',
      requiresKey: false,
      configured: true,
      capabilities: ['search', 'profile', 'quote', 'history', 'fundamentals', 'macro', 'fx', 'rates'],
    };
  }

  private prov(asOf: string | null, extra: Partial<Provenance> = {}): Provenance {
    return { provider: 'demo', providerName: 'Atlas Demo', asOf, fetchedAt: this.now().toISOString(), timeliness: 'synthetic', ...extra };
  }

  private find(symbol: string) {
    const s = symbol.toUpperCase();
    return DEMO_COMPANIES.find((c) => c.symbol === s) ?? DEMO_INDICES.find((c) => c.symbol === s);
  }

  private bars(symbol: string): Bar[] | null {
    const c = this.find(symbol);
    return c ? generateBars(c.symbol, c.startPrice, c.drift, c.vol, this.now()) : null;
  }

  universe() {
    return DEMO_COMPANIES;
  }

  async search(query: string): Promise<ProviderResult<SymbolMatch[]>> {
    const q = query.toUpperCase();
    const all = [...DEMO_COMPANIES, ...DEMO_INDICES];
    const data = all
      .filter((c) => c.symbol.startsWith(q) || c.name.toUpperCase().includes(q))
      .sort((a, b) => Number(b.symbol.startsWith(q)) - Number(a.symbol.startsWith(q)))
      .slice(0, 10)
      .map((c) => ({ symbol: c.symbol, name: c.name }));
    return { status: 'ok', data, provenance: this.prov(null) };
  }

  async profile(symbol: string): Promise<ProviderResult<CompanyProfile>> {
    const c = DEMO_COMPANIES.find((x) => x.symbol === symbol.toUpperCase());
    if (!c) {
      const idx = DEMO_INDICES.find((x) => x.symbol === symbol.toUpperCase());
      if (idx) return { status: 'ok', data: { symbol: idx.symbol, name: idx.name, sector: 'Index / Benchmark' }, provenance: this.prov(null) };
      return unavailable('demo', `${symbol.toUpperCase()} is not in the demo universe. Demo mode only has fictional companies; switch to live mode for real securities.`);
    }
    return {
      status: 'ok',
      data: {
        symbol: c.symbol, name: c.name, exchange: c.exchange, sector: c.sector, industry: c.industry, fiscalYearEnd: '1231',
        description: `${c.name} is a fictional ${c.industry.toLowerCase()} company used by Atlas demo mode. All figures are synthetic.`,
      },
      provenance: this.prov(null),
    };
  }

  async quote(symbol: string): Promise<ProviderResult<Quote>> {
    const bars = this.bars(symbol);
    if (!bars || bars.length < 2) return unavailable('demo', `${symbol.toUpperCase()} is not in the demo universe.`);
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const c = this.find(symbol)!;
    const price = new D(last.close);
    const change = price.minus(prev.close);
    const currency = ccyOf(c);
    return {
      status: 'ok',
      data: {
        symbol: c.symbol, name: c.name, price: price.toFixed(2), previousClose: new D(prev.close).toFixed(2),
        change: change.toFixed(2), changePercent: change.div(prev.close).times(100).toFixed(2),
        open: last.open.toFixed(2), high: last.high.toFixed(2), low: last.low.toFixed(2), volume: last.volume,
        currency, sessionDate: last.date,
      },
      provenance: this.prov(last.date, { currency }),
    };
  }

  async history(symbol: string, range: HistoryRange): Promise<ProviderResult<Bar[]>> {
    const bars = this.bars(symbol);
    if (!bars) return unavailable('demo', `${symbol.toUpperCase()} is not in the demo universe.`);
    const start = rangeStart(range, new Date(bars[bars.length - 1].date));
    const data = start ? bars.filter((b) => b.date >= iso(start.getTime())) : bars;
    const c = this.find(symbol)!;
    return { status: 'ok', data, provenance: this.prov(data.at(-1)?.date ?? null, { currency: ccyOf(c) }) };
  }

  async fundamentals(symbol: string): Promise<ProviderResult<Fundamentals>> {
    const c = DEMO_COMPANIES.find((x) => x.symbol === symbol.toUpperCase());
    if (!c) return unavailable('demo', `No demo fundamentals for ${symbol.toUpperCase()}.`);
    const r = rng(hash(c.symbol + ':fa'));
    const lastFy = new Date(lastSession(this.now())).getUTCFullYear() - 1;
    const years = [lastFy - 4, lastFy - 3, lastFy - 2, lastFy - 1, lastFy];
    const perYear = years.map((fy, i) => {
      const revenue = c.revenue0 * (1 + c.growth) ** i * (1 + (r() - 0.5) * 0.04);
      const margin = c.netMargin + (r() - 0.5) * 0.03;
      const net = revenue * margin;
      const shares = c.shares * (1 - 0.01 * i);
      const equity = revenue * 0.6;
      const debt = equity * c.leverage;
      return {
        fy,
        values: {
          revenue, grossProfit: revenue * (0.35 + c.netMargin), operatingIncome: revenue * (margin + 0.05), netIncome: net,
          epsDiluted: net / shares, operatingCashFlow: net * 1.25 + revenue * 0.03, capex: revenue * 0.05,
          dividendsPerShare: Math.max(0, (net / shares) * c.payout), cash: revenue * 0.15, totalAssets: equity + debt + revenue * 0.3,
          totalLiabilities: debt + revenue * 0.3, longTermDebt: debt, equity, sharesOutstanding: shares,
        } as Record<string, number>,
      };
    });
    const lines: FundamentalLine[] = LINES.map((l) => ({
      key: l.key, label: l.label, concept: 'demo:' + l.key,
      annual: perYear.map(({ fy, values }): FundamentalPoint => ({
        end: `${fy}-12-31`, start: l.kind === 'duration' ? `${fy}-01-01` : undefined,
        value: l.unit === 'USD/shares' ? values[l.key].toFixed(2) : Math.round(values[l.key]).toString(),
        unit: l.unit, fiscalYear: fy, fiscalPeriod: 'FY', form: 'DEMO', filed: `${fy + 1}-02-15`, accessionNumber: 'demo',
      })),
      quarterly: [],
    }));
    return { status: 'ok', data: { symbol: c.symbol, cik: 'demo', entityName: c.name, lines }, provenance: this.prov(`${lastFy}-12-31`, { currency: c.currency }) };
  }

  macroCatalog(): MacroCatalogEntry[] {
    return DEMO_MACRO.map(({ id, title, region, category }) => ({ id, title, region, category }));
  }

  async macroSeries(id: string): Promise<ProviderResult<MacroSeries>> {
    const def = DEMO_MACRO.find((m) => m.id === id.toUpperCase());
    if (!def) return unavailable('demo', `No demo series ${id}`);
    const r = rng(hash('macro:' + def.id));
    const end = new Date(lastSession(this.now()));
    const obs: { date: string; value: number | null }[] = [];
    let v = def.start;
    const stepMonths = def.frequency === 'Quarterly' ? 3 : 1;
    for (let d = new Date(Date.UTC(2015, 0, 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + stepMonths)) {
      v = def.walk(v, r);
      obs.push({ date: iso(d.getTime()), value: round(v, 2) });
    }
    obs.pop(); // the current period has not been "released" yet
    return {
      status: 'ok',
      data: { id: def.id, title: def.title + ' (synthetic)', region: def.region, frequency: def.frequency, units: def.units, lastUpdated: obs.at(-1)?.date ?? null, observations: obs },
      provenance: this.prov(obs.at(-1)?.date ?? null, { unit: def.units }),
    };
  }

  async fxRates(base: string): Promise<ProviderResult<FxRate[]>> {
    const b = base.toUpperCase();
    const perUsd: Record<string, number> = { USD: 1, ...DEMO_FX };
    if (!perUsd[b]) return unavailable('demo', `No demo rates for base ${b}`);
    const date = iso(lastSession(this.now()));
    const jitter = rng(hash('fx' + date));
    const data = Object.entries(perUsd)
      .filter(([q]) => q !== b)
      .map(([q, v]) => ({ base: b, quote: q, rate: new D(v).div(perUsd[b]).times(1 + (jitter() - 0.5) * 0.01).toSignificantDigits(6).toString(), date }));
    return { status: 'ok', data, provenance: this.prov(date) };
  }

  async fxHistory(base: string, quote: string, days: number): Promise<ProviderResult<{ date: string; rate: number }[]>> {
    const perUsd: Record<string, number> = { USD: 1, ...DEMO_FX };
    const b = base.toUpperCase(), q = quote.toUpperCase();
    if (!perUsd[b] || !perUsd[q]) return unavailable('demo', `No demo rates for ${b}/${q}`);
    const bars = generateBars(`FX${b}${q}`, perUsd[q] / perUsd[b], 0, 0.08, this.now());
    const data = bars.slice(-Math.round((days * 5) / 7)).map((x) => ({ date: x.date, rate: Number(x.close.toPrecision(6)) }));
    return { status: 'ok', data, provenance: this.prov(data.at(-1)?.date ?? null) };
  }

  async yieldCurve(): Promise<ProviderResult<YieldCurve>> {
    const date = iso(lastSession(this.now()));
    const r = rng(hash('yc' + date));
    const tenors: [string, number][] = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['2Y', 24], ['5Y', 60], ['10Y', 120], ['30Y', 360]];
    const points = tenors.map(([tenor, months]) => ({ tenor, months, yieldPct: round(4.4 - 0.45 * Math.log1p(months / 12) + 0.25 * Math.log1p(months / 60) + (r() - 0.5) * 0.04, 2) }));
    return { status: 'ok', data: { date, country: 'Demo', points }, provenance: this.prov(date, { unit: 'percent' }) };
  }
}

const DEMO_MACRO = [
  { id: 'CPIAUCSL', title: 'Consumer Price Index', region: 'Demo economy', category: 'Inflation' as const, frequency: 'Monthly', units: 'Index 1982-1984=100', start: 237, walk: (v: number, r: () => number) => v * (1 + 0.0025 + (r() - 0.5) * 0.003) },
  { id: 'UNRATE', title: 'Unemployment Rate', region: 'Demo economy', category: 'Employment' as const, frequency: 'Monthly', units: 'Percent', start: 5.6, walk: (v: number, r: () => number) => Math.min(12, Math.max(3.2, v + (r() - 0.52) * 0.25)) },
  { id: 'GDPC1', title: 'Real GDP', region: 'Demo economy', category: 'Growth' as const, frequency: 'Quarterly', units: 'Billions of chained dollars, SAAR', start: 18000, walk: (v: number, r: () => number) => v * (1 + 0.005 + (r() - 0.5) * 0.012) },
  { id: 'FEDFUNDS', title: 'Policy Rate', region: 'Demo economy', category: 'Rates' as const, frequency: 'Monthly', units: 'Percent', start: 0.25, walk: (v: number, r: () => number) => Math.min(6, Math.max(0.05, v + (r() < 0.12 ? 0.25 : r() < 0.06 ? -0.25 : 0))) },
  { id: 'DGS10', title: '10-Year Government Yield', region: 'Demo economy', category: 'Rates' as const, frequency: 'Monthly', units: 'Percent', start: 2.1, walk: (v: number, r: () => number) => Math.min(6, Math.max(0.5, v + (r() - 0.48) * 0.2)) },
];
