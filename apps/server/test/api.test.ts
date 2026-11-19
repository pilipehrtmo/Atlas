import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { DataService } from '../src/providers/service.js';

describe('API in demo mode', () => {
  const config = loadConfig({ ATLAS_DATA_MODE: 'demo' });
  const app = buildApp(config, openDb(':memory:'), DataService.fromConfig(config));
  beforeAll(() => app.ready());
  afterAll(() => app.close());
  const get = async (url: string) => (await app.inject({ url })).json();

  it('labels every quote as synthetic', async () => {
    const q = await get('/api/security/NOVA/quote');
    expect(q.status).toBe('ok');
    expect(q.provenance.timeliness).toBe('synthetic');
    expect(q.data.price).toMatch(/^\d+\.\d{2}$/);
  });
  it('refuses real tickers in demo mode instead of inventing prices', async () => {
    const q = await get('/api/security/AAPL/quote');
    expect(q.status).toBe('unavailable');
  });
  it('never fabricates filings or news', async () => {
    expect((await get('/api/security/NOVA/filings')).status).toBe('unavailable');
    expect((await get('/api/news')).status).toBe('unavailable');
  });
  it('seeds and persists watchlists', async () => {
    const lists = await get('/api/watchlists');
    expect(lists[0].symbols).toContain('NOVA');
    await app.inject({ method: 'POST', url: `/api/watchlists/${lists[0].id}/items`, payload: { symbol: 'brkv' } });
    expect((await get('/api/watchlists'))[0].symbols).toContain('BRKV');
  });
  it('values the seeded portfolio with FX conversion for EUR holdings', async () => {
    const [pf] = await get('/api/portfolios');
    const r = await get(`/api/portfolios/${pf.id}`);
    expect(r.valuation.missing).toEqual([]);
    expect(r.valuation.totalValue).not.toBeNull();
    expect(Number(r.fxToBase.EUR)).toBeGreaterThan(0.5);
    expect(r.ledger.positions.find((p: { symbol: string }) => p.symbol === 'NOVA').quantity).toBe('100');
  });
  it('returns daily performance history with a benchmark', async () => {
    const [pf] = await get('/api/portfolios');
    const h = await get(`/api/portfolios/${pf.id}/history?range=1Y&benchmark=DM500`);
    expect(h.method).toBe('cash-tracked');
    expect(h.points.length).toBeGreaterThan(200);
    expect(h.unavailable).toEqual([]);
    expect(h.gaps).toBe(0);
    expect(h.twr).not.toBeNull();
    expect(h.benchmark.symbol).toBe('DM500');
    expect(h.benchmark.returns[0]).toBe('0');
    expect(h.sources.every((s: { provenance: { timeliness: string } }) => s.provenance.timeliness === 'synthetic')).toBe(true);
  });
  it('imports CSV transactions all-or-nothing', async () => {
    const pf = (await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name: 'Import test' } })).json();
    const good = 'date,type,symbol,quantity,price,currency,note\n2026-10-20,buy,VOO,2,500,USD,Test import\n2026-10-20,BUY,SGOV,10,100,USD,';
    const r = await app.inject({ method: 'POST', url: `/api/portfolios/${pf.id}/import`, payload: { csv: good } });
    expect(r.json()).toEqual({ imported: 2 });
    const bad = 'date,type,symbol,quantity,price,currency\n2026-10-21,SELL,VOO,1,700,USD\n2026-10-21,BUY,,1,1,USD';
    const b = await app.inject({ method: 'POST', url: `/api/portfolios/${pf.id}/import`, payload: { csv: bad } });
    expect(b.statusCode).toBe(400);
    const over = await app.inject({ method: 'POST', url: `/api/portfolios/${pf.id}/import`, payload: { csv: 'date,type,symbol,quantity,price,currency\n2026-10-21,SELL,VOO,5,700,USD' } });
    expect(over.statusCode).toBe(422);
    const d = await get(`/api/portfolios/${pf.id}`);
    expect(d.transactions.length).toBe(2);
  });
  it('rejects a sell that exceeds the position', async () => {
    const [pf] = await get('/api/portfolios');
    const res = await app.inject({ method: 'POST', url: `/api/portfolios/${pf.id}/transactions`, payload: { date: '2026-01-05', type: 'SELL', symbol: 'NOVA', quantity: '1000', price: '100', currency: 'USD' } });
    expect(res.statusCode).toBe(422);
  });
  it('validates transaction fields', async () => {
    const [pf] = await get('/api/portfolios');
    const res = await app.inject({ method: 'POST', url: `/api/portfolios/${pf.id}/transactions`, payload: { date: '2026-01-05', type: 'BUY', symbol: 'NOVA', currency: 'USD' } });
    expect(res.statusCode).toBe(400);
  });
  it('returns the evidence pack without AI when no key is set', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/research', payload: { question: 'What are the key risks?', symbol: 'NOVA' } })).json();
    expect(r.status).toBe('no-ai');
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.segments).toEqual([]);
  });
  it('computes screener metrics with definitions', async () => {
    const s = await get('/api/screener/universe');
    expect(s.status).toBe('ok');
    expect(s.rows.length).toBe(16);
    expect(s.definitions.pe).toBeTruthy();
  });
});

