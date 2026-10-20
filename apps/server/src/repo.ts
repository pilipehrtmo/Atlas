import type { DataMode, Transaction } from '@atlas/core';
import type { Db } from './db.js';

/** Persistence for user-owned records. All queries are parameterized. */
export class Repo {
  constructor(private readonly db: Db, private readonly mode: DataMode) {}

  // Watchlists
  listWatchlists() {
    const lists = this.db.prepare('SELECT id, name FROM watchlists WHERE mode = ? ORDER BY id').all(this.mode) as { id: number; name: string }[];
    const items = this.db.prepare('SELECT symbol FROM watchlist_items WHERE watchlist_id = ? ORDER BY position, added_at');
    return lists.map((l) => ({ ...l, symbols: (items.all(l.id) as { symbol: string }[]).map((r) => r.symbol) }));
  }
  createWatchlist(name: string) {
    const r = this.db.prepare('INSERT INTO watchlists (mode, name) VALUES (?, ?)').run(this.mode, name);
    return Number(r.lastInsertRowid);
  }
  renameWatchlist(id: number, name: string) {
    return this.db.prepare('UPDATE watchlists SET name = ? WHERE id = ? AND mode = ?').run(name, id, this.mode).changes > 0;
  }
  deleteWatchlist(id: number) {
    return this.db.prepare('DELETE FROM watchlists WHERE id = ? AND mode = ?').run(id, this.mode).changes > 0;
  }
  ownsWatchlist(id: number) {
    return !!this.db.prepare('SELECT 1 FROM watchlists WHERE id = ? AND mode = ?').get(id, this.mode);
  }
  addToWatchlist(id: number, symbol: string) {
    const pos = (this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM watchlist_items WHERE watchlist_id = ?').get(id) as { p: number }).p;
    this.db.prepare('INSERT OR IGNORE INTO watchlist_items (watchlist_id, symbol, position) VALUES (?, ?, ?)').run(id, symbol, pos);
  }
  removeFromWatchlist(id: number, symbol: string) {
    this.db.prepare('DELETE FROM watchlist_items WHERE watchlist_id = ? AND symbol = ?').run(id, symbol);
  }

  // Portfolios
  listPortfolios() {
    return this.db.prepare('SELECT id, name, base_currency AS baseCurrency FROM portfolios WHERE mode = ? ORDER BY id').all(this.mode) as { id: number; name: string; baseCurrency: string }[];
  }
  getPortfolio(id: number) {
    return this.db.prepare('SELECT id, name, base_currency AS baseCurrency FROM portfolios WHERE id = ? AND mode = ?').get(id, this.mode) as { id: number; name: string; baseCurrency: string } | undefined;
  }
  createPortfolio(name: string, baseCurrency: string) {
    return Number(this.db.prepare('INSERT INTO portfolios (mode, name, base_currency) VALUES (?, ?, ?)').run(this.mode, name, baseCurrency).lastInsertRowid);
  }
  deletePortfolio(id: number) {
    return this.db.prepare('DELETE FROM portfolios WHERE id = ? AND mode = ?').run(id, this.mode).changes > 0;
  }
  listTransactions(portfolioId: number): Transaction[] {
    const rows = this.db.prepare('SELECT * FROM transactions WHERE portfolio_id = ? ORDER BY date, id').all(portfolioId) as Record<string, string | number | null>[];
    return rows.map((r) => {
      const t: Transaction = { id: r.id as number, date: r.date as string, type: r.type as Transaction['type'], currency: r.currency as string };
      for (const [col, key] of [['symbol', 'symbol'], ['quantity', 'quantity'], ['price', 'price'], ['amount', 'amount'], ['fee', 'fee'], ['split_ratio', 'splitRatio'], ['note', 'note']] as const)
        if (r[col] !== null && r[col] !== undefined) (t as unknown as Record<string, string>)[key] = String(r[col]);
      return t;
    });
  }
  addTransaction(portfolioId: number, t: Transaction) {
    return Number(
      this.db
        .prepare('INSERT INTO transactions (portfolio_id, date, type, symbol, quantity, price, amount, fee, currency, split_ratio, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(portfolioId, t.date, t.type, t.symbol ?? null, t.quantity ?? null, t.price ?? null, t.amount ?? null, t.fee ?? null, t.currency, t.splitRatio ?? null, t.note ?? null).lastInsertRowid,
    );
  }
  /** Inserts all or none. */
  addTransactions(portfolioId: number, txs: Transaction[]) {
    this.db.exec('BEGIN');
    try {
      for (const t of txs) this.addTransaction(portfolioId, t);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  deleteTransaction(portfolioId: number, txId: number) {
    return this.db.prepare('DELETE FROM transactions WHERE id = ? AND portfolio_id = ?').run(txId, portfolioId).changes > 0;
  }

  // Layouts, recents, screens
  getLayout(name: string) {
    const r = this.db.prepare('SELECT json, updated_at FROM layouts WHERE name = ?').get(`${this.mode}:${name}`) as { json: string; updated_at: string } | undefined;
    return r ? { layout: JSON.parse(r.json), updatedAt: r.updated_at } : null;
  }
  saveLayout(name: string, layout: unknown) {
    this.db.prepare("INSERT INTO layouts (name, json, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at").run(`${this.mode}:${name}`, JSON.stringify(layout));
  }
  recentCommands(limit = 15) {
    return (this.db.prepare('SELECT command FROM recent_commands ORDER BY used_at DESC LIMIT ?').all(limit) as { command: string }[]).map((r) => r.command);
  }
  addRecent(command: string) {
    this.db.prepare('INSERT INTO recent_commands (command, used_at) VALUES (?, ?) ON CONFLICT(command) DO UPDATE SET used_at = excluded.used_at').run(command, new Date().toISOString());
    this.db.prepare('DELETE FROM recent_commands WHERE command NOT IN (SELECT command FROM recent_commands ORDER BY used_at DESC LIMIT 100)').run();
  }
  listScreens() {
    return (this.db.prepare('SELECT id, name, json FROM saved_screens WHERE mode = ? ORDER BY name').all(this.mode) as { id: number; name: string; json: string }[]).map((r) => ({ id: r.id, name: r.name, filters: JSON.parse(r.json) }));
  }
  saveScreen(name: string, filters: unknown) {
    this.db.prepare("INSERT INTO saved_screens (mode, name, json) VALUES (?, ?, ?) ON CONFLICT(mode, name) DO UPDATE SET json = excluded.json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run(this.mode, name, JSON.stringify(filters));
  }
  deleteScreen(id: number) {
    this.db.prepare('DELETE FROM saved_screens WHERE id = ? AND mode = ?').run(id, this.mode);
  }

  /** First-run content for demo mode only, so the demo opens with something to look at. */
  seedDemo() {
    if (this.mode !== 'demo') return;
    if (this.listWatchlists().length === 0) {
      const id = this.createWatchlist('Core');
      for (const s of ['NOVA', 'QBIT', 'LDGR', 'SGNL', 'KSTL', 'PNRG', 'EURX', 'HLXM']) this.addToWatchlist(id, s);
    }
    if (this.listPortfolios().length === 0) {
      const id = this.createPortfolio('Demo Portfolio', 'USD');
      const txs: Transaction[] = [
        { date: '2024-01-02', type: 'DEPOSIT', amount: '100000', currency: 'USD' },
        { date: '2024-01-03', type: 'BUY', symbol: 'NOVA', quantity: '150', price: '110.00', fee: '1.00', currency: 'USD' },
        { date: '2024-01-03', type: 'BUY', symbol: 'LDGR', quantity: '80', price: '240.00', fee: '1.00', currency: 'USD' },
        { date: '2024-03-15', type: 'BUY', symbol: 'TDWL', quantity: '300', price: '60.00', fee: '1.00', currency: 'USD' },
        { date: '2024-06-03', type: 'SELL', symbol: 'NOVA', quantity: '50', price: '125.00', fee: '1.00', currency: 'USD' },
        { date: '2024-09-30', type: 'DIVIDEND', symbol: 'TDWL', amount: '216.00', currency: 'USD' },
        { date: '2025-02-10', type: 'DEPOSIT', amount: '20000', currency: 'EUR' },
        { date: '2025-02-11', type: 'BUY', symbol: 'EURX', quantity: '120', price: '95.00', fee: '2.00', currency: 'EUR' },
      ];
      for (const t of txs) this.addTransaction(id, { ...t, note: 'Demo seed (synthetic)' });
    }
  }
}
