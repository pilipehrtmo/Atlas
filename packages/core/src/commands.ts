/**
 * Atlas command language (documented in docs/COMMANDS.md).
 *
 *   <FUNCTION> [ARGS...]          NEWS, PORT, ECO CPIAUCSL, FX EURUSD
 *   <SYMBOL> [FUNCTION] [GO]      AAPL, AAPL GO, AAPL FA, AAPL FIL
 *   $<SYMBOL> ...                 forces a symbol when it collides with a function name
 *
 * "GO" (or "<GO>") is an optional terminator and is ignored. Functions are
 * matched before symbols. The registry is data, so new functions only need a
 * definition here and a view registered in the web app.
 */

export type ArgKind = 'none' | 'symbol-optional' | 'symbol-required' | 'text-optional';

export interface FunctionDef {
  id: string; // canonical mnemonic, e.g. "DES"
  aliases: string[];
  title: string;
  description: string;
  category: 'Markets' | 'Security' | 'News & Events' | 'Macro' | 'Portfolio' | 'Research' | 'System';
  args: ArgKind;
  /** Default function for a bare symbol. */
  isSymbolDefault?: boolean;
  /** Usage example shown in help. */
  example: string;
}

export const FUNCTIONS: FunctionDef[] = [
  { id: 'MKT', aliases: ['MARKETS', 'TOP'], title: 'Market Overview', description: 'Indices, movers, sectors, FX, rates and commodities', category: 'Markets', args: 'none', example: 'MKT' },
  { id: 'DES', aliases: ['OVERVIEW', 'CO'], title: 'Company Overview', description: 'Quote, chart, profile and key statistics', category: 'Security', args: 'symbol-required', isSymbolDefault: true, example: 'AAPL DES' },
  { id: 'GP', aliases: ['CHART', 'GRAPH'], title: 'Price Chart', description: 'Historical price and volume', category: 'Security', args: 'symbol-required', example: 'AAPL GP' },
  { id: 'FA', aliases: ['FIN', 'FINANCIALS'], title: 'Financial Statements', description: 'Reported income, balance sheet and cash flow lines from filings', category: 'Security', args: 'symbol-required', example: 'AAPL FA' },
  { id: 'FIL', aliases: ['FILINGS'], title: 'Filings', description: 'Regulatory filings with links to source documents', category: 'Security', args: 'symbol-optional', example: 'FILINGS AAPL' },
  { id: 'NEWS', aliases: ['N'], title: 'News', description: 'News feed with source attribution', category: 'News & Events', args: 'symbol-optional', example: 'NEWS AAPL' },
  { id: 'EARNINGS', aliases: ['ERN', 'EVTS'], title: 'Earnings & Events', description: 'Earnings dates and corporate events', category: 'News & Events', args: 'symbol-optional', example: 'EARNINGS' },
  { id: 'ECO', aliases: ['MACRO'], title: 'Economics', description: 'Macro indicators with source, frequency, unit and release date', category: 'Macro', args: 'text-optional', example: 'ECO CPIAUCSL' },
  { id: 'YC', aliases: ['RATES', 'CURVE'], title: 'Yield Curve', description: 'Government bond yields by tenor', category: 'Macro', args: 'none', example: 'YC' },
  { id: 'FX', aliases: ['FOREX', 'CCY'], title: 'Currencies', description: 'Reference FX rates and history', category: 'Markets', args: 'text-optional', example: 'FX EURUSD' },
  { id: 'SCREENER', aliases: ['EQS', 'SCREEN'], title: 'Stock Screener', description: 'Filter securities by fundamentals and performance', category: 'Research', args: 'none', example: 'SCREENER' },
  { id: 'PORT', aliases: ['PORTFOLIO', 'PRT'], title: 'Portfolio', description: 'Holdings, transactions, P&L and allocation', category: 'Portfolio', args: 'none', example: 'PORT' },
  { id: 'W', aliases: ['WATCH', 'WATCHLIST'], title: 'Watchlist', description: 'Persistent watchlists', category: 'Portfolio', args: 'none', example: 'W' },
  { id: 'RESEARCH', aliases: ['AI', 'ASK'], title: 'Research Assistant', description: 'Questions answered from retrieved, cited data', category: 'Research', args: 'symbol-optional', example: 'RESEARCH AAPL' },
  { id: 'HELP', aliases: ['?', 'H'], title: 'Help', description: 'Commands, keyboard shortcuts and data sources', category: 'System', args: 'none', example: 'HELP' },
  { id: 'STATUS', aliases: ['SRC', 'DATA'], title: 'Data Sources', description: 'Provider status, data mode and licensing notes', category: 'System', args: 'none', example: 'STATUS' },
];