describe('live mode routing', () => {
  it('reports missing keys as unavailable and never falls back to demo data', async () => {
    const config = loadConfig({ ATLAS_DATA_MODE: 'live' });
    const app = buildApp(config, openDb(':memory:'), DataService.fromConfig(config));
    const q = (await app.inject({ url: '/api/security/AAPL/quote' })).json();
    expect(q.status).toBe('unavailable');
    expect(q.reason).toMatch(/TIINGO_API_KEY/);
    const m = (await app.inject({ url: '/api/macro/CPIAUCSL' })).json();
    expect(m.reason).toMatch(/FRED_API_KEY/);
    // Live mode gets its own starter watchlist of real tickers, never the demo one.
    const lists = (await app.inject({ url: '/api/watchlists' })).json();
    expect(lists.map((l: { name: string }) => l.name)).toEqual(['US large caps']);
    expect(lists[0].symbols).not.toContain('NOVA');
    await app.close();
  });
});

describe('access token', () => {
  it('rejects API calls without the token and accepts them with it', async () => {
    const config = loadConfig({ ATLAS_DATA_MODE: 'demo', ATLAS_ACCESS_TOKEN: 's3cret-token' });
    const app = buildApp(config, openDb(':memory:'), DataService.fromConfig(config));
    await app.ready();
    expect((await app.inject({ url: '/api/meta' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/meta', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/meta', headers: { authorization: 'Bearer s3cret-token' } })).statusCode).toBe(200);
    await app.close();
  });
});

describe('data source settings', () => {
  it('writes keys to the env file and reconfigures providers without a restart', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const envFile = join(mkdtempSync(join(tmpdir(), 'atlas-env-')), '.env');
    writeFileSync(envFile, '# keep me\nATLAS_DATA_MODE=live\nTIINGO_API_KEY=\n');
    const config = loadConfig({ ATLAS_DATA_MODE: 'live', ATLAS_ENV_FILE: envFile });
    const app = buildApp(config, openDb(':memory:'), DataService.fromConfig(config));
    await app.ready();
    const tiingo = async () => (await app.inject({ url: '/api/meta' })).json().providers.find((p: { id: string }) => p.id === 'tiingo').configured;
    expect(await tiingo()).toBe(false);
    const bad = await app.inject({ method: 'PUT', url: '/api/settings/sources', payload: { SEC_USER_AGENT: 'no email here' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/settings/sources', payload: { TIINGO_API_KEY: 'abc123', SEC_USER_AGENT: 'Pat Doe pat@example.com' } });
    expect(ok.statusCode).toBe(200);
    expect(await tiingo()).toBe(true);
    expect(readFileSync(envFile, 'utf8')).toBe('# keep me\nATLAS_DATA_MODE=live\nTIINGO_API_KEY=abc123\nSEC_USER_AGENT="Pat Doe pat@example.com"\n');
    const remote = await app.inject({ method: 'PUT', url: '/api/settings/sources', headers: { 'x-forwarded-for': '203.0.113.9' }, payload: { TIINGO_API_KEY: 'x' } });
    expect(remote.statusCode).toBe(403);
    await app.close();
  });
});
