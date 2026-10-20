import { describe, expect, it } from 'vitest';
import { parseDailySeries, parseGlobalQuote } from '../src/providers/alphavantage.js';
import { parseFred } from '../src/providers/fred.js';
import { parseCompanyFacts, parseFilings, SecEdgarProvider } from '../src/providers/sec.js';
import { parseTreasuryCsv } from '../src/providers/treasury.js';

// Fixtures follow each provider's documented response shape. They are hand-built, not live captures.

describe('SEC companyfacts', () => {
  const facts = {
    cik: 320193,
    entityName: 'Example Corp',
    facts: {
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2024-10-18', val: 15000, accn: 'a3', fy: 2024, fp: 'FY', form: '10-K', filed: '2024-11-01' }] } } },
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              // FY2023 10-K: current year and prior-year comparative, both tagged fy=2023
              { start: '2022-01-01', end: '2022-12-31', val: 900, accn: 'a2', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-01' },
              { start: '2023-01-01', end: '2023-12-31', val: 1000, accn: 'a2', fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-01' },
              // FY2024 10-K restates 2023 and adds 2024
              { start: '2023-01-01', end: '2023-12-31', val: 1010, accn: 'a3', fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
              { start: '2024-01-01', end: '2024-12-31', val: 1200, accn: 'a3', fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
              // A quarter inside a 10-K must not be treated as annual
              { start: '2024-10-01', end: '2024-12-31', val: 330, accn: 'a3', fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
              { start: '2024-07-01', end: '2024-09-30', val: 310, accn: 'q3', fy: 2024, fp: 'Q3', form: '10-Q', filed: '2024-11-01' },
              // Year-to-date figure in a 10-Q is not a quarter
              { start: '2024-01-01', end: '2024-09-30', val: 870, accn: 'q3', fy: 2024, fp: 'Q3', form: '10-Q', filed: '2024-11-01' },
            ],
          },
        },
        Assets: { units: { USD: [{ end: '2024-12-31', val: 5000, accn: 'a3', fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' }] } },
      },
    },
  };

  const f = parseCompanyFacts('EXM', '0000320193', facts);
  const rev = f.lines.find((l) => l.key === 'revenue')!;

  it('keeps one value per annual period, preferring the latest filing (restatement)', () => {
    expect(rev.concept).toBe('us-gaap:Revenues');
    expect(rev.annual.map((p) => [p.end, p.value])).toEqual([['2022-12-31', '900'], ['2023-12-31', '1010'], ['2024-12-31', '1200']]);
    expect(rev.annual[1].accessionNumber).toBe('a3');
  });
  it('labels fiscal year only from the filing that reports the period as current', () => {
    expect(rev.annual.map((p) => p.fiscalYear)).toEqual([null, 2023, 2024]);
  });
  it('separates quarters from annual and YTD values', () => {
    expect(rev.quarterly.map((p) => p.value)).toEqual(['310']);
  });
  it('omits lines with no data rather than inventing zeros', () => {
    expect(f.lines.find((l) => l.key === 'grossProfit')).toBeUndefined();
    expect(f.lines.find((l) => l.key === 'totalAssets')!.annual[0].value).toBe('5000');
    expect(f.lines.find((l) => l.key === 'sharesOutstanding')!.concept).toBe('dei:EntityCommonStockSharesOutstanding');
  });
});

describe('SEC submissions', () => {
  it('builds archive URLs from accession numbers', () => {
    const filings = parseFilings({
      cik: '0000320193', name: 'Example',
      filings: { recent: { accessionNumber: ['0000320193-24-000123', '0000320193-24-000100'], filingDate: ['2024-11-01', '2024-08-02'], reportDate: ['2024-09-28', ''], form: ['10-K', '8-K'], primaryDocument: ['exm-20240928.htm', 'x8k.htm'], primaryDocDescription: ['10-K', ''] } },
    }, ['10-K']);
    expect(filings).toHaveLength(1);
    expect(filings[0].url).toBe('https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/exm-20240928.htm');
  });
  it('reports unavailable without a User-Agent instead of calling SEC', async () => {
    const r = await new SecEdgarProvider(undefined, () => { throw new Error('should not fetch'); }).profile('AAPL');
    expect(r.status).toBe('unavailable');
  });
});

describe('FRED', () => {
  it('maps "." observations to null', () => {
    const s = parseFred(
      { seriess: [{ id: 'X', title: 'T', frequency: 'Monthly', units: 'Percent', last_updated: '2026-10-01 07:46:01-05' }] },
      { observations: [{ date: '2026-08-01', value: '4.2' }, { date: '2026-09-01', value: '.' }] },
      'United States',
    );
    expect(s.observations).toEqual([{ date: '2026-08-01', value: 4.2 }, { date: '2026-09-01', value: null }]);
  });
});

describe('Treasury CSV', () => {
  it('reads the latest row and maps headers to tenors', () => {
    const csv = 'Date,"1 Mo","3 Mo","1 Yr","2 Yr","10 Yr","30 Yr"\n10/16/2026,4.10,4.00,3.80,3.60,4.05,4.50\n10/17/2026,4.11,4.01,,3.62,4.07,4.52\n';
    const c = parseTreasuryCsv(csv)!;
    expect(c.date).toBe('2026-10-17');
    expect(c.points.map((p) => p.tenor)).toEqual(['1M', '3M', '1Y', '2Y', '10Y', '30Y']);
    expect(c.points.find((p) => p.tenor === '1Y')!.yieldPct).toBeNull();
    expect(c.points.find((p) => p.tenor === '10Y')!.yieldPct).toBe(4.07);
  });
});

describe('Alpha Vantage', () => {
  it('parses GLOBAL_QUOTE into decimal strings', () => {
    const q = parseGlobalQuote({ '01. symbol': 'IBM', '02. open': '230.10', '03. high': '232.00', '04. low': '229.50', '05. price': '231.25', '06. volume': '3456789', '07. latest trading day': '2026-10-16', '08. previous close': '230.00', '09. change': '1.25', '10. change percent': '0.5435%' })!;
    expect(q).toMatchObject({ price: '231.25', change: '1.25', changePercent: '0.5435', sessionDate: '2026-10-16', volume: 3456789 });
  });
  it('returns null for an empty quote', () => {
    expect(parseGlobalQuote({})).toBeNull();
  });
  it('sorts daily series ascending', () => {
    const bars = parseDailySeries({ '2026-10-16': { '1. open': '2', '2. high': '3', '3. low': '1', '4. close': '2.5', '5. volume': '10' }, '2026-10-15': { '1. open': '1', '2. high': '2', '3. low': '1', '4. close': '2', '5. volume': '9' } });
    expect(bars.map((b) => b.date)).toEqual(['2026-10-15', '2026-10-16']);
  });
});

describe('fetchText errors', () => {
  it('includes the title of an HTML block page in the error', async () => {
    const { fetchText } = await import('../src/lib/http.js');
    const fetchImpl = (async () => new Response('<html><head><title>SEC.gov | Your Request Originates from an Undeclared Automated Tool</title></head></html>', { status: 403, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    await expect(fetchText('https://example.test', { provider: 'SEC EDGAR', fetchImpl, retries: 0 })).rejects.toThrow('SEC EDGAR responded 403: SEC.gov | Your Request Originates from an Undeclared Automated Tool');
  });
});
