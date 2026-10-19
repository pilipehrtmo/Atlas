import { FUNCTIONS, type Provenance } from '@atlas/core';
import { Fragment, useMemo, useState } from 'react';
import { api, invalidate, useApi } from '../api';
import { ErrorBox, Loading, Prov, Section, Unavailable, V } from '../components/common';
import { fmtCompact, fmtNum, fmtPct, NA, tone } from '../format';
import { useTerminal } from '../terminal';
import { useMemoSorted } from './security';
import type { ViewProps } from './types';

// ---------------- Screener

interface ScreenRow {
  symbol: string; name: string; sector: string; country: string; currency: string; price: number; changePercent: number;
  marketCap: number | null; pe: number | null; revenueGrowth: number | null; netMargin: number | null; debtToEquity: number | null;
  dividendYield: number | null; return1Y: number | null; avgVolume30: number | null; fiscalYear: number | null;
}
type Universe = { status: 'ok'; rows: ScreenRow[]; provenance: Provenance; definitions: Record<string, string> } | { status: 'unavailable'; reason: string };
type NumKey = 'marketCap' | 'pe' | 'revenueGrowth' | 'netMargin' | 'debtToEquity' | 'dividendYield' | 'return1Y' | 'avgVolume30' | 'price' | 'changePercent';
type Filters = { sector: string; ranges: Partial<Record<NumKey, { min?: string; max?: string }>> };

const COLS: { key: NumKey; label: string; fmt: (v: number | null) => string; pct?: boolean; hint: string }[] = [
  { key: 'price', label: 'Price', fmt: (v) => fmtNum(v), hint: 'e.g. 50' },
  { key: 'changePercent', label: '1D %', fmt: (v) => fmtPct(v), hint: '% points' },
  { key: 'marketCap', label: 'Mkt cap', fmt: (v) => fmtCompact(v), hint: 'e.g. 10e9' },
  { key: 'pe', label: 'P/E', fmt: (v) => fmtNum(v, 1), hint: 'e.g. 25' },
  { key: 'revenueGrowth', label: 'Rev growth', fmt: (v) => fmtPct(v, 1, true), pct: true, hint: '%' },
  { key: 'netMargin', label: 'Net margin', fmt: (v) => fmtPct(v, 1, true, false), pct: true, hint: '%' },
  { key: 'debtToEquity', label: 'LT debt/Eq', fmt: (v) => fmtNum(v, 2), hint: 'e.g. 1' },
  { key: 'dividendYield', label: 'Div yield', fmt: (v) => fmtPct(v, 2, true, false), pct: true, hint: '%' },
  { key: 'return1Y', label: '1Y return', fmt: (v) => fmtPct(v, 1, true), pct: true, hint: '%' },
  { key: 'avgVolume30', label: 'Avg vol 30D', fmt: (v) => fmtCompact(v), hint: 'shares' },
];

function passes(r: ScreenRow, f: Filters) {
  if (f.sector && r.sector !== f.sector) return false;
  for (const c of COLS) {
    const rg = f.ranges[c.key];
    if (!rg || (rg.min === undefined && rg.max === undefined) || (!rg.min && !rg.max)) continue;
    const v = r[c.key];
    if (v === null) return false; // a filter on a metric excludes rows where it is unavailable
    const scale = c.pct ? 100 : 1;
    if (rg.min && v * scale < Number(rg.min)) return false;
    if (rg.max && v * scale > Number(rg.max)) return false;
  }
  return true;
}

