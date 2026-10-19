import type { CompanyProfile, Filing, FundamentalLine, FundamentalPoint, Fundamentals, Provenance, ProviderResult, SymbolMatch } from '@atlas/core';
import { TtlCache } from '../lib/cache.js';
import { fetchJson, ProviderError, RateLimiter } from '../lib/http.js';
import { LINES, type LineDef } from './lines.js';
import { unavailable, type Provider, type ProviderInfo } from './types.js';

/**
 * SEC EDGAR (US Securities and Exchange Commission). Free, keyless, public-domain
 * US government data. SEC fair-access policy: identify yourself in the
 * User-Agent and stay under 10 requests/second.
 * https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */

const ID = 'sec-edgar';
const NAME = 'SEC EDGAR';
const DAY = 86_400_000;

interface TickerEntry { cik_str: number; ticker: string; title: string }

interface SubmissionsJson {
  cik: string;
  name: string;
  tickers?: string[];
  exchanges?: (string | null)[];
  sic?: string;
  sicDescription?: string;
  fiscalYearEnd?: string;
  stateOfIncorporation?: string;
  website?: string;
  filings: { recent: { accessionNumber: string[]; filingDate: string[]; reportDate: string[]; form: string[]; primaryDocument: string[]; primaryDocDescription: string[] } };
}

interface FactUnitValue { start?: string; end: string; val: number; accn: string; fy: number | null; fp: string | null; form: string; filed: string; frame?: string }
interface CompanyFactsJson { cik: number; entityName: string; facts: Record<string, Record<string, { label?: string; units: Record<string, FactUnitValue[]> }>> }

const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A', '10-KT']);
const QUARTER_FORMS = new Set(['10-Q', '10-Q/A']);

export const pad10 = (cik: string | number) => String(cik).padStart(10, '0');

export class SecEdgarProvider implements Provider {
  private cache = new TtlCache();
  private limiter = new RateLimiter(5, 5);

  constructor(private readonly userAgent: string | undefined, private readonly fetchImpl: typeof fetch = fetch) {}

  info(): ProviderInfo {
    return {
      id: ID, name: NAME, homepage: 'https://www.sec.gov/edgar',
      terms: 'US government public data, free to use. Fair access: declared User-Agent, max 10 requests/second. Filings are as reported by companies and are not audited by Atlas.',
      requiresKey: false, configured: !!this.userAgent,
      capabilities: ['search', 'profile', 'filings', 'fundamentals'],
    };
  }

  private notConfigured() {
    return unavailable(ID, 'SEC EDGAR needs SEC_USER_AGENT set to "Your Name or Company contact@email" (SEC fair-access policy).');
  }

  private async get<T>(url: string, ttlMs: number): Promise<{ value: T; hit: boolean }> {
    return this.cache.getOrLoad(url, ttlMs, () =>
      fetchJson<T>(url, { provider: NAME, limiter: this.limiter, fetchImpl: this.fetchImpl, headers: { 'User-Agent': this.userAgent!, Accept: 'application/json' }, timeoutMs: 20_000 }),
    );
  }

  private prov(asOf: string | null, sourceUrl: string, cached: boolean, extra: Partial<Provenance> = {}): Provenance {
    return { provider: ID, providerName: NAME, asOf, fetchedAt: new Date().toISOString(), timeliness: 'periodic', sourceUrl, cached, ...extra };
  }

  private async tickers() {
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const r = await this.get<Record<string, TickerEntry>>(url, DAY);
    return { list: Object.values(r.value), hit: r.hit, url };
  }

  async resolveCik(symbol: string): Promise<{ cik: string; title: string } | null> {
    const s = symbol.toUpperCase().replace('.', '-');
    const { list } = await this.tickers();
    const e = list.find((t) => t.ticker.toUpperCase() === s);
    return e ? { cik: pad10(e.cik_str), title: e.title } : null;
  }

