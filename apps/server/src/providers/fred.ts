import type { MacroSeries, ProviderResult } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { fetchJson, ProviderError, RateLimiter } from '../lib/http.js';
import { unavailable, type MacroCatalogEntry, type Provider, type ProviderInfo } from './types.js';

/** FRED (Federal Reserve Bank of St. Louis). Free API key. Some series are owned by third parties
 * and carry their own copyright terms; the series notes on fred.stlouisfed.org say which. */
const ID = 'fred';
const NAME = 'FRED, Federal Reserve Bank of St. Louis';

export const FRED_CATALOG: MacroCatalogEntry[] = [
  { id: 'CPIAUCSL', title: 'CPI, All Urban Consumers', region: 'United States', category: 'Inflation' },
  { id: 'PCEPILFE', title: 'Core PCE Price Index', region: 'United States', category: 'Inflation' },
  { id: 'UNRATE', title: 'Unemployment Rate', region: 'United States', category: 'Employment' },
  { id: 'PAYEMS', title: 'Nonfarm Payrolls', region: 'United States', category: 'Employment' },
  { id: 'GDPC1', title: 'Real GDP', region: 'United States', category: 'Growth' },
  { id: 'FEDFUNDS', title: 'Effective Federal Funds Rate', region: 'United States', category: 'Rates' },
  { id: 'DGS10', title: '10-Year Treasury Constant Maturity', region: 'United States', category: 'Rates' },
  { id: 'T10Y2Y', title: '10Y minus 2Y Treasury Spread', region: 'United States', category: 'Rates' },
  { id: 'ECBDFR', title: 'ECB Deposit Facility Rate', region: 'Euro Area', category: 'Rates' },
];

interface FredSeriesJson { seriess: { id: string; title: string; frequency: string; units: string; seasonal_adjustment?: string; last_updated?: string }[] }
interface FredObsJson { observations: { date: string; value: string }[] }

export class FredProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(2, 4);
  constructor(private readonly apiKey: string | undefined, private readonly fetchImpl: typeof fetch = fetch) {}

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://fred.stlouisfed.org/docs/api/fred/',
      terms: 'Free API key required. Attribute FRED and the original source; some series are third-party copyrighted and may not be redistributed commercially.',
      requiresKey: true, configured: !!this.apiKey, capabilities: ['macro'],
    };
  }

  macroCatalog() {
    return FRED_CATALOG;
  }

  async macroSeries(id: string): Promise<ProviderResult<MacroSeries>> {
    if (!this.apiKey) return unavailable(ID, 'FRED needs FRED_API_KEY (free at fred.stlouisfed.org).');
    const sid = id.toUpperCase();
    if (!/^[A-Z0-9_]{1,30}$/.test(sid)) return unavailable(ID, `Invalid FRED series id ${id}`);
    const base = 'https://api.stlouisfed.org/fred';
    const q = `series_id=${sid}&api_key=${encodeURIComponent(this.apiKey)}&file_type=json`;
    const opts = { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl };
    try {
      const { value, hit } = await this.cache.getOrLoad(`fred:${sid}`, 3600_000, async () => {
        const [meta, obs] = await Promise.all([
          fetchJson<FredSeriesJson>(`${base}/series?${q}`, opts),
          fetchJson<FredObsJson>(`${base}/series/observations?${q}&observation_start=2000-01-01`, opts),
        ]);
        return parseFred(meta, obs, FRED_CATALOG.find((c) => c.id === sid)?.region ?? 'See source');
      });
      return {
        status: 'ok', data: value,
        provenance: {
          provider: ID, providerName: NAME, asOf: value.observations.at(-1)?.date ?? null, fetchedAt: new Date().toISOString(),
          timeliness: 'periodic', unit: value.units, sourceUrl: `https://fred.stlouisfed.org/series/${sid}`, cached: hit,
          attribution: 'Source: Federal Reserve Bank of St. Louis (FRED) and the original data provider.',
        },
      };
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.status === 400 ? `FRED has no series ${sid}` : pe.message, pe.retryable ?? true);
    }
  }
}

export function parseFred(meta: FredSeriesJson, obs: FredObsJson, region: string): MacroSeries {
  const s = meta.seriess[0];
  return {
    id: s.id, title: s.title, region, frequency: s.frequency, units: s.units, seasonalAdjustment: s.seasonal_adjustment,
    lastUpdated: s.last_updated ?? null,
    // FRED marks missing observations with "." -> null, never 0.
    observations: obs.observations.map((o) => ({ date: o.date, value: o.value === '.' || o.value === '' ? null : Number(o.value) })),
  };
}
