-- Atlas initial schema. Money and quantities are stored as TEXT decimal strings
-- to avoid binary floating point; the application parses them with decimal.js.
-- `mode` keeps demo-mode records (fictional symbols) apart from live-mode records.

CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (mode, name)
);

CREATE TABLE watchlist_items (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  position INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (watchlist_id, symbol)
);

CREATE TABLE portfolios (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (mode, name)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND','DEPOSIT','WITHDRAWAL','FEE','SPLIT')),
  symbol TEXT,
  quantity TEXT,
  price TEXT,
  amount TEXT,
  fee TEXT,
  currency TEXT NOT NULL,
  split_ratio TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX transactions_portfolio ON transactions (portfolio_id, date, id);

CREATE TABLE layouts (
  name TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE recent_commands (
  command TEXT PRIMARY KEY,
  used_at TEXT NOT NULL
);

CREATE TABLE saved_screens (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL,
  name TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (mode, name)
);