export interface ParsedCommand {
  fn: FunctionDef;
  symbol?: string;
  args: string[];
  raw: string;
}

export type ParseResult = { ok: true; command: ParsedCommand } | { ok: false; error: string };

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;

export function findFunction(token: string, registry: FunctionDef[] = FUNCTIONS): FunctionDef | undefined {
  const t = token.toUpperCase();
  return registry.find((f) => f.id === t || f.aliases.includes(t));
}

export function isValidSymbol(s: string): boolean {
  return SYMBOL_RE.test(s.toUpperCase());
}

export function parseCommand(input: string, registry: FunctionDef[] = FUNCTIONS): ParseResult {
  const raw = input.trim();
  const tokens = raw
    .replace(/<\s*GO\s*>/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toUpperCase());
  while (tokens.length && tokens[tokens.length - 1] === 'GO') tokens.pop();
  if (tokens.length === 0) return { ok: false, error: 'Empty command' };

  const [first, ...rest] = tokens;
  const forcedSymbol = first.startsWith('$');
  const fn = forcedSymbol ? undefined : findFunction(first, registry);

  if (fn) {
    if (fn.args === 'none') return { ok: true, command: { fn, args: rest, raw } };
    if (fn.args === 'text-optional') return { ok: true, command: { fn, args: rest, raw } };
    const sym = rest[0];
    if (sym !== undefined && !isValidSymbol(sym.replace(/^\$/, ''))) return { ok: false, error: `Invalid symbol "${sym}"` };
    if (fn.args === 'symbol-required' && !sym) return { ok: false, error: `${fn.id} needs a symbol, e.g. ${fn.example}` };
    return { ok: true, command: { fn, symbol: sym?.replace(/^\$/, ''), args: rest.slice(1), raw } };
  }

  const symbol = forcedSymbol ? first.slice(1) : first;
  if (!isValidSymbol(symbol)) return { ok: false, error: `Unknown command "${first}". Type HELP for the list.` };
  const second = rest[0];
  let target = registry.find((f) => f.isSymbolDefault)!;
  if (second) {
    const f = findFunction(second, registry);
    if (!f) return { ok: false, error: `Unknown function "${second}" for ${symbol}` };
    if (f.args === 'none') return { ok: false, error: `${f.id} does not take a symbol` };
    target = f;
  }
  return { ok: true, command: { fn: target, symbol, args: rest.slice(1), raw } };
}

export interface Suggestion {
  value: string; // text to place in the command bar
  label: string;
  detail: string;
  kind: 'function' | 'symbol' | 'recent';
}

/** Ranked completions for the command bar. `symbols` comes from the symbol search API. */
export function suggest(
  input: string,
  opts: { registry?: FunctionDef[]; symbols?: { symbol: string; name: string }[]; recent?: string[]; limit?: number } = {},
): Suggestion[] {
  const registry = opts.registry ?? FUNCTIONS;
  const limit = opts.limit ?? 10;
  const q = input.trim().toUpperCase();
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const push = (s: Suggestion) => {
    if (!seen.has(s.value)) {
      seen.add(s.value);
      out.push(s);
    }
  };

  if (!q) {
    for (const r of opts.recent ?? []) push({ value: r, label: r, detail: 'Recent', kind: 'recent' });
    for (const f of registry) push({ value: f.id, label: f.id, detail: f.title, kind: 'function' });
    return out.slice(0, limit);
  }

  const tokens = q.split(/\s+/);
  if (tokens.length >= 2 && !findFunction(tokens[0], registry)) {
    // "AAPL F" -> functions that accept a symbol
    const part = tokens[1];
    for (const f of registry)
      if (f.args.startsWith('symbol') && (f.id.startsWith(part) || f.aliases.some((a) => a.startsWith(part))))
        push({ value: `${tokens[0]} ${f.id}`, label: `${tokens[0]} ${f.id}`, detail: f.title, kind: 'function' });
    return out.slice(0, limit);
  }

  for (const r of opts.recent ?? []) if (r.startsWith(q)) push({ value: r, label: r, detail: 'Recent', kind: 'recent' });
  for (const f of registry) {
    if (f.id.startsWith(q) || f.aliases.some((a) => a.startsWith(q)))
      push({ value: f.id, label: f.id, detail: f.title, kind: 'function' });
  }
  for (const s of opts.symbols ?? []) push({ value: s.symbol, label: s.symbol, detail: s.name, kind: 'symbol' });
  for (const f of registry) {
    if (f.title.toUpperCase().includes(q)) push({ value: f.id, label: f.id, detail: f.title, kind: 'function' });
  }
  return out.slice(0, limit);
}
