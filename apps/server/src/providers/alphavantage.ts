import { parseDecimal, type Bar, type HistoryRange, type ProviderResult, type Quote } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { DailyQuota, fetchJson, ProviderError, RateLimiter } from '../lib/http.js';
import { rangeStart, unavailable, type Provider, type ProviderInfo } from './types.js';

/** Alpha Vantage. Free key, 25 requests/day on the free plan (as published at time of writing; check
 * alphavantage.co/premium). Free-plan US equity data is treated as end-of-day by Atlas; it is never
 * labelled real-time. Free plan terms do not grant redistribution rights. */
const ID = 'alphavantage';
const NAME = 'Alpha Vantage';

export class AlphaVantageProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(1, 1);
  readonly quota: DailyQuota;
  constructor(private readonly apiKey: string | undefined, dailyLimit = 25, private readonly fetchImpl: typeof fetch = fetch) {
    this.quota = new DailyQuota(dailyLimit);
  }

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://www.alphavantage.co',
      terms: `Free API key; ~25 requests/day on the free plan (${this.quota.remaining()} left today in this process). Personal use; redistribution needs a commercial license. Treated as end-of-day.`,
      requiresKey: true, configured: !!this.apiKey, capabilities: ['quote', 'history'],
    };
  }

  private async call<T>(params: string, ttlMs: number): Promise<{ value: T; hit: boolean }> {
    const url = `https://www.alphavantage.co/query?${params}&apikey=${encodeURIComponent(this.apiKey!)}`;
    return this.cache.getOrLoad(params, ttlMs, async () => {
      if (!this.quota.take()) throw new ProviderError('Alpha Vantage daily request quota reached for this server', NAME, false, 429);
      const j = await fetchJson<Record<string, unknown>>(url, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl, retries: 0 });
      // Alpha Vantage reports throttling and errors with HTTP 200 and a message field.
      const msg = (j['Note'] ?? j['Information'] ?? j['Error Message']) as string | undefined;
      if (msg) throw new ProviderError(`Alpha Vantage: ${msg.slice(0, 200)}`, NAME, false, j['Error Message'] ? 404 : 429);
      return j as T;
    });
  }

  async quote(symbol: string): Promise<ProviderResult<Quote>> {
    if (!this.apiKey) return unavailable(ID, 'Quotes need ALPHAVANTAGE_API_KEY (free key at alphavantage.co).');
    try {
      const { value, hit } = await this.call<{ 'Global Quote': Record<string, string> }>(`function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}`, 15 * 60_000);
      const q = parseGlobalQuote(value['Global Quote']);
      if (!q) return unavailable(ID, `Alpha Vantage has no quote for ${symbol.toUpperCase()}`);
      return {
        status: 'ok', data: q,
        provenance: { provider: ID, providerName: NAME, asOf: q.sessionDate, fetchedAt: new Date().toISOString(), timeliness: 'eod', currency: 'USD', cached: hit, attribution: 'Data provided by Alpha Vantage' },
      };
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.message, pe.status === 429);
    }
  }

  async history(symbol: string, range: HistoryRange): Promise<ProviderResult<Bar[]>> {
    if (!this.apiKey) return unavailable(ID, 'Price history needs ALPHAVANTAGE_API_KEY.');
    try {
      const { value, hit } = await this.call<Record<string, Record<string, Record<string, string>>>>(`function=TIME_SERIES_DAILY&outputsize=compact&symbol=${encodeURIComponent(symbol)}`, 6 * 3600_000);
      const bars = parseDailySeries(value['Time Series (Daily)'] ?? {});
      if (!bars.length) return unavailable(ID, `No history for ${symbol.toUpperCase()}`);
      const start = rangeStart(range, new Date(bars.at(-1)!.date));
      const data = start ? bars.filter((b) => b.date >= start.toISOString().slice(0, 10)) : bars;
      const note = bars[0].date > (start?.toISOString().slice(0, 10) ?? '0') ? ' Free plan returns about 100 sessions; longer ranges are truncated.' : '';
      return {
        status: 'ok', data,
        provenance: { provider: ID, providerName: NAME, asOf: data.at(-1)?.date ?? null, fetchedAt: new Date().toISOString(), timeliness: 'eod', currency: 'USD', cached: hit, attribution: 'Data provided by Alpha Vantage. Prices are not split or dividend adjusted.' + note },
      };
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.message, pe.status === 429);
    }
  }
}

export function parseGlobalQuote(g: Record<string, string> | undefined): Quote | null {
  if (!g || !g['01. symbol']) return null;
  const price = parseDecimal(g['05. price']);
  if (!price) return null;
  const prev = parseDecimal(g['08. previous close']);
  const chg = parseDecimal(g['09. change']);
  const pct = parseDecimal(g['10. change percent']);
  return {
    symbol: g['01. symbol'], price: price.toString(), previousClose: prev?.toString() ?? null, change: chg?.toString() ?? null,
    changePercent: pct?.toString() ?? (prev && !prev.isZero() ? price.minus(prev).div(prev).times(100).toFixed(2) : null),
    open: parseDecimal(g['02. open'])?.toString() ?? null, high: parseDecimal(g['03. high'])?.toString() ?? null, low: parseDecimal(g['04. low'])?.toString() ?? null,
    volume: parseDecimal(g['06. volume'])?.toNumber() ?? null, currency: 'USD', sessionDate: g['07. latest trading day'] || null,
  };
}

export function parseDailySeries(ts: Record<string, Record<string, string>>): Bar[] {
  return Object.entries(ts)
    .map(([date, v]) => ({
      date, open: Number(v['1. open']), high: Number(v['2. high']), low: Number(v['3. low']), close: Number(v['4. close']),
      volume: v['5. volume'] !== undefined ? Number(v['5. volume']) : null,
    }))
    .filter((b) => [b.open, b.high, b.low, b.close].every(Number.isFinite))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

