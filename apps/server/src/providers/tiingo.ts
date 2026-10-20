import { parseDecimal, type Bar, type HistoryRange, type ProviderResult, type Quote, type SymbolMatch } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { DailyQuota, fetchJson, ProviderError, RateLimiter } from '../lib/http.js';
import { rangeStart, unavailable, type Provider, type ProviderInfo } from './types.js';

/** Tiingo. Free key; end-of-day prices for US stocks and ETFs. Free-plan limits as published at time of
 * writing (check tiingo.com/about/pricing): about 1,000 requests/day, 50/hour and 500 unique symbols/month,
 * personal use only. Atlas fetches five years of daily bars per symbol once and serves every range and the
 * quote from that, so each symbol costs about one request per refresh. Quotes are the latest close: end of day. */
const ID = 'tiingo';
const NAME = 'Tiingo';
const BASE = 'https://api.tiingo.com';
const HISTORY_TTL = 4 * 3600_000;

export interface TiingoBar {
  date: string;
  open: number; high: number; low: number; close: number; volume: number;
  adjClose?: number; divCash?: number; splitFactor?: number;
}

export class TiingoProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(2, 2);
  readonly quota: DailyQuota;
  constructor(private readonly apiKey: string | undefined, dailyLimit = 1000, private readonly fetchImpl: typeof fetch = fetch) {
    this.quota = new DailyQuota(dailyLimit);
  }

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://www.tiingo.com',
      terms: `Free API key; free plan roughly 1,000 requests/day, 50/hour, 500 symbols/month (${this.quota.remaining()} requests left today in this process). Personal use; redistribution needs a commercial license. End-of-day prices.`,
      requiresKey: true, configured: !!this.apiKey, capabilities: ['search', 'quote', 'history'],
    };
  }

  private get<T>(path: string, ttlMs: number) {
    return this.cache.getOrLoad(path, ttlMs, async () => {
      if (!this.quota.take()) throw new ProviderError('Tiingo daily request quota reached for this server', NAME, false, 429);
      return fetchJson<T>(`${BASE}${path}`, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl, headers: { Authorization: `Token ${this.apiKey}`, Accept: 'application/json' }, retries: 1 });
    });
  }

  /** Five years of daily bars (or full history for MAX), shared by history() and quote(). */
  private async bars(symbol: string, full = false) {
    const t = tiingoTicker(symbol);
    const start = full ? '1990-01-01' : new Date(Date.now() - 5 * 366 * 86_400_000).toISOString().slice(0, 10);
    // The start date is part of the cache key; keep it stable for the day so the cache is hit.
    const { value, hit } = await this.get<TiingoBar[]>(`/tiingo/daily/${encodeURIComponent(t)}/prices?startDate=${start}`, HISTORY_TTL);
    return { bars: parseTiingoBars(value), hit };
  }

  private fail(e: unknown, symbol: string) {
    const pe = e as ProviderError;
    if (pe.status === 404) return unavailable(ID, `Tiingo has no prices for ${symbol.toUpperCase()}.`);
    if (pe.status === 401 || pe.status === 403) return unavailable(ID, 'Tiingo rejected the API key. Check TIINGO_API_KEY.');
    return unavailable(ID, pe.message, pe.status === 429 || (pe.status ?? 500) >= 500);
  }

  private prov(asOf: string | null, hit: boolean, note = '') {
    return { provider: ID, providerName: NAME, asOf, fetchedAt: new Date().toISOString(), timeliness: 'eod' as const, currency: 'USD', cached: hit, sourceUrl: 'https://www.tiingo.com', attribution: `Data provided by Tiingo. Daily closes, not split or dividend adjusted.${note}` };
  }

  async search(query: string): Promise<ProviderResult<SymbolMatch[]>> {
    if (!this.apiKey) return unavailable(ID, 'Search needs TIINGO_API_KEY (free key at tiingo.com).');
    try {
      const { value, hit } = await this.get<TiingoSearchRow[]>(`/tiingo/utilities/search?query=${encodeURIComponent(query)}&limit=20`, 24 * 3600_000);
      const data = parseTiingoSearch(value);
      return { status: 'ok', data, provenance: { ...this.prov(null, hit), attribution: 'Symbol search by Tiingo. US-listed stocks and ETFs.' } };
    } catch (e) {
      return this.fail(e, query);
    }
  }

  async history(symbol: string, range: HistoryRange): Promise<ProviderResult<Bar[]>> {
    if (!this.apiKey) return unavailable(ID, 'Price history needs TIINGO_API_KEY (free key at tiingo.com).');
    try {
      const { bars, hit } = await this.bars(symbol, range === 'MAX');
      if (!bars.length) return unavailable(ID, `Tiingo returned no prices for ${symbol.toUpperCase()}.`);
      const start = rangeStart(range, new Date(bars.at(-1)!.date));
      const data = start ? bars.filter((b) => b.date >= start.toISOString().slice(0, 10)) : bars;
      return { status: 'ok', data, provenance: this.prov(data.at(-1)?.date ?? null, hit) };
    } catch (e) {
      return this.fail(e, symbol);
    }
  }

  async quote(symbol: string): Promise<ProviderResult<Quote>> {
    if (!this.apiKey) return unavailable(ID, 'Quotes need TIINGO_API_KEY (free key at tiingo.com).');
    try {
      const { bars, hit } = await this.bars(symbol);
      const q = quoteFromBars(symbol, bars);
      if (!q) return unavailable(ID, `Tiingo returned no prices for ${symbol.toUpperCase()}.`);
      return { status: 'ok', data: q, provenance: this.prov(q.sessionDate, hit, ' Price is the latest close.') };
    } catch (e) {
      return this.fail(e, symbol);
    }
  }
}

/** Tiingo uses "-" for share classes: BRK.B -> BRK-B. */
export function tiingoTicker(symbol: string) {
  return symbol.toUpperCase().replace(/\./g, '-');
}

export function parseTiingoBars(rows: TiingoBar[]): Bar[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ date: String(r.date).slice(0, 10), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number.isFinite(Number(r.volume)) ? Number(r.volume) : null }))
    .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && [b.open, b.high, b.low, b.close].every((v) => Number.isFinite(v) && v > 0))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function quoteFromBars(symbol: string, bars: Bar[]): Quote | null {
  const last = bars.at(-1);
  if (!last) return null;
  const prev = bars.at(-2);
  const price = parseDecimal(String(last.close))!;
  const pc = prev ? parseDecimal(String(prev.close)) : null;
  return {
    symbol: symbol.toUpperCase(), price: price.toString(), previousClose: pc?.toString() ?? null,
    change: pc ? price.minus(pc).toString() : null,
    changePercent: pc && !pc.isZero() ? price.minus(pc).div(pc).times(100).toFixed(2) : null,
    open: String(last.open), high: String(last.high), low: String(last.low), volume: last.volume, currency: 'USD', sessionDate: last.date,
  };
}

interface TiingoSearchRow { ticker: string; name: string; assetType?: string; countryCode?: string; isActive?: boolean }

export function parseTiingoSearch(rows: TiingoSearchRow[]): SymbolMatch[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r.ticker && r.isActive !== false && (!r.countryCode || r.countryCode === 'US') && (!r.assetType || ['Stock', 'ETF'].includes(r.assetType)))
    .map((r) => ({ symbol: r.ticker.toUpperCase().replace(/-/g, '.'), name: r.name }));
}
