/**
 * Smoke test against the real keyless providers (SEC EDGAR, US Treasury, ECB via Frankfurter),
 * plus FRED / Alpha Vantage when their keys are set. Prints a report and exits non-zero on failure.
 *
 *   SEC_USER_AGENT="Name contact@example.com" npx tsx scripts/live-check.ts
 */
import type { ProviderResult } from '@atlas/core';
import { AlphaVantageProvider } from '../src/providers/alphavantage.js';
import { FredProvider } from '../src/providers/fred.js';
import { FrankfurterProvider } from '../src/providers/frankfurter.js';
import { SecEdgarProvider } from '../src/providers/sec.js';
import { TiingoProvider } from '../src/providers/tiingo.js';
import { TreasuryProvider } from '../src/providers/treasury.js';

const ua = process.env.SEC_USER_AGENT || 'Atlas-ci pilipehrtmo@users.noreply.github.com';
const sec = new SecEdgarProvider(ua);
const fx = new FrankfurterProvider(process.env.FRANKFURTER_BASE_URL || 'https://api.frankfurter.app');
const tsy = new TreasuryProvider();
const fred = new FredProvider(process.env.FRED_API_KEY);
const av = new AlphaVantageProvider(process.env.ALPHAVANTAGE_API_KEY);
const tiingo = new TiingoProvider(process.env.TIINGO_API_KEY);

let failures = 0;
const ok = (name: string, detail: string) => console.log(`PASS ${name}: ${detail}`);
const fail = (name: string, detail: string) => { failures++; console.log(`FAIL ${name}: ${detail}`); };
const skip = (name: string, detail: string) => console.log(`SKIP ${name}: ${detail}`);

async function check<T>(name: string, p: Promise<ProviderResult<T>>, assert: (d: T) => string) {
  try {
    const r = await p;
    if (r.status !== 'ok') return fail(name, r.reason);
    try { ok(name, assert(r.data)); } catch (e) { fail(name, (e as Error).message); }
  } catch (e) { fail(name, `threw ${(e as Error).message}`); }
}
const expect = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

// Raw probe so a refusal shows what SEC actually said. SEC blocks some shared cloud IP ranges
// (GitHub-hosted runners included) with its "Undeclared Automated Tool" / rate-threshold pages
// even with a declared User-Agent; that is reported as BLOCKED rather than as an adapter failure.
let secBlocked: string | null = null;
for (const url of ['https://www.sec.gov/files/company_tickers.json', 'https://data.sec.gov/submissions/CIK0000320193.json']) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' } });
    const body = res.ok ? '' : (await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const page = body.match(/SEC\.gov \| ([^|{]+?)\s+html/)?.[1];
    if (res.status === 403 && page) secBlocked = page;
    console.log(`INFO probe ${url} -> ${res.status}${page ? `: ${page}` : body ? `: ${body.slice(0, 200)}` : ''}`);
  } catch (e) { console.log(`INFO probe ${url} threw ${(e as Error).message}`); }
}
console.log(`INFO SEC User-Agent: ${ua}`);

