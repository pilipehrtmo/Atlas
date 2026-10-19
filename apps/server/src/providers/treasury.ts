import type { ProviderResult, YieldCurve, YieldCurvePoint } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { fetchText, ProviderError, RateLimiter } from '../lib/http.js';
import { unavailable, type Provider, type ProviderInfo } from './types.js';

/** US Treasury Daily Par Yield Curve Rates. Keyless, US government public data, published each business day. */
const ID = 'us-treasury';
const NAME = 'US Department of the Treasury';

export class TreasuryProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(2, 2);
  constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => Date = () => new Date()) {}

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics',
      terms: 'US government public data. Daily par yield curve, end of day.',
      requiresKey: false, configured: true, capabilities: ['rates'],
    };
  }

  async yieldCurve(): Promise<ProviderResult<YieldCurve>> {
    const year = this.now().getUTCFullYear();
    try {
      for (const y of [year, year - 1]) {
        const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
        const { value, hit } = await this.cache.getOrLoad(url, 3600_000, () => fetchText(url, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl }));
        const curve = parseTreasuryCsv(value);
        if (curve) {
          return {
            status: 'ok', data: curve,
            provenance: { provider: ID, providerName: NAME, asOf: curve.date, fetchedAt: new Date().toISOString(), timeliness: 'eod', unit: 'percent', sourceUrl: url, cached: hit },
          };
        }
      }
      return unavailable(ID, 'Treasury returned no yield curve rows');
    } catch (e) {
      const pe = e as ProviderError;
      return unavailable(ID, pe.message, pe.retryable ?? true);
    }
  }
}

function tenorMonths(h: string): number | null {
  const m = h.match(/([\d.]+)\s*(mo|month|yr|year)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^y/i.test(m[2]) ? n * 12 : n;
}

/** Parses the Treasury CSV and returns the most recent row. Columns are matched by header text so new tenors do not break parsing. */
export function parseTreasuryCsv(csv: string): YieldCurve | null {
  const rows = csv.trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
  if (rows.length < 2) return null;
  const [header, ...data] = rows;
  const cols = header.map((h, i) => ({ i, h, months: tenorMonths(h) })).filter((c) => c.months !== null);
  const toIso = (d: string) => {
    const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : d;
  };
  const latest = data.map((r) => ({ r, date: toIso(r[0]) })).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!latest) return null;
  const points: YieldCurvePoint[] = cols.map((c) => {
    const raw = latest.r[c.i];
    const v = raw === undefined || raw === '' || raw === 'N/A' ? null : Number(raw);
    const months = c.months!;
    return { tenor: months < 12 ? `${months}M` : `${months / 12}Y`, months, yieldPct: v !== null && Number.isFinite(v) ? v : null };
  });
  return { date: latest.date, country: 'United States', points: points.sort((a, b) => a.months - b.months) };
}