  private async wrap<T>(fn: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    if (!this.userAgent) return this.notConfigured();
    try {
      return await fn();
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError((e as Error).message, NAME, true);
      if (pe.status === 404) return unavailable(ID, 'SEC has no data for this company.');
      return unavailable(ID, pe.message, pe.retryable);
    }
  }

  search(query: string): Promise<ProviderResult<SymbolMatch[]>> {
    return this.wrap(async () => {
      const q = query.toUpperCase();
      const { list, hit, url } = await this.tickers();
      const starts = list.filter((t) => t.ticker.startsWith(q));
      const named = q.length >= 3 ? list.filter((t) => !t.ticker.startsWith(q) && t.title.toUpperCase().includes(q)) : [];
      const data = [...starts.sort((a, b) => a.ticker.length - b.ticker.length), ...named]
        .slice(0, 10)
        .map((t) => ({ symbol: t.ticker, name: t.title, cik: pad10(t.cik_str) }));
      return { status: 'ok', data, provenance: this.prov(null, url, hit) };
    });
  }

  private async submissions(symbol: string) {
    const c = await this.resolveCik(symbol);
    if (!c) return null;
    const url = `https://data.sec.gov/submissions/CIK${c.cik}.json`;
    const r = await this.get<SubmissionsJson>(url, 6 * 3600_000);
    return { ...r, url, cik: c.cik };
  }

  profile(symbol: string): Promise<ProviderResult<CompanyProfile>> {
    return this.wrap(async () => {
      const s = await this.submissions(symbol);
      if (!s) return unavailable(ID, `${symbol.toUpperCase()} is not in the SEC ticker list (SEC covers US-registered filers).`);
      const j = s.value;
      const i = (j.tickers ?? []).findIndex((t) => t.toUpperCase() === symbol.toUpperCase());
      return {
        status: 'ok',
        data: {
          symbol: symbol.toUpperCase(), name: j.name, cik: s.cik, exchange: (i >= 0 ? j.exchanges?.[i] : j.exchanges?.[0]) ?? undefined,
          industry: j.sicDescription, sicCode: j.sic, fiscalYearEnd: j.fiscalYearEnd, stateOfIncorporation: j.stateOfIncorporation, website: j.website || undefined,
        },
        provenance: this.prov(null, `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${s.cik}`, s.hit),
      };
    });
  }

  filings(symbol: string, forms?: string[]): Promise<ProviderResult<Filing[]>> {
    return this.wrap(async () => {
      const s = await this.submissions(symbol);
      if (!s) return unavailable(ID, `${symbol.toUpperCase()} is not in the SEC ticker list.`);
      const data = parseFilings(s.value, forms);
      return { status: 'ok', data, provenance: this.prov(data[0]?.filingDate ?? null, s.url, s.hit) };
    });
  }

