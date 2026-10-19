import type { Filing, FxRate, MacroSeries, Provenance, ProviderResult, Quote, YieldCurve } from '@atlas/core';
import { useState } from 'react';
import { api, invalidate, useApi } from '../api';
import { LineChart } from '../components/Chart';
import { ErrorBox, Loading, Prov, Result, Section, Unavailable, V } from '../components/common';
import { fmtCompact, fmtNum, fmtPct, fmtSigned, NA, tone } from '../format';
import { useTerminal } from '../terminal';
import type { ViewProps } from './types';

type QuoteRow = { symbol: string; name: string; result: ProviderResult<Quote> };
interface Overview {
  mode: string;
  benchmarks: QuoteRow[];
  movers: { gainers: QuoteRow[]; losers: QuoteRow[]; provenance: Provenance | null } | { unavailable: string };
  sectors: { sector: string; changePercent: string; members: number }[] | { unavailable: string };
  sectorMethod: string;
  fx: ProviderResult<FxRate[]>;
  curve: ProviderResult<YieldCurve>;
}

function QuoteTable({ rows, onOpen }: { rows: QuoteRow[]; onOpen: (s: string) => void }) {
  return (
    <table className="t">
      <thead><tr><th>Symbol</th><th>Name</th><th className="num">Last</th><th className="num">Chg</th><th className="num">Chg %</th><th>Source</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} className="click" onClick={() => onOpen(r.symbol)}>
            <td className="sym">{r.symbol}</td>
            <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
            {r.result.status === 'ok' ? (
              <>
                <td className="num">{fmtNum(r.result.data.price)}</td>
                <td className={`num ${tone(r.result.data.change)}`}><V>{fmtSigned(r.result.data.change)}</V></td>
                <td className={`num ${tone(r.result.data.changePercent)}`}><V>{fmtPct(r.result.data.changePercent)}</V></td>
                <td><Prov p={r.result.provenance} staleAfterDays={4} /></td>
              </>
            ) : <td colSpan={4} className="na" title={r.result.reason}>unavailable: {r.result.reason.slice(0, 80)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MKT(_: ViewProps) {
  const ov = useApi<Overview>('/api/market/overview');
  const { run } = useTerminal();
  if (ov.error) return <ErrorBox error={ov.error} onRetry={ov.reload} />;
  if (!ov.data) return <Loading lines={6} />;
  const d = ov.data;
  const open = (s: string) => run(s);
  return (
    <div className="col">
      <Section title={d.mode === 'demo' ? 'Benchmarks (synthetic)' : 'Benchmarks (ETF proxies)'} right={<button className="btn" onClick={ov.reload}>Refresh</button>} pad={false}>
        <QuoteTable rows={d.benchmarks} onOpen={open} />
      </Section>
      <div className="grid2">
        <Section title="Movers" pad={false}>
          {'unavailable' in d.movers ? <Unavailable reason={d.movers.unavailable} /> : (
            <>
              <div className="dim" style={{ padding: '3px 7px' }}>Top gainers</div>
              <QuoteTable rows={d.movers.gainers} onOpen={open} />
              <div className="dim" style={{ padding: '3px 7px' }}>Top losers</div>
              <QuoteTable rows={d.movers.losers} onOpen={open} />
            </>
          )}
        </Section>
        <Section title="Sectors, 1 day" right={<span className="dim" title={d.sectorMethod}>method ⓘ</span>}>
          {'unavailable' in d.sectors ? <Unavailable reason={d.sectors.unavailable} /> : (
            <table className="t"><tbody>
              {d.sectors.map((s) => {
                const v = Number(s.changePercent);
                return (
                  <tr key={s.sector}>
                    <td>{s.sector} <span className="dim">({s.members})</span></td>
                    <td style={{ width: '40%' }}><div className="bar-h" style={{ width: `${Math.min(100, Math.abs(v) * 25)}%`, background: v >= 0 ? 'var(--up)' : 'var(--down)', marginLeft: v >= 0 ? 0 : 'auto' }} /></td>
                    <td className={`num ${tone(v)}`}>{fmtPct(v)}</td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
        </Section>
      </div>
      <div className="grid2">
        <Section title="FX vs USD" right={d.fx.status === 'ok' ? <Prov p={d.fx.provenance} /> : null}>
          {d.fx.status === 'ok' ? <FxTable rates={d.fx.data.filter((r) => ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY'].includes(r.quote))} /> : <Unavailable reason={d.fx.reason} />}
        </Section>
        <Section title="Government yields" right={d.curve.status === 'ok' ? <Prov p={d.curve.provenance} staleAfterDays={5} /> : null}>
          {d.curve.status === 'ok' ? <CurveTable c={d.curve.data} compact /> : <Unavailable reason={d.curve.reason} />}
        </Section>
      </div>
    </div>
  );
}

function FxTable({ rates }: { rates: FxRate[] }) {
  const { run } = useTerminal();
  return (
    <table className="t">
      <thead><tr><th>Pair</th><th className="num">Rate</th><th className="num">Inverse</th><th>Date</th></tr></thead>
      <tbody>{rates.map((r) => (
        <tr key={r.quote} className="click" onClick={() => run(`FX ${r.base}${r.quote}`)}>
          <td className="sym">{r.base}/{r.quote}</td>
          <td className="num">{fmtNum(r.rate, 4)}</td>
          <td className="num">{fmtNum(1 / Number(r.rate), 4)}</td>
          <td className="mono dim">{r.date}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function CurveTable({ c, compact }: { c: YieldCurve; compact?: boolean }) {
  const pts = compact ? c.points.filter((p) => ['3M', '2Y', '5Y', '10Y', '30Y'].includes(p.tenor)) : c.points;
  return (
    <table className="t">
      <thead><tr><th>{c.country}</th>{pts.map((p) => <th key={p.tenor} className="num">{p.tenor}</th>)}</tr></thead>
      <tbody><tr><td className="mono dim">{c.date}</td>{pts.map((p) => <td key={p.tenor} className="num"><V>{p.yieldPct === null ? NA : `${p.yieldPct.toFixed(2)}%`}</V></td>)}</tr></tbody>
    </table>
  );
}

export function YC(_: ViewProps) {
  const curve = useApi<ProviderResult<YieldCurve>>('/api/rates/curve');
  return (
    <Section title="Yield curve" right={curve.data?.status === 'ok' ? <Prov p={curve.data.provenance} staleAfterDays={5} /> : null}>
      <Result q={curve}>
        {(c) => (
          <div className="col">
            <LineChart color="var(--info)" height={240} format={(n) => `${n.toFixed(2)}%`} points={c.points.map((p) => ({ x: p.tenor, y: p.yieldPct }))} />
            <div className="dim" style={{ fontSize: 10 }}>Tenors are evenly spaced, not to scale. Par yields, end of day. Missing tenors are shown as gaps.</div>
            <CurveTable c={c} />
          </div>
        )}
      </Result>
    </Section>
  );
}

export function FX({ cmd }: ViewProps) {
  const [base, setBase] = useState('USD');
  const pair = cmd.args[0]?.length === 6 ? cmd.args[0] : null;
  const rates = useApi<ProviderResult<FxRate[]>>(`/api/fx/rates?base=${base}`);
  return (
    <div className="col">
      {pair && <FxHistory pair={pair} />}
      <Section title="Reference rates" right={<span className="row">{rates.data?.status === 'ok' && <Prov p={rates.data.provenance} staleAfterDays={4} />}<span className="seg">{['USD', 'EUR', 'GBP', 'JPY'].map((b) => <button key={b} className={`btn ${b === base ? 'on' : ''}`} onClick={() => setBase(b)}>{b}</button>)}</span></span>} pad={false}>
        <Result q={rates}>{(r) => <FxTable rates={r} />}</Result>
      </Section>
    </div>
  );
}

function FxHistory({ pair }: { pair: string }) {
  const [days, setDays] = useState(365);
  const h = useApi<ProviderResult<{ date: string; rate: number }[]>>(`/api/fx/history?pair=${pair}&days=${days}`);
  return (
    <Section title={`${pair.slice(0, 3)}/${pair.slice(3)}`} right={<span className="row">{h.data?.status === 'ok' && <Prov p={h.data.provenance} />}<span className="seg">{[30, 90, 365, 1825].map((d) => <button key={d} className={`btn ${d === days ? 'on' : ''}`} onClick={() => setDays(d)}>{d < 365 ? `${d}D` : `${d / 365}Y`}</button>)}</span></span>}>
      <Result q={h}>{(pts) => <LineChart height={220} format={(n) => n.toFixed(4)} points={pts.map((p) => ({ x: p.date, y: p.rate }))} />}</Result>
    </Section>
  );
}

interface CatalogEntry { id: string; title: string; region: string; category: string }

export function ECO({ cmd }: ViewProps) {
  const catalog = useApi<CatalogEntry[]>('/api/macro/catalog');
  const [id, setId] = useState((cmd.args[0] ?? 'CPIAUCSL').toUpperCase());
  const series = useApi<ProviderResult<MacroSeries>>(`/api/macro/${id}`);
  return (
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
      <div style={{ width: 210, flexShrink: 0 }}>
        <Section title="Indicators" pad={false}>
          {catalog.data ? (
            <table className="t"><tbody>
              {catalog.data.map((c) => (
                <tr key={c.id} className="click" onClick={() => setId(c.id)} style={c.id === id ? { boxShadow: 'inset 2px 0 0 var(--accent)' } : undefined}>
                  <td><div>{c.title}</div><div className="dim mono" style={{ fontSize: 10 }}>{c.id} · {c.category}</div></td>
                </tr>
              ))}
            </tbody></table>
          ) : <Loading />}
          <form style={{ padding: 6 }} onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('sid'); if (v) setId(String(v).toUpperCase()); }}>
            <input name="sid" className="in mono" placeholder="Any FRED series id" style={{ width: '100%' }} />
          </form>
        </Section>
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <Result q={series} title="Series unavailable">
          {(s, p) => {
            const obs = s.observations;
            const last = [...obs].reverse().find((o) => o.value !== null);
            const recent = obs.slice(-13).reverse();
            return (
              <>
                <Section title={s.title} right={<Prov p={p} />}>
                  <LineChart color="var(--info)" height={220} format={(n) => fmtNum(n, 2)} points={obs.slice(-240).map((o) => ({ x: o.date, y: o.value }))} />
                </Section>
                <div className="grid2">
                  <Section title="Series details">
                    <dl className="kv">
                      <dt>Series id</dt><dd>{s.id}</dd>
                      <dt>Region</dt><dd>{s.region}</dd>
                      <dt>Frequency</dt><dd>{s.frequency}</dd>
                      <dt>Units</dt><dd style={{ whiteSpace: 'normal' }}>{s.units}</dd>
                      {s.seasonalAdjustment && <><dt>Adjustment</dt><dd>{s.seasonalAdjustment}</dd></>}
                      <dt>Latest observation</dt><dd>{last ? `${fmtNum(last.value, 2)} (${last.date})` : NA}</dd>
                      <dt>Last updated by source</dt><dd><V>{s.lastUpdated ?? NA}</V></dd>
                      <dt>Source</dt><dd style={{ whiteSpace: 'normal' }}>{p.providerName}</dd>
                    </dl>
                    {p.attribution && <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>{p.attribution}</div>}
                  </Section>
                  <Section title="Recent observations" pad={false}>
                    <table className="t">
                      <thead><tr><th>Period</th><th className="num">Value</th><th className="num">Change</th></tr></thead>
                      <tbody>{recent.map((o, i) => {
                        const prev = recent[i + 1]?.value;
                        const chg = o.value !== null && prev !== null && prev !== undefined ? o.value - prev : null;
                        return <tr key={o.date}><td className="mono">{o.date}</td><td className="num"><V>{fmtNum(o.value, 2)}</V></td><td className={`num ${tone(chg)}`}><V>{fmtSigned(chg, 2)}</V></td></tr>;
                      })}</tbody>
                    </table>
                  </Section>
                </div>
              </>
            );
          }}
        </Result>
      </div>
    </div>
  );
}

interface Watchlist { id: number; name: string; symbols: string[] }

export function W(_: ViewProps) {
  const lists = useApi<Watchlist[]>('/api/watchlists');
  const [sel, setSel] = useState(0);
  const [add, setAdd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run } = useTerminal();
  const list = lists.data?.[sel] ?? lists.data?.[0];
  const quotes = useApi<Record<string, ProviderResult<Quote>>>(list && list.symbols.length ? `/api/quotes?symbols=${list.symbols.join(',')}` : null, [list?.symbols.join(',')]);
  const mutate = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); invalidate('/api/watchlists'); invalidate('/api/quotes'); lists.reload(); } catch (e) { setErr((e as Error).message); }
  };
  if (lists.error) return <ErrorBox error={lists.error} onRetry={lists.reload} />;
  if (!lists.data) return <Loading />;
  return (
    <div className="col">
      <div className="row">
        <span className="seg">{lists.data.map((l, i) => <button key={l.id} className={`btn ${l.id === list?.id ? 'on' : ''}`} onClick={() => setSel(i)}>{l.name} <span className="dim">{l.symbols.length}</span></button>)}</span>
        {newName === null ? <button className="btn" onClick={() => setNewName('')}>+ List</button> : (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) mutate(() => api('/api/watchlists', { method: 'POST', body: { name: newName.trim() } })).then(() => setNewName(null)); }}>
            <input autoFocus className="in" placeholder="List name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewName(null)} style={{ width: 110 }} />
            <button className="btn">Create</button>
          </form>
        )}
        {list && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (add.trim()) mutate(() => api(`/api/watchlists/${list.id}/items`, { method: 'POST', body: { symbol: add.trim() } })).then(() => setAdd('')); }}>
            <input className="in mono" placeholder="Add symbol" value={add} onChange={(e) => setAdd(e.target.value.toUpperCase())} style={{ width: 90 }} />
            <button className="btn">Add</button>
          </form>
        )}
        {list && (confirmDelete
          ? <button className="btn danger" onBlur={() => setConfirmDelete(false)} onClick={() => mutate(() => api(`/api/watchlists/${list.id}`, { method: 'DELETE' })).then(() => { setSel(0); setConfirmDelete(false); })}>Confirm delete “{list.name}”</button>
          : <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete list</button>)}
      </div>
      {err && <div className="notice error">{err}</div>}
      {!list ? <div className="notice">No watchlists yet. Create one with “+ List”.</div> : list.symbols.length === 0 ? <div className="notice">This watchlist is empty. Add a symbol above or press “+ Watch” on a company page.</div> : (
        <table className="t">
          <thead><tr><th>Symbol</th><th className="num">Last</th><th className="num">Chg</th><th className="num">Chg %</th><th className="num">Volume</th><th>Session</th><th>Source</th><th /></tr></thead>
          <tbody>{list.symbols.map((s) => {
            const q = quotes.data?.[s];
            return (
              <tr key={s} className="click" onClick={() => run(s)}>
                <td className="sym">{s}</td>
                {!q ? <td colSpan={6}>{quotes.loading ? <span className="dim">loading…</span> : <span className="na">n/a</span>}</td> : q.status === 'unavailable' ? <td colSpan={6} className="na" title={q.reason}>unavailable: {q.reason.slice(0, 70)}</td> : (
                  <>
                    <td className="num">{fmtNum(q.data.price)}</td>
                    <td className={`num ${tone(q.data.change)}`}><V>{fmtSigned(q.data.change)}</V></td>
                    <td className={`num ${tone(q.data.changePercent)}`}><V>{fmtPct(q.data.changePercent)}</V></td>
                    <td className="num"><V>{fmtCompact(q.data.volume)}</V></td>
                    <td className="mono dim">{q.data.sessionDate}</td>
                    <td><Prov p={q.provenance} staleAfterDays={4} /></td>
                  </>
                )}
                <td><button className="icon-btn" title="Remove" onClick={(e) => { e.stopPropagation(); mutate(() => api(`/api/watchlists/${list.id}/items/${s}`, { method: 'DELETE' })); }}>×</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}

export function NEWS({ cmd }: ViewProps) {
  const news = useApi<ProviderResult<unknown>>('/api/news');
  return (
    <div className="col">
      {news.data?.status === 'unavailable' && <Unavailable title="No news source connected" reason={news.data.reason} />}
      <div className="notice">
        Atlas does not generate or paraphrase headlines without a source. When a licensed news provider is connected, this workspace will show
        timestamped, attributed articles with ticker mapping, duplicate-story grouping and cited AI summaries.
        {cmd.symbol && <> Meanwhile, regulatory events for <span className="mono">{cmd.symbol}</span> are available in <span className="mono">{cmd.symbol} FIL</span> (8-K filings).</>}
      </div>
    </div>
  );
}

export function EARNINGS({ cmd }: ViewProps) {
  const { meta } = useTerminal();
  const symbol = cmd.symbol;
  const filings = useApi<ProviderResult<Filing[]>>(symbol ? `/api/security/${symbol}/filings?forms=10-K,10-Q,8-K` : null);
  return (
    <div className="col">
      <Unavailable title="Earnings calendar not connected" reason="Upcoming earnings dates and consensus estimates need a licensed estimates/calendar provider, which is not configured. Atlas will not estimate dates." />
      {!symbol ? <div className="notice">Add a symbol (e.g. <span className="mono">EARNINGS MSFT</span>) to see its reported periodic results from filings.</div> : meta.routes.filings ? (
        <Section title={`${symbol} reported results and 8-K events`} right={filings.data?.status === 'ok' ? <Prov p={filings.data.provenance} /> : null} pad={false}>
          <Result q={filings}>{(list) => (
            <table className="t"><thead><tr><th>Filed</th><th>Form</th><th>Period</th><th>Document</th></tr></thead>
              <tbody>{list.slice(0, 40).map((f) => <tr key={f.accessionNumber}><td className="mono">{f.filingDate}</td><td className="mono">{f.form}</td><td className="mono"><V>{f.reportDate ?? NA}</V></td><td><a href={f.url} target="_blank" rel="noreferrer">{f.description || f.accessionNumber}</a></td></tr>)}</tbody>
            </table>
          )}</Result>
        </Section>
      ) : <Unavailable reason={meta.unavailableReasons.filings ?? 'No filings provider configured.'} />}
    </div>
  );
}