export function SCREENER(_: ViewProps) {
  const u = useApi<Universe>('/api/screener/universe');
  const screens = useApi<{ id: number; name: string; filters: Filters }[]>('/api/screens');
  const [f, setF] = useState<Filters>({ sector: '', ranges: {} });
  const [sort, setSort] = useState<{ key: keyof ScreenRow | null; dir: 1 | -1 }>({ key: 'marketCap', dir: -1 });
  const [saveName, setSaveName] = useState('');
  const { run } = useTerminal();
  const rows = useMemo(() => (u.data?.status === 'ok' ? u.data.rows.filter((r) => passes(r, f)) : []), [u.data, f]);
  const sorted = useMemoSorted(rows, sort.key, sort.dir);
  if (u.error) return <ErrorBox error={u.error} onRetry={u.reload} />;
  if (!u.data) return <Loading lines={6} />;
  if (u.data.status === 'unavailable') return <Unavailable title="Screener unavailable in live mode" reason={u.data.reason} />;
  const data = u.data;
  const sectors = [...new Set(data.rows.map((r) => r.sector))].sort();
  const setRange = (k: NumKey, side: 'min' | 'max', val: string) => setF({ ...f, ranges: { ...f.ranges, [k]: { ...f.ranges[k], [side]: val || undefined } } });
  const exportCsv = () => {
    const head = ['symbol', 'name', 'sector', 'country', 'currency', ...COLS.map((c) => c.key), 'fiscalYear'];
    const esc = (v: unknown) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [`# Atlas screener export ${new Date().toISOString()} | source: ${data.provenance.providerName} (${data.provenance.timeliness}) | blank = unavailable`, head.join(','), ...sorted.map((r) => head.map((h) => esc(r[h as keyof ScreenRow])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `atlas-screen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const th = (key: keyof ScreenRow, label: string, num = true, title?: string) => (
    <th className={`sortable ${num ? 'num' : ''}`} title={title} onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  );
  return (
    <div className="col">
      <Section title="Filters" right={<span className="row"><Prov p={data.provenance} /><button className="btn" onClick={() => setF({ sector: '', ranges: {} })}>Clear</button></span>}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="col" style={{ gap: 2 }}><span className="dim">Sector</span>
            <select className="in" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}><option value="">All</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          {COLS.filter((c) => c.key !== 'price').map((c) => (
            <label key={c.key} className="col" style={{ gap: 2 }} title={data.definitions[c.key] ?? ''}>
              <span className="dim">{c.label}{c.pct ? ' (%)' : ''}</span>
              <span className="row" style={{ gap: 2 }}>
                <input className="in mono" style={{ width: 52 }} placeholder="min" value={f.ranges[c.key]?.min ?? ''} onChange={(e) => setRange(c.key, 'min', e.target.value)} />
                <input className="in mono" style={{ width: 52 }} placeholder="max" value={f.ranges[c.key]?.max ?? ''} onChange={(e) => setRange(c.key, 'max', e.target.value)} />
              </span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="dim">Saved:</span>
          {(screens.data ?? []).map((s) => <span key={s.id} className="chip" onClick={() => setF(s.filters)}>{s.name} <span className="dim" onClick={async (e) => { e.stopPropagation(); await api(`/api/screens/${s.id}`, { method: 'DELETE' }); invalidate('/api/screens'); screens.reload(); }}>×</span></span>)}
          <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!saveName.trim()) return; await api('/api/screens', { method: 'POST', body: { name: saveName.trim(), filters: f } }); setSaveName(''); invalidate('/api/screens'); screens.reload(); }}>
            <input className="in" placeholder="Save current screen as…" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ width: 160 }} />
            <button className="btn">Save</button>
          </form>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </Section>
      <Section title={`Results: ${sorted.length} of ${data.rows.length}`} pad={false}>
        <table className="t sticky">
          <thead><tr>{th('symbol', 'Symbol', false)}{th('name', 'Name', false)}{th('sector', 'Sector', false)}{COLS.map((c) => <Fragment key={c.key}>{th(c.key, c.label, true, data.definitions[c.key])}</Fragment>)}</tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.symbol} className="click" onClick={() => run(r.symbol)}>
              <td className="sym">{r.symbol}</td><td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td><td className="dim">{r.sector}</td>
              {COLS.map((c) => <td key={c.key} className={`num ${c.key === 'changePercent' || c.key === 'return1Y' || c.key === 'revenueGrowth' ? tone(r[c.key]) : ''}`}><V>{c.fmt(r[c.key])}</V></td>)}
            </tr>
          ))}</tbody>
        </table>
      </Section>
    </div>
  );
}

// ---------------- Research assistant

interface ResearchAnswer {
  status: 'ok' | 'no-ai' | 'error';
  question: string;
  symbol: string | null;
  sources: { id: string; title: string; text: string; provenance: Provenance }[];
  missing: string[];
  segments: { text: string; citations: { sourceId: string; citedText: string }[] }[];
  model?: string;
  note: string;
  generatedAt: string;
}

const PRESETS = [
  'What changed in this company\'s financial profile over the last three fiscal years?',
  'What are the key risks visible in the retrieved data?',
  'How have margins and cash generation trended?',
  'What recent filings could affect the investment thesis?',
  'What would invalidate a bullish thesis, based on the data available?',
];

export function RESEARCH({ cmd }: ViewProps) {
  const { meta } = useTerminal();
  const [symbol, setSymbol] = useState(cmd.symbol ?? '');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<ResearchAnswer | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const ask = async (question: string) => {
    setBusy(true); setErr(null); setAns(null);
    try { setAns(await api<ResearchAnswer>('/api/research', { method: 'POST', body: { question, symbol: symbol.trim() || null } })); }
    catch (e) { setErr(e as Error); }
    finally { setBusy(false); }
  };
  return (
    <div className="col">
      <Section title="Ask" right={<span className="dim">{meta.aiConfigured ? `Model: ${meta.aiModel}` : 'AI not configured: evidence only'}</span>}>
        <form className="col" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) ask(q.trim()); }}>
          <div className="row">
            <input className="in mono" placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} style={{ width: 90 }} />
            <input className="in" placeholder="Ask a question grounded in Atlas data…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn primary" disabled={busy}>{busy ? 'Working…' : 'Ask'}</button>
          </div>
          <div className="row">{PRESETS.map((p) => <span key={p} className="chip" onClick={() => { setQ(p); ask(p); }}>{p}</span>)}</div>
        </form>
      </Section>
      {busy && <Loading lines={5} />}
      {err && <ErrorBox error={err} />}
      {ans && <Answer a={ans} />}
      {!ans && !busy && <div className="dim">Answers use only data Atlas retrieved from its configured providers. Each cited passage links to its source; uncited text is the model's interpretation.</div>}
    </div>
  );
}

function Answer({ a }: { a: ResearchAnswer }) {
  const byId = Object.fromEntries(a.sources.map((s) => [s.id, s]));
  return (
    <>
      <Section title={a.status === 'ok' ? 'Answer (AI-generated, cited)' : a.status === 'no-ai' ? 'No AI answer' : 'Research failed'} right={<span className="dim">{a.model ?? ''} · {new Date(a.generatedAt).toLocaleString()}</span>}>
        {a.status === 'ok' ? (
          <div className="answer">
            {a.segments.map((s, i) => (
              <span key={i}>
                {s.text}
                {[...new Set(s.citations.map((c) => c.sourceId))].map((id) => (
                  <span key={id} className="cite" title={s.citations.filter((c) => c.sourceId === id).map((c) => `“${c.citedText.trim()}”`).join('\n')}>[{id}]</span>
                ))}
              </span>
            ))}
          </div>
        ) : <div className={a.status === 'error' ? 'down' : 'warn'}>{a.note}</div>}
        {a.status === 'ok' && <div className="dim" style={{ marginTop: 8, fontSize: 10 }}>{a.note}</div>}
      </Section>
      {a.missing.length > 0 && (
        <Section title="Missing data">
          <ul style={{ margin: 0, paddingLeft: 16 }}>{a.missing.map((m) => <li key={m} className="warn">{m}</li>)}</ul>
        </Section>
      )}
      <Section title={`Sources retrieved (${a.sources.length})`} pad={false}>
        {a.sources.length === 0 ? <div className="notice">Nothing could be retrieved{a.symbol ? ` for ${a.symbol}` : ''}. Add a symbol to ground the question in company data.</div> : (
          <table className="t"><tbody>{a.sources.map((s) => (
            <tr key={s.id}>
              <td className="sym" style={{ width: 30 }}>{byId[s.id] && s.id}</td><td>{s.title}</td><td><Prov p={s.provenance} /></td>
              <td><details><summary className="dim" style={{ cursor: 'pointer' }}>view extract</summary><pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 10, maxHeight: 220, overflow: 'auto' }}>{s.text}</pre></details></td>
            </tr>
          ))}</tbody></table>
        )}
      </Section>
    </>
  );
}

// ---------------- Help and status

export function HELP(_: ViewProps) {
  const { run } = useTerminal();
  const cats = [...new Set(FUNCTIONS.map((f) => f.category))];
  return (
    <div className="help">
      <h3>Command syntax</h3>
      <table className="t"><tbody>
        <tr><td className="mono">SYMBOL</td><td>Opens the company overview (DES). Example: <span className="mono">NOVA</span>, <span className="mono">AAPL &lt;GO&gt;</span></td></tr>
        <tr><td className="mono">SYMBOL FUNCTION</td><td>Runs a security function. Example: <span className="mono">AAPL FA</span>, <span className="mono">MSFT FIL</span></td></tr>
        <tr><td className="mono">FUNCTION [ARGS]</td><td>Opens a workspace. Example: <span className="mono">ECO UNRATE</span>, <span className="mono">FX EURUSD</span>, <span className="mono">FILINGS MSFT</span></td></tr>
        <tr><td className="mono">$SYMBOL</td><td>Forces a symbol when it collides with a function name, e.g. <span className="mono">$FX</span></td></tr>
        <tr><td className="mono">GO</td><td>Optional terminator, accepted and ignored: <span className="mono">AAPL GO</span></td></tr>
      </tbody></table>
      <h3>Keyboard</h3>
      <table className="t"><tbody>
        <tr><td><kbd>/</kbd> <kbd>`</kbd> <kbd>Ctrl</kbd>+<kbd>K</kbd> or just start typing</td><td>Focus the command bar</td></tr>
        <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Tab</kbd> <kbd>Enter</kbd> <kbd>Esc</kbd></td><td>Navigate, complete, run, cancel suggestions</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>4</kbd></td><td>Select pane; commands run in the selected pane</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>Back / forward in the selected pane</td></tr>
        <tr><td><kbd>F1</kbd></td><td>Help</td></tr>
      </tbody></table>
      {cats.map((c) => (
        <div key={c}>
          <h3>{c}</h3>
          <table className="t"><tbody>
            {FUNCTIONS.filter((f) => f.category === c).map((f) => (
              <tr key={f.id} className="click" onClick={() => f.args !== 'symbol-required' && run(f.id)}>
                <td className="sym" style={{ width: 90 }}>{f.id}</td><td style={{ width: 160 }}>{f.title}</td><td className="muted">{f.description}</td>
                <td className="mono dim">{f.example}</td><td className="dim">{f.aliases.join(', ')}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
    </div>
  );
}

export function STATUS(_: ViewProps) {
  const { meta } = useTerminal();
  return (
    <div className="col">
      <Section title="Data mode">
        {meta.mode === 'demo'
          ? <div><span className="mode demo">DEMO</span> All data is synthetic and generated locally for fictional companies. Filings and news are never simulated. Set <span className="mono">ATLAS_DATA_MODE=live</span> to use real providers.</div>
          : <div><span className="mode live">LIVE</span> Data comes from the providers below. A capability without a configured provider shows as unavailable; Atlas never substitutes demo data in live mode.</div>}
      </Section>
      <Section title="Capability routing" pad={false}>
        <table className="t"><tbody>{Object.entries(meta.routes).map(([cap, p]) => (
          <tr key={cap}><td className="mono" style={{ width: 110 }}>{cap}</td><td>{p ?? <span className="warn">not available</span>}</td><td className="muted" style={{ whiteSpace: 'normal' }}>{p ? '' : meta.unavailableReasons[cap]}</td></tr>
        ))}</tbody></table>
      </Section>
      <Section title="Providers" pad={false}>
        <table className="t">
          <thead><tr><th>Provider</th><th>Status</th><th>Capabilities</th><th>Terms and limits</th></tr></thead>
          <tbody>{meta.providers.map((p) => (
            <tr key={p.id}>
              <td>{p.homepage ? <a href={p.homepage} target="_blank" rel="noreferrer">{p.name}</a> : p.name}</td>
              <td className={p.configured ? 'up' : 'warn'}>{p.configured ? 'configured' : p.requiresKey ? 'needs API key' : 'needs configuration'}</td>
              <td className="mono dim">{p.capabilities.join(', ')}</td>
              <td className="muted" style={{ whiteSpace: 'normal' }}>{p.terms}</td>
            </tr>
          ))}</tbody>
        </table>
      </Section>
      <Section title="AI research">
        <V>{meta.aiConfigured ? `Configured, model ${meta.aiModel}` : NA}</V>{!meta.aiConfigured && <span className="muted"> Set ANTHROPIC_API_KEY to enable cited AI answers. Without it, RESEARCH shows the retrieved evidence only.</span>}
      </Section>
    </div>
  );
}