  fundamentals(symbol: string): Promise<ProviderResult<Fundamentals>> {
    return this.wrap(async () => {
      const c = await this.resolveCik(symbol);
      if (!c) return unavailable(ID, `${symbol.toUpperCase()} is not in the SEC ticker list.`);
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${c.cik}.json`;
      const r = await this.get<CompanyFactsJson>(url, 6 * 3600_000);
      const data = parseCompanyFacts(symbol.toUpperCase(), c.cik, r.value);
      const latest = data.lines.flatMap((l) => l.annual).map((p) => p.filed).sort().at(-1) ?? null;
      return { status: 'ok', data, provenance: this.prov(latest, url, r.hit, { currency: 'USD' }) };
    });
  }
}

export function parseFilings(j: SubmissionsJson, forms?: string[]): Filing[] {
  const r = j.filings.recent;
  const cikInt = String(Number(j.cik));
  const want = forms?.length ? new Set(forms.map((f) => f.toUpperCase())) : null;
  const out: Filing[] = [];
  for (let i = 0; i < r.accessionNumber.length && out.length < 200; i++) {
    if (want && !want.has(r.form[i].toUpperCase())) continue;
    const acc = r.accessionNumber[i];
    const doc = r.primaryDocument[i];
    out.push({
      form: r.form[i], filingDate: r.filingDate[i], reportDate: r.reportDate[i] || null, accessionNumber: acc, description: r.primaryDocDescription[i] || null,
      url: doc
        ? `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc.replace(/-/g, '')}/${doc}`
        : `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc.replace(/-/g, '')}/${acc}-index.htm`,
    });
  }
  return out;
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

function pickPoints(values: FactUnitValue[], unit: string, line: LineDef, period: 'annual' | 'quarterly'): FundamentalPoint[] {
  const forms = period === 'annual' ? ANNUAL_FORMS : QUARTER_FORMS;
  const candidates = values.filter((v) => {
    if (!forms.has(v.form)) return false;
    if (line.kind === 'instant') return period === 'annual' ? v.fp === 'FY' : v.fp?.startsWith('Q');
    if (!v.start) return false;
    const d = days(v.start, v.end);
    return period === 'annual' ? d >= 330 && d <= 400 : d >= 80 && d <= 100;
  });

  // fy/fp in companyfacts describe the *filing*, so only trust them for the newest period in each filing.
  const maxEndByAccn = new Map<string, string>();
  for (const v of candidates) if ((maxEndByAccn.get(v.accn) ?? '') < v.end) maxEndByAccn.set(v.accn, v.end);

  // One value per period; the latest filing wins (captures restatements). Its accession is kept for audit.
  const byPeriod = new Map<string, FactUnitValue>();
  const labelByPeriod = new Map<string, { fy: number | null; fp: string | null }>();
  for (const v of candidates) {
    const k = `${v.start ?? ''}|${v.end}`;
    const cur = byPeriod.get(k);
    if (!cur || v.filed > cur.filed) byPeriod.set(k, v);
    if (maxEndByAccn.get(v.accn) === v.end) labelByPeriod.set(k, { fy: v.fy, fp: v.fp });
  }
  return [...byPeriod.entries()]
    .map(([k, v]) => ({
      end: v.end, start: v.start, value: String(v.val), unit, fiscalYear: labelByPeriod.get(k)?.fy ?? null, fiscalPeriod: labelByPeriod.get(k)?.fp ?? null,
      form: v.form, filed: v.filed, accessionNumber: v.accn,
    }))
    .sort((a, b) => (a.end < b.end ? -1 : 1));
}

export function parseCompanyFacts(symbol: string, cik: string, j: CompanyFactsJson): Fundamentals {
  const lines: FundamentalLine[] = [];
  for (const line of LINES) {
    for (const qualified of line.concepts) {
      const [ns, concept] = qualified.includes(':') ? qualified.split(':') : ['us-gaap', qualified];
      const fact = j.facts[ns]?.[concept];
      const values = fact?.units[line.unit];
      if (!values?.length) continue;
      // Shares outstanding (dei) is reported on the cover page, not as a FY balance; take the cover values.
      const annual = ns === 'dei' ? coverValues(values, line.unit) : pickPoints(values, line.unit, line, 'annual');
      if (!annual.length) continue;
      lines.push({ key: line.key, label: line.label, concept: `${ns}:${concept}`, annual: annual.slice(-10), quarterly: ns === 'dei' ? [] : pickPoints(values, line.unit, line, 'quarterly').slice(-12) });
      break;
    }
  }
  return { symbol, cik, entityName: j.entityName, lines };
}

function coverValues(values: FactUnitValue[], unit: string): FundamentalPoint[] {
  const byEnd = new Map<string, FactUnitValue>();
  for (const v of values) {
    const cur = byEnd.get(v.end);
    if (!cur || v.filed > cur.filed) byEnd.set(v.end, v);
  }
  return [...byEnd.values()]
    .sort((a, b) => (a.end < b.end ? -1 : 1))
    .map((v) => ({ end: v.end, value: String(v.val), unit, fiscalYear: v.fy, fiscalPeriod: v.fp, form: v.form, filed: v.filed, accessionNumber: v.accn }));
}
