import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { CommandBar, type CommandBarHandle } from './components/CommandBar';
import { ErrorBox, Loading } from './components/common';
import { cmdLabel, fnDef, TerminalCtx, toPaneCmd, type Meta, type PaneCmd, type TerminalApi } from './terminal';
import { VIEWS } from './views';

interface PaneState { stack: PaneCmd[]; pos: number }
interface SavedLayout { panes: PaneCmd[]; sizes: Record<string, Layout> }

const DEFAULT_PANES = (mode: Meta['mode']): PaneCmd[] => [
  { fn: 'MKT', args: [] },
  { fn: 'DES', symbol: mode === 'demo' ? 'NOVA' : 'AAPL', args: [] },
  { fn: 'W', args: [] },
  { fn: 'PORT', args: [] },
];

export function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [bootError, setBootError] = useState<Error | null>(null);
  const [saved, setSaved] = useState<SavedLayout | null | undefined>(undefined);

  const boot = useCallback(() => {
    setBootError(null);
    Promise.all([api<Meta>('/api/meta'), api<{ layout: SavedLayout } | null>('/api/layouts/default')])
      .then(([m, l]) => { setMeta(m); setSaved(l?.layout ?? null); document.title = m.productName; })
      .catch(setBootError);
  }, []);
  useEffect(boot, [boot]);

  if (bootError) return <div style={{ padding: 20, maxWidth: 520 }}><ErrorBox error={bootError} onRetry={boot} /></div>;
  if (!meta || saved === undefined) return <div style={{ padding: 20 }}><Loading /></div>;
  return <Terminal meta={meta} saved={saved} />;
}