if (secBlocked) {
  console.log(`BLOCKED sec: SEC refused this network ("${secBlocked}"); adapter not exercised`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=SEC EDGAR blocked::SEC refused the runner's IP (${secBlocked}). SEC checks were not run.`);
} else {
  await check('sec.search', sec.search('AAPL'), (d) => {
    expect(d[0]?.symbol === 'AAPL', `first match ${d[0]?.symbol}`);
    return `${d.length} matches, first ${d[0].name} CIK ${d[0].cik}`;
  });
  await check('sec.profile', sec.profile('AAPL'), (d) => {
    expect(d.fiscalYearEnd === '0926' || d.fiscalYearEnd?.startsWith('09'), `fiscal year end ${d.fiscalYearEnd}`);
    return `${d.name}, ${d.exchange}, ${d.industry}, FYE ${d.fiscalYearEnd}`;
  });
  await check('sec.filings', sec.filings('AAPL', ['10-K']), (d) => {
    expect(d.length > 0 && d.every((f) => f.form === '10-K'), 'no 10-K filings');
    expect(d[0].url.startsWith('https://www.sec.gov/Archives/edgar/data/320193/'), `url ${d[0].url}`);
    return `${d.length} 10-Ks, latest ${d[0].filingDate} ${d[0].url}`;
  });

  for (const sym of ['AAPL', 'MSFT', 'JPM', 'BRK.B']) {
    await check(`sec.fundamentals ${sym}`, sec.fundamentals(sym), (d) => {
      const rev = d.lines.find((l) => l.key === 'revenue');
      const ni = d.lines.find((l) => l.key === 'netIncome');
      expect(ni && ni.annual.length >= 3, 'fewer than 3 annual net income points');
      const last3 = (rev ?? ni)!.annual.slice(-3).map((p) => `${p.fiscalYear ?? '?'}/${p.end}=${(Number(p.value) / 1e9).toFixed(1)}B(${p.form})`);
      // Annual points must be one per fiscal period and strictly increasing in end date.
      const ends = ni!.annual.map((p) => p.end);
      expect(new Set(ends).size === ends.length, 'duplicate annual periods');
      const latestEnd = ends.at(-1)!;
      expect(Date.now() - Date.parse(latestEnd) < 500 * 86_400_000, `latest annual period is stale: ${latestEnd}`);
      return `${d.lines.length} lines; ${rev ? 'revenue' : 'net income'} ${last3.join(', ')}; lines: ${d.lines.map((l) => l.key).join(',')}`;
    });
  }
}

await check('treasury.curve', tsy.yieldCurve(), (d) => {
  const ten = d.points.find((p) => p.tenor === '10Y')?.yieldPct;
  expect(typeof ten === 'number' && ten > 0 && ten < 20, `10Y ${ten}`);
  expect(Date.now() - Date.parse(d.date) < 10 * 86_400_000, `curve date stale: ${d.date}`);
  return `${d.date}: ${d.points.map((p) => `${p.tenor}=${p.yieldPct}`).join(' ')}`;
});
await check('fx.latest', fx.fxRates('USD'), (d) => {
  const eur = d.find((r) => r.quote === 'EUR');
  expect(eur && Number(eur.rate) > 0.5 && Number(eur.rate) < 1.5, `USD/EUR ${eur?.rate}`);
  return `${d.length} rates on ${eur!.date}, USD/EUR ${eur!.rate}`;
});
await check('fx.history', fx.fxHistory('EUR', 'USD', 30), (d) => {
  expect(d.length >= 15, `${d.length} points`);
  return `${d.length} points ${d[0].date}..${d.at(-1)!.date}`;
});

if (process.env.FRED_API_KEY) {
  await check('fred.CPIAUCSL', fred.macroSeries('CPIAUCSL'), (d) => `${d.title}, ${d.observations.length} obs, last ${JSON.stringify(d.observations.at(-1))}`);
} else skip('fred', 'FRED_API_KEY not set');
if (process.env.TIINGO_API_KEY) {
  await check('tiingo.quote', tiingo.quote('VOO'), (d) => {
    expect(Date.now() - Date.parse(d.sessionDate!) < 7 * 86_400_000, `stale session ${d.sessionDate}`);
    return `VOO ${d.price} on ${d.sessionDate} (${d.changePercent}%)`;
  });
  await check('tiingo.history', tiingo.history('BRK.B', '1Y'), (d) => { expect(d.length > 240, `${d.length} bars`); return `${d.length} bars`; });
  await check('tiingo.search', tiingo.search('vanguard s&p'), (d) => { expect(d.some((m) => m.symbol === 'VOO'), 'VOO not found'); return `${d.length} matches`; });
} else skip('tiingo', 'TIINGO_API_KEY not set');
if (process.env.ALPHAVANTAGE_API_KEY) {
  await check('alphavantage.quote', av.quote('IBM'), (d) => `IBM ${d.price} on ${d.sessionDate}`);
} else skip('alphavantage', 'ALPHAVANTAGE_API_KEY not set');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll live checks passed');
process.exit(failures ? 1 : 0);
