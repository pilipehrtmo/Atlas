import fastifyStatic from '@fastify/static';
import { buildLedger, dec, FUNCTIONS, isValidSymbol, LedgerError, valuePortfolio, type HistoryRange, type PriceInput, type Transaction } from '@atlas/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { research } from './ai/research.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { marketOverview, screenerUniverse } from './market.js';
import { portfolioHistory } from './performance.js';
import type { DataService } from './providers/service.js';
import { Repo } from './repo.js';

const symbolParam = z.object({ symbol: z.string().transform((s) => s.toUpperCase()).refine(isValidSymbol, 'Invalid symbol') });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const decimalStr = z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be a decimal number');
const positiveDecimal = decimalStr.refine((s) => dec(s).gt(0), 'Must be greater than zero');

const txSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'SPLIT']),
    symbol: z.string().transform((s) => s.toUpperCase()).refine(isValidSymbol).optional(),
    quantity: positiveDecimal.optional(),
    price: decimalStr.optional(),
    amount: positiveDecimal.optional(),
    fee: decimalStr.optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
    splitRatio: positiveDecimal.optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((t, ctx) => {
    const need = (k: keyof typeof t) => t[k] === undefined && ctx.addIssue({ code: 'custom', path: [k], message: `${String(k)} is required for ${t.type}` });
    if (t.type === 'BUY' || t.type === 'SELL') { need('symbol'); need('quantity'); need('price'); }
    if (t.type === 'DIVIDEND') { need('symbol'); need('amount'); }
    if (t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL' || t.type === 'FEE') need('amount');
    if (t.type === 'SPLIT') { need('symbol'); need('splitRatio'); }
  });

export function buildApp(config: Config, db: Db, data: DataService): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const repo = new Repo(db, data.mode);
  repo.seedDemo();

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'Invalid request', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    if (err instanceof LedgerError) return reply.status(422).send({ error: err.message });
    if ((err as { code?: string }).code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(err.message)) return reply.status(409).send({ error: 'A record with that name already exists' });
    app.log.error(err);
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message });
  });

  if (config.ATLAS_ACCESS_TOKEN) {
    const expected = createHash('sha256').update(`Bearer ${config.ATLAS_ACCESS_TOKEN}`).digest();
    app.addHook('onRequest', async (req, reply) => {
      if (!req.url.startsWith('/api/')) return;
      const given = createHash('sha256').update(req.headers.authorization ?? '').digest();
      if (!timingSafeEqual(given, expected)) {
        await new Promise((r) => setTimeout(r, 500)); // slows password guessing
        return reply.status(401).send({ error: 'Access token required' });
      }
    });
  }

  // ---- Meta
  app.get('/api/meta', async () => ({
    productName: config.ATLAS_PRODUCT_NAME,
    mode: data.mode,
    aiConfigured: !!config.ANTHROPIC_API_KEY,
    aiModel: config.ATLAS_AI_MODEL,
    providers: data.providers.map((p) => p.info()),
    routes: Object.fromEntries(Object.entries(data.routes).map(([cap, p]) => [cap, p ? p.info().id : null])),
    unavailableReasons: Object.fromEntries(Object.entries(data.routes).filter(([, p]) => !p).map(([cap]) => [cap, data.missingReason(cap as never)])),
    functions: FUNCTIONS,
  }));
  app.get('/api/health', async () => ({ ok: true }));

  // ---- Securities
  app.get('/api/search', async (req) => {
    const { q } = z.object({ q: z.string().min(1).max(40) }).parse(req.query);
    return data.call('search', (p) => p.search?.(q));
  });
  app.get('/api/security/:symbol/profile', async (req) => {
    const { symbol } = symbolParam.parse(req.params);
    return data.call('profile', (p) => p.profile?.(symbol));
  });
  app.get('/api/security/:symbol/quote', async (req) => {
    const { symbol } = symbolParam.parse(req.params);
    return data.call('quote', (p) => p.quote?.(symbol));
  });
  app.get('/api/quotes', async (req) => {
    const { symbols } = z.object({ symbols: z.string() }).parse(req.query);
    const list = [...new Set(symbols.split(',').map((s) => s.trim().toUpperCase()).filter(isValidSymbol))].slice(0, 50);
    const results = await Promise.all(list.map(async (s) => [s, await data.call('quote', (p) => p.quote?.(s))] as const));
    return Object.fromEntries(results);
  });
  app.get('/api/security/:symbol/history', async (req) => {
    const { symbol } = symbolParam.parse(req.params);
    const { range } = z.object({ range: z.enum(['1M', '3M', '6M', '1Y', '5Y', 'MAX']).default('1Y') }).parse(req.query);
    return data.call('history', (p) => p.history?.(symbol, range as HistoryRange));
  });
  app.get('/api/security/:symbol/fundamentals', async (req) => {
    const { symbol } = symbolParam.parse(req.params);
    return data.call('fundamentals', (p) => p.fundamentals?.(symbol));
  });
  app.get('/api/security/:symbol/filings', async (req) => {
    const { symbol } = symbolParam.parse(req.params);
    const { forms } = z.object({ forms: z.string().optional() }).parse(req.query);
    return data.call('filings', (p) => p.filings?.(symbol, forms?.split(',').filter(Boolean)));
  });

  // ---- Markets, macro, FX, rates
  app.get('/api/market/overview', async () => marketOverview(data));
  app.get('/api/macro/catalog', async () => data.routes.macro?.macroCatalog?.() ?? []);
  app.get('/api/macro/:id', async (req) => {
    const { id } = z.object({ id: z.string().regex(/^[A-Za-z0-9_]{1,30}$/) }).parse(req.params);
    return data.call('macro', (p) => p.macroSeries?.(id));
  });
  app.get('/api/fx/rates', async (req) => {
    const { base } = z.object({ base: z.string().regex(/^[A-Za-z]{3}$/).default('USD') }).parse(req.query);
    return data.call('fx', (p) => p.fxRates?.(base.toUpperCase()));
  });
  app.get('/api/fx/history', async (req) => {
    const { pair, days } = z.object({ pair: z.string().regex(/^[A-Za-z]{6}$/), days: z.coerce.number().int().min(5).max(3650).default(365) }).parse(req.query);
    return data.call('fx', (p) => p.fxHistory?.(pair.slice(0, 3).toUpperCase(), pair.slice(3).toUpperCase(), days));
  });
  app.get('/api/rates/curve', async () => data.call('rates', (p) => p.yieldCurve?.()));
  app.get('/api/news', async () => data.call('news', () => undefined));

  // ---- Screener
  app.get('/api/screener/universe', async () => screenerUniverse(data));
  app.get('/api/screens', async () => repo.listScreens());
  app.post('/api/screens', async (req) => {
    const { name, filters } = z.object({ name: z.string().min(1).max(60), filters: z.record(z.string(), z.unknown()) }).parse(req.body);
    repo.saveScreen(name, filters);
    return repo.listScreens();
  });
  app.delete('/api/screens/:id', async (req) => {
    repo.deleteScreen(idParam.parse(req.params).id);
    return repo.listScreens();
  });

  // ---- Watchlists
  app.get('/api/watchlists', async () => repo.listWatchlists());
  app.post('/api/watchlists', async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    repo.createWatchlist(name);
    return reply.status(201).send(repo.listWatchlists());
  });
  app.patch('/api/watchlists/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    if (!repo.renameWatchlist(id, name)) return reply.status(404).send({ error: 'Watchlist not found' });
    return repo.listWatchlists();
  });
  app.delete('/api/watchlists/:id', async (req, reply) => {
    if (!repo.deleteWatchlist(idParam.parse(req.params).id)) return reply.status(404).send({ error: 'Watchlist not found' });
    return repo.listWatchlists();
  });
  app.post('/api/watchlists/:id/items', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { symbol } = symbolParam.parse(req.body);
    if (!repo.ownsWatchlist(id)) return reply.status(404).send({ error: 'Watchlist not found' });
    repo.addToWatchlist(id, symbol);
    return repo.listWatchlists();
  });
  app.delete('/api/watchlists/:id/items/:symbol', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { symbol } = symbolParam.parse(req.params);
    if (!repo.ownsWatchlist(id)) return reply.status(404).send({ error: 'Watchlist not found' });
    repo.removeFromWatchlist(id, symbol);
    return repo.listWatchlists();
  });

  // ---- Portfolios
  app.get('/api/portfolios', async () => repo.listPortfolios());
  app.post('/api/portfolios', async (req, reply) => {
    const { name, baseCurrency } = z.object({ name: z.string().trim().min(1).max(60), baseCurrency: z.string().regex(/^[A-Za-z]{3}$/).default('USD') }).parse(req.body);
    const id = repo.createPortfolio(name, baseCurrency.toUpperCase());
    return reply.status(201).send({ id });
  });
  app.delete('/api/portfolios/:id', async (req, reply) => {
    if (!repo.deletePortfolio(idParam.parse(req.params).id)) return reply.status(404).send({ error: 'Portfolio not found' });
    return { ok: true };
  });
  app.get('/api/portfolios/:id', async (req, reply) => {
    const pf = repo.getPortfolio(idParam.parse(req.params).id);
    if (!pf) return reply.status(404).send({ error: 'Portfolio not found' });
    const transactions = repo.listTransactions(pf.id);
    let ledger;
    try {
      ledger = buildLedger(transactions);
    } catch (e) {
      if (e instanceof LedgerError) return { portfolio: pf, transactions, error: e.message, valuation: null, quotes: {} };
      throw e;
    }
    const held = ledger.positions.filter((p) => !dec(p.quantity).isZero()).map((p) => p.symbol);
    const quotes = Object.fromEntries(await Promise.all(held.map(async (s) => [s, await data.call('quote', (p) => p.quote?.(s))] as const)));
    const prices: Record<string, PriceInput | undefined> = {};
    for (const [s, q] of Object.entries(quotes)) if (q.status === 'ok') prices[s] = { price: q.data.price, asOf: q.provenance.asOf, provider: q.provenance.providerName };

    const currencies = new Set([...ledger.positions.map((p) => p.currency), ...Object.keys(ledger.cash)].filter((c) => c !== pf.baseCurrency));
    const fxToBase: Record<string, string> = {};
    let fxProvenance = null;
    if (currencies.size) {
      const fx = await data.call('fx', (p) => p.fxRates?.(pf.baseCurrency));
      if (fx.status === 'ok') {
        fxProvenance = fx.provenance;
        // Provider gives 1 base = r quote; valuation needs base units per 1 quote = 1 / r.
        for (const r of fx.data) if (currencies.has(r.quote) && !dec(r.rate).isZero()) fxToBase[r.quote] = dec(1).div(r.rate).toString();
      }
    }
    return { portfolio: pf, transactions, ledger, valuation: valuePortfolio(ledger, prices, pf.baseCurrency, fxToBase), quotes, fxToBase, fxProvenance };
  });
  app.get('/api/portfolios/:id/history', async (req, reply) => {
    const pf = repo.getPortfolio(idParam.parse(req.params).id);
    if (!pf) return reply.status(404).send({ error: 'Portfolio not found' });
    const q = z.object({
      range: z.enum(['1M', '3M', '6M', '1Y', '5Y', 'MAX']).default('1Y'),
      benchmark: z.string().trim().toUpperCase().refine(isValidSymbol, 'Invalid benchmark symbol').optional(),
    }).parse(req.query);
    const transactions = repo.listTransactions(pf.id);
    try {
      return await portfolioHistory(data, transactions, pf.baseCurrency, q.range, q.benchmark ?? null);
    } catch (e) {
      if (e instanceof LedgerError) return reply.status(422).send({ error: e.message });
      throw e;
    }
  });
  app.post('/api/portfolios/:id/transactions', async (req, reply) => {
    const pf = repo.getPortfolio(idParam.parse(req.params).id);
    if (!pf) return reply.status(404).send({ error: 'Portfolio not found' });
    const tx = txSchema.parse(req.body) as Transaction;
    // Validate against the whole ledger before saving, so an oversell or currency mismatch is rejected up front.
    buildLedger([...repo.listTransactions(pf.id), tx]);
    const id = repo.addTransaction(pf.id, tx);
    return reply.status(201).send({ id });
  });
  app.delete('/api/portfolios/:id/transactions/:txId', async (req, reply) => {
    const { id, txId } = z.object({ id: z.coerce.number().int(), txId: z.coerce.number().int() }).parse(req.params);
    const pf = repo.getPortfolio(id);
    if (!pf) return reply.status(404).send({ error: 'Portfolio not found' });
    const remaining = repo.listTransactions(id).filter((t) => t.id !== txId);
    buildLedger(remaining); // refuse a delete that would leave an invalid ledger (e.g. removing a buy that a later sell depends on)
    if (!repo.deleteTransaction(id, txId)) return reply.status(404).send({ error: 'Transaction not found' });
    return { ok: true };
  });

  // ---- Layouts and recents
  app.get('/api/layouts/:name', async (req) => repo.getLayout(z.object({ name: z.string().max(40) }).parse(req.params).name));
  app.put('/api/layouts/:name', async (req) => {
    const { name } = z.object({ name: z.string().max(40) }).parse(req.params);
    const body = z.object({ layout: z.unknown() }).parse(req.body);
    if (JSON.stringify(body.layout).length > 50_000) throw Object.assign(new Error('Layout too large'), { statusCode: 413 });
    repo.saveLayout(name, body.layout);
    return { ok: true };
  });
  app.get('/api/recent', async () => repo.recentCommands());
  app.post('/api/recent', async (req) => {
    const { command } = z.object({ command: z.string().trim().min(1).max(80) }).parse(req.body);
    repo.addRecent(command.toUpperCase());
    return repo.recentCommands();
  });

  // ---- Research
  app.post('/api/research', async (req) => {
    const { question, symbol } = z
      .object({ question: z.string().trim().min(3).max(1000), symbol: z.string().transform((s) => s.toUpperCase()).refine(isValidSymbol).nullable().optional() })
      .parse(req.body);
    return research(data, { question, symbol: symbol ?? null, apiKey: config.ANTHROPIC_API_KEY, model: config.ATLAS_AI_MODEL });
  });

  // ---- Static web build (production)
  const webDist = join(process.cwd(), '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.status(404).send({ error: 'Not found' }) : reply.sendFile('index.html')));
  }
  return app;
}