function Terminal({ meta, saved }: { meta: Meta; saved: SavedLayout | null }) {
  const [panes, setPanes] = useState<PaneState[]>(() => (saved?.panes?.length === 4 ? saved.panes : DEFAULT_PANES(meta.mode)).map((c) => ({ stack: [c], pos: 0 })));
  const [active, setActive] = useState(0);
  const [maximized, setMaximized] = useState<number | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());
  const sizes = useRef<Record<string, Layout>>(saved?.sizes ?? {});
  const bar = useRef<CommandBarHandle>(null);

  useEffect(() => { api<string[]>('/api/recent').then(setRecent).catch(() => undefined); }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // Persist the workspace (pane contents and sizes), debounced.
  const persist = useRef<ReturnType<typeof setTimeout>>(undefined);
  const save = useCallback((p: PaneState[]) => {
    clearTimeout(persist.current);
    persist.current = setTimeout(() => {
      api('/api/layouts/default', { method: 'PUT', body: { layout: { panes: p.map((x) => x.stack[x.pos]), sizes: sizes.current } } }).catch(() => undefined);
    }, 600);
  }, []);
  useEffect(() => save(panes), [panes, save]);

  const open = useCallback((cmd: PaneCmd, pane?: number) => {
    const target = pane ?? active;
    setPanes((ps) => ps.map((p, i) => (i === target ? { stack: [...p.stack.slice(0, p.pos + 1), cmd].slice(-50), pos: Math.min(p.pos + 1, 49) } : p)));
    if (pane !== undefined) setActive(pane);
  }, [active]);

  const run = useCallback((command: string, pane?: number) => {
    const r = toPaneCmd(command);
    if (!r.ok) return r.error;
    open(r.cmd, pane);
    const label = cmdLabel(r.cmd);
    api<string[]>('/api/recent', { method: 'POST', body: { command: label } }).then(setRecent).catch(() => undefined);
    return null;
  }, [open]);

  const nav = useCallback((pane: number, delta: number) => {
    setPanes((ps) => ps.map((p, i) => (i === pane ? { ...p, pos: Math.max(0, Math.min(p.stack.length - 1, p.pos + delta)) } : p)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); bar.current?.focus(); return; }
      if (e.key === 'F1') { e.preventDefault(); run('HELP'); return; }
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); const n = Number(e.code.slice(5)) - 1; setActive(n); setMaximized((m) => (m === null ? null : n)); return; }
      if (e.altKey && e.key === 'Enter') { e.preventDefault(); setMaximized((m) => (m === null ? active : null)); return; }
      if (e.key === 'Escape' && !typing && maximized !== null) { setMaximized(null); return; }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); nav(active, -1); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); nav(active, 1); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' || e.key === '`') { e.preventDefault(); bar.current?.focus(''); return; }
      // Typing anywhere starts a command, terminal-style.
      if (/^[a-zA-Z$?]$/.test(e.key)) { e.preventDefault(); bar.current?.focus(e.key.toUpperCase()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, nav, active, maximized]);

  const ctx: TerminalApi = useMemo(() => ({ meta, run, open }), [meta, run, open]);
  const onSizes = (key: string) => (l: Layout) => { sizes.current = { ...sizes.current, [key]: l }; save(panes); };

  const pane = (i: number) => {
    const p = panes[i];
    const cmd = p.stack[p.pos];
    const def = fnDef(cmd.fn);
    const View = VIEWS[cmd.fn];
    return (
      <div className={`pane ${i === active ? 'active' : ''}`} onMouseDown={() => setActive(i)}>
        <div className="pane-head" onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; setMaximized((m) => (m === null ? i : null)); }}>
          <span className="pane-no">{i + 1}</span>
          <button className="icon-btn" title="Back (Alt+←)" disabled={p.pos === 0} onClick={() => nav(i, -1)}>‹</button>
          <button className="icon-btn" title="Forward (Alt+→)" disabled={p.pos >= p.stack.length - 1} onClick={() => nav(i, 1)}>›</button>
          <span className="pane-title">{cmdLabel(cmd)}</span>
          <span className="pane-sub">{def.title}</span>
          <span className="spacer" />
          <button className="icon-btn" title="Show help in this pane" onClick={() => run('HELP', i)}>?</button>
          <button className="icon-btn" title={maximized === i ? 'Restore (Alt+Enter or Esc)' : 'Maximize (Alt+Enter)'} aria-label={maximized === i ? 'Restore pane' : 'Maximize pane'} onClick={() => setMaximized(maximized === i ? null : i)}>{maximized === i ? '▣' : '□'}</button>
        </div>
        <div className="pane-body">
          {View ? <View key={cmdLabel(cmd)} cmd={cmd} pane={i} /> : <ErrorBox error={new Error(`No view registered for ${cmd.fn}`)} />}
        </div>
      </div>
    );
  };

  return (
    <TerminalCtx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <span className="brand">
            <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M4 16h24M16 4c-5 4-5 20 0 24M16 4c5 4 5 20 0 24" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            {meta.productName.toUpperCase()}
          </span>
          <CommandBar ref={bar} onRun={(c) => run(c)} recent={recent} />
          <span className={`mode ${meta.mode}`} title={meta.mode === 'demo' ? 'All data is synthetic. Fictional companies. Not market data.' : 'Live providers. See STATUS for sources and delays.'}>
            {meta.mode === 'demo' ? 'DEMO · SYNTHETIC DATA' : 'LIVE DATA'}
          </span>
          <span className="clock" title="Local time / UTC">
            {now.toLocaleTimeString([], { hour12: false })} · {now.toISOString().slice(11, 19)} UTC
          </span>
        </header>
        <main className="workspace">
          {maximized !== null ? pane(maximized) : (
          <Group orientation="horizontal" defaultLayout={sizes.current.outer} onLayoutChanged={onSizes('outer')}>
            <Panel id="left" minSize="20">
              <Group orientation="vertical" defaultLayout={sizes.current.left} onLayoutChanged={onSizes('left')}>
                <Panel id="p1" minSize="15">{pane(0)}</Panel>
                <Separator className="sep" />
                <Panel id="p3" minSize="15">{pane(2)}</Panel>
              </Group>
            </Panel>
            <Separator className="sep" />
            <Panel id="right" minSize="20">
              <Group orientation="vertical" defaultLayout={sizes.current.right} onLayoutChanged={onSizes('right')}>
                <Panel id="p2" minSize="15">{pane(1)}</Panel>
                <Separator className="sep" />
                <Panel id="p4" minSize="15">{pane(3)}</Panel>
              </Group>
            </Panel>
          </Group>
          )}
        </main>
        <footer className="statusbar">
          <span><kbd>/</kbd> command</span>
          <span><kbd>Alt</kbd>+<kbd>1-4</kbd> pane</span>
          <span><kbd>Alt</kbd>+<kbd>←</kbd> back</span>
          <span><kbd>Alt</kbd>+<kbd>Enter</kbd> maximize</span>
          <span><kbd>F1</kbd> help</span>
          <span className="spacer" />
          <span>Active pane {active + 1}{maximized !== null ? ' (maximized)' : ''}</span>
          <span>{meta.mode === 'demo' ? 'Demo mode: fictional companies, synthetic prices' : `Prices: ${meta.routes.quote ?? 'none'} · Filings: ${meta.routes.filings ?? 'none'} · Macro: ${meta.routes.macro ?? 'none'}`}</span>
          <span>Information only. Not investment advice.</span>
        </footer>
      </div>
    </TerminalCtx.Provider>
  );
}
