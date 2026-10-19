import type { FxRate, ProviderResult } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { fetchJson, ProviderError, RateLimiter } from '../lib/http.js';
import { unavailable, type Provider, type ProviderInfo } from './types.js';

/** Frankfurter: open-source API over European Central Bank euro reference rates.
 * Keyless. ECB publishes once per TARGET business day around 16:00 CET; these are
 * reference rates for information, not tradable quotes. */
const ID = 'frankfurter';
const NAME = 'ECB reference rates via Frankfurter';

export class FrankfurterProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(5, 5);
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://frankfurter.dev',
      terms: 'Keyless, free. Underlying ECB reference rates may be reused with attribution to the ECB; informational only, not for transaction purposes.',
      requiresKey: false, configured: true, capabilities: ['fx'],
    };
  }

  private prov(asOf: string | null, url: string, cached: boolean) {
    return { provider: ID, providerName: NAME, asOf, fetchedAt: new Date().toISOString(), timeliness: 'eod' as const, sourceUrl: url, cached, attribution: 'Source: European Central Bank euro foreign exchange reference rates.' };
  }

  async fxRates(base: string): Promise<ProviderResult<FxRate[]>> {
    const b = base.toUpperCase();
    if (!/^[A-Z]{3}$/.test(b)) return unavailable(ID, `Invalid currency ${base}`);
    const url = `${this.baseUrl}/latest?from=${b}`;
    try {
      const { value, hit } = await this.cache.getOrLoad(url, 30 * 60_000, () => fetchJson<{ base: string; date: string; rates: Record<string, number> }>(url, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl }));
      const data = Object.entries(value.rates).map(([q, r]) => ({ base: value.base, quote: q, rate: String(r), date: value.date }));
      return { status: 'ok', data, provenance: this.prov(value.date, url, hit) };
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.status === 404 ? `ECB does not publish ${b}` : pe.message, pe.retryable ?? true);
    }
  }

  async fxHistory(base: string, quote: string, days: number): Promise<ProviderResult<{ date: string; rate: number }[]>> {
    const b = base.toUpperCase(), q = quote.toUpperCase();
    if (!/^[A-Z]{3}$/.test(b) || !/^[A-Z]{3}$/.test(q)) return unavailable(ID, 'Invalid currency pair');
    const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const url = `${this.baseUrl}/${start}..?from=${b}&to=${q}`;
    try {
      const { value, hit } = await this.cache.getOrLoad(url, 3600_000, () => fetchJson<{ rates: Record<string, Record<string, number>> }>(url, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl }));
      const data = Object.entries(value.rates).map(([date, r]) => ({ date, rate: r[q] })).filter((x) => x.rate !== undefined).sort((a, b2) => (a.date < b2.date ? -1 : 1));
      return { status: 'ok', data, provenance: this.prov(data.at(-1)?.date ?? null, url, hit) };
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.message, pe.retryable ?? true);
    }
  }
}
