import { priceToEarnings, type Bar, type CompanyProfile, type Filing, type Fundamentals, type ProviderResult, type Quote } from '@atlas/core';
import { useMemo, useState } from 'react';
import { api, invalidate, useApi } from '../api';
import { LineChart } from '../components/Chart';
import { Loading, Prov, Result, Section, Unavailable, V } from '../components/common';
import { fmtCompact, fmtInt, fmtNum, fmtPct, fmtSigned, NA, tone } from '../format';
import { useTerminal } from '../terminal';
import type { ViewProps } from './types';

const RANGES = ['1M', '3M', '6M', '1Y', '5Y', 'MAX'] as const;

export function useSecurity(symbol: string) {
  const quote = useApi<ProviderResult<Quote>>(`/api/security/${symbol}/quote`);
  const profile = useApi<ProviderResult<CompanyProfile>>(`/api/security/${symbol}/profile`);
  return { quote, profile };
}

function QuoteHeader({ symbol }: { symbol: string }) {
  const { quote, profile } = useSecurity(symbol);
  const { run } = useTerminal();
  const [msg, setMsg] = useState<string | null>(null);
  const addToWatchlist = async () => {
    try {
      const lists = await api<{ id: number; name: string }[]>('/api/watchlists');
      const id = lists[0]?.id ?? (await api<{ id: number }[]>('/api/watchlists', { method: 'POST', body: { name: 'Main' } }))[0].id;
      await api(`/api/watchlists/${id}/items`, { method: 'POST', body: { symbol } });
      invalidate('/api/watchlists');
      setMsg(`Added to ${lists[0]?.name ?? 'Main'}`);
    } catch (e) { setMsg((e as Error).message); }
  };
  const name = profile.data?.status === 'ok' ? profile.data.data.name : quote.data?.status === 'ok' ? quote.data.data.name : undefined;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="h1 mono" style={{ color: 'var(--accent)' }}>{symbol}</span>
          <span className="h1">{name ?? ''}</span>
        </div>
        <div className="row">
          <button className="btn" onClick={addToWatchlist}>+ Watch</button>
          <button className="btn" onClick={() => run(`${symbol} FA`)}>FA</button>
          <button className="btn" onClick={() => run(`${symbol} FIL`)}>FIL</button>
          <button className="btn" onClick={() => run(`RESEARCH ${symbol}`)}>RESEARCH</button>
        </div>
      </div>
      {msg && <div className="dim">{msg}</div>}
      <Result q={quote} title="Quote unavailable">
        {(q, p) => (
          <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
            <span className="big">{fmtNum(q.price)}</span>
            <span className="mono dim">{q.currency}</span>
            <span className={`mono ${tone(q.change)}`} style={{ fontSize: 14 }}>{fmtSigned(q.change)} ({fmtPct(q.changePercent)})</span>
            <Prov p={p} staleAfterDays={4} />
          </div>
        )}
      </Result>
    </div>
  );
}

export function PriceChart({ symbol, initial = '1Y', height = 230 }: { symbol: string; initial?: (typeof RANGES)[number]; height?: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(initial);
  const hist = useApi<ProviderResult<Bar[]>>(`/api/security/${symbol}/history?range=${range}`);
  return (
    <Section title="Price" right={
      <span className="row">
        {hist.data?.status === 'ok' && <Prov p={hist.data.provenance} />}
        <span className="seg">{RANGES.map((r) => <button key={r} className={`btn ${r === range ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>)}</span>
      </span>
    }>
      <Result q={hist}>
        {(bars, p) => (
          <>
            <LineChart height={height} points={bars.map((b) => ({ x: b.date, y: b.close, v: b.volume }))} />
            {p.attribution && <div className="dim" style={{ fontSize: 10 }}>{p.attribution}</div>}
          </>
        )}
      </Result>
    </Section>
  );
}

function KeyStats({ symbol }: { symbol: string }) {
  const quote = useApi<ProviderResult<Quote>>(`/api/security/${symbol}/quote`);
  const hist = useApi<ProviderResult<Bar[]>>(`/api/security/${symbol}/history?range=1Y`);
  const fa = useApi<ProviderResult<Fundamentals>>(`/api/security/${symbol}/fundamentals`);
  const q = quote.data?.status === 'ok' ? quote.data.data : null;
  const bars = hist.data?.status === 'ok' ? hist.data.data : null;
  const lines = fa.data?.status === 'ok' ? fa.data.data.lines : null;
  const lastAnnual = (k: string) => lines?.find((l) => l.key === k)?.annual.at(-1) ?? null;
  const eps = lastAnnual('epsDiluted');
  const shares = lastAnnual('sharesOutstanding');
  const pe = q && eps ? priceToEarnings(q.price, eps.value) : null;
  const mcap = q && shares ? Number(q.price) * Number(shares.value) : null;
  const hi = bars?.length ? Math.max(...bars.map((b) => b.high)) : null;
  const lo = bars?.length ? Math.min(...bars.map((b) => b.low)) : null;
  if (quote.loading && !q) return <Loading />;
  return (
    <Section title="Key statistics">
      <dl className="kv">
        <dt>Open</dt><dd><V>{fmtNum(q?.open)}</V></dd>
        <dt>Day range</dt><dd><V>{q?.low && q.high ? `${fmtNum(q.low)} – ${fmtNum(q.high)}` : NA}</V></dd>
        <dt>Prev close</dt><dd><V>{fmtNum(q?.previousClose)}</V></dd>
        <dt>Volume</dt><dd><V>{fmtInt(q?.volume)}</V></dd>
        <dt title={bars ? `From ${bars[0]?.date} to ${bars.at(-1)?.date}, ${bars.length} sessions in the available history` : ''}>52-wk range{bars && bars.length < 240 ? '*' : ''}</dt><dd><V>{hi !== null && lo !== null ? `${fmtNum(lo)} – ${fmtNum(hi)}` : NA}</V></dd>
        <dt title={shares ? `Price × shares outstanding reported ${shares.end} (${shares.form})` : 'Needs shares outstanding from filings'}>Market cap</dt><dd><V>{fmtCompact(mcap)}</V></dd>
        <dt title={eps ? `Price / diluted EPS ${eps.value} for period ending ${eps.end}. Not meaningful when EPS ≤ 0.` : 'Needs reported EPS'}>P/E (last FY)</dt><dd><V>{fmtNum(pe)}</V></dd>
        <dt>Diluted EPS (FY)</dt><dd><V>{fmtNum(eps?.value)}</V></dd>
      </dl>
      {bars && bars.length < 240 && <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>* Range covers only the {bars.length} sessions the provider returned.</div>}
    </Section>
  );
}

export function DES({ cmd }: ViewProps) {
  const symbol = cmd.symbol!;
  const profile = useApi<ProviderResult<CompanyProfile>>(`/api/security/${symbol}/profile`);
  return (
    <div className="col">
      <QuoteHeader symbol={symbol} />
      <PriceChart symbol={symbol} />
      <div className="grid2">
        <KeyStats symbol={symbol} />
        <Section title="Profile" right={profile.data?.status === 'ok' ? <Prov p={profile.data.provenance} /> : null}>
          <Result q={profile} title="Profile unavailable">
            {(d) => (
              <>
                <dl className="kv">
                  <dt>Exchange</dt><dd><V>{d.exchange ?? NA}</V></dd>
                  <dt>Sector</dt><dd><V>{d.sector ?? NA}</V></dd>
                  <dt>Industry</dt><dd><V>{d.industry ?? NA}</V></dd>
                  <dt>Fiscal year end</dt><dd><V>{d.fiscalYearEnd ? `${d.fiscalYearEnd.slice(0, 2)}/${d.fiscalYearEnd.slice(2)}` : NA}</V></dd>
                  {d.cik && <><dt>SEC CIK</dt><dd>{d.cik}</dd></>}
                  {d.stateOfIncorporation && <><dt>Incorporated</dt><dd>{d.stateOfIncorporation}</dd></>}
                </dl>
                {d.description && <p className="muted" style={{ marginBottom: 0 }}>{d.description}</p>}
              </>
            )}
          </Result>
        </Section>
      </div>
      <FinancialSummary symbol={symbol} />
    </div>
  );
}

function FinancialSummary({ symbol }: { symbol: string }) {
  const fa = useApi<ProviderResult<Fundamentals>>(`/api/security/${symbol}/fundamentals`);
  const { run } = useTerminal();
  return (
    <Section title="Financial summary (annual, as reported)" right={<span className="row">{fa.data?.status === 'ok' && <Prov p={fa.data.provenance} />}<button className="btn" onClick={() => run(`${symbol} FA`)}>Full statements</button></span>} pad={false}>
      <Result q={fa} title="Fundamentals unavailable">{(d) => <StatementTable f={d} keys={['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'epsDiluted', 'operatingCashFlow']} periods={4} />}</Result>
    </Section>
  );
}

/** Statement table. Values are shown in millions for USD lines; per-share and share counts are shown as-is. */
function StatementTable({ f, keys, periods = 6, quarterly = false }: { f: Fundamentals; keys?: string[]; periods?: number; quarterly?: boolean }) {
  const lines = keys ? keys.map((k) => f.lines.find((l) => l.key === k)).filter((l) => !!l) : f.lines;
  const pick = (l: (typeof lines)[number]) => (quarterly ? l.quarterly : l.annual);
  const ends = [...new Set(lines.flatMap((l) => pick(l).map((p) => p.end)))].sort().slice(-periods);
  if (!ends.length) return <Unavailable reason={quarterly ? 'No quarterly values were found in the filings.' : 'No annual values were found in the filings.'} />;
  const label = (end: string) => {
    const p = lines.flatMap((l) => pick(l)).find((x) => x.end === end && x.fiscalYear);
    return p ? `${p.fiscalPeriod === 'FY' ? 'FY' : p.fiscalPeriod + ' '}${p.fiscalYear}` : end.slice(0, 7);
  };
  const scale = (unit: string, v: string) => (unit === 'USD' ? fmtNum(Number(v) / 1e6, 0) : unit === 'shares' ? fmtCompact(v) : fmtNum(v));
  const val = (key: string, end: string) => {
    const l = lines.find((x) => x.key === key);
    return l ? pick(l).find((p) => p.end === end) ?? null : null;
  };
  const derived: { label: string; calc: (end: string) => number | null; pct?: boolean }[] = [
    { label: 'Gross margin', pct: true, calc: (e) => ratioOf(val('grossProfit', e)?.value, val('revenue', e)?.value) },
    { label: 'Operating margin', pct: true, calc: (e) => ratioOf(val('operatingIncome', e)?.value, val('revenue', e)?.value) },
    { label: 'Net margin', pct: true, calc: (e) => ratioOf(val('netIncome', e)?.value, val('revenue', e)?.value) },
    { label: 'Free cash flow (OCF − capex)', calc: (e) => { const o = val('operatingCashFlow', e), c = val('capex', e); return o && c ? (Number(o.value) - Number(c.value)) / 1e6 : null; } },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="t">
        <thead><tr><th>Line ({lines.some((l) => l.annual[0]?.unit === 'USD') ? 'USD millions unless noted' : 'as reported'})</th>{ends.map((e) => <th key={e} className="num" title={`Period ending ${e}`}>{label(e)}</th>)}</tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td title={`XBRL concept: ${l.concept}`}>{l.label}{l.annual[0]?.unit !== 'USD' && <span className="dim"> ({l.annual[0]?.unit})</span>}</td>
              {ends.map((e) => {
                const p = pick(l).find((x) => x.end === e);
                return <td key={e} className="num" title={p ? `${p.form} filed ${p.filed}, accession ${p.accessionNumber}${p.start ? `, period ${p.start} to ${p.end}` : `, as of ${p.end}`}` : 'Not reported'}><V>{p ? scale(p.unit, p.value) : NA}</V></td>;
              })}
            </tr>
          ))}
          {!keys && derived.map((d) => (
            <tr key={d.label} className="derived">
              <td title="Calculated by Atlas from the reported lines above">{d.label} <span className="dim">(derived)</span></td>
              {ends.map((e) => { const v = d.calc(e); return <td key={e} className="num"><V>{d.pct ? fmtPct(v, 1, true, false) : fmtNum(v, 0)}</V></td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ratioOf = (a?: string, b?: string) => (a === undefined || b === undefined || Number(b) === 0 ? null : Number(a) / Number(b));

export function GP({ cmd }: ViewProps) {
  return <div className="col"><QuoteHeader symbol={cmd.symbol!} /><PriceChart symbol={cmd.symbol!} height={380} initial="5Y" /></div>;
}

export function FA({ cmd }: ViewProps) {
  const symbol = cmd.symbol!;
  const [quarterly, setQuarterly] = useState(false);
  const fa = useApi<ProviderResult<Fundamentals>>(`/api/security/${symbol}/fundamentals`);
  return (
    <div className="col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h1"><span className="mono" style={{ color: 'var(--accent)' }}>{symbol}</span> {fa.data?.status === 'ok' ? fa.data.data.entityName : ''}</span>
        <span className="row">
          {fa.data?.status === 'ok' && <Prov p={fa.data.provenance} />}
          <span className="seg"><button className={`btn ${!quarterly ? 'on' : ''}`} onClick={() => setQuarterly(false)}>Annual</button><button className={`btn ${quarterly ? 'on' : ''}`} onClick={() => setQuarterly(true)}>Quarterly</button></span>
        </span>
      </div>
      <Result q={fa} title="Fundamentals unavailable">
        {(d) => (
          <>
            <StatementTable f={d} periods={quarterly ? 8 : 6} quarterly={quarterly} />
            <div className="dim" style={{ fontSize: 10 }}>
              Values as reported in filings. Hover a value for its form, filing date and accession number. Fiscal labels come from the filing that reported the period as current; columns without a label show the period end.
              {quarterly && ' Fourth quarters are not filed on 10-Q and are not derived here.'}
            </div>
          </>
        )}
      </Result>
    </div>
  );
}

const FORM_FILTERS = ['ALL', '10-K', '10-Q', '8-K', 'DEF 14A', '4', 'S-1'];

export function FIL({ cmd }: ViewProps) {
  const [symbol, setSymbol] = useState(cmd.symbol ?? '');
  const [input, setInput] = useState(cmd.symbol ?? '');
  const [form, setForm] = useState('ALL');
  const filings = useApi<ProviderResult<Filing[]>>(symbol ? `/api/security/${symbol}/filings${form === 'ALL' ? '' : `?forms=${encodeURIComponent(form)}`}` : null);
  return (
    <div className="col">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setSymbol(input.trim().toUpperCase()); }}>
        <input className="in mono" placeholder="Symbol" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} style={{ width: 90 }} />
        <button className="btn">Search</button>
        <span className="seg">{FORM_FILTERS.map((f) => <button type="button" key={f} className={`btn ${f === form ? 'on' : ''}`} onClick={() => setForm(f)}>{f}</button>)}</span>
        {filings.data?.status === 'ok' && <Prov p={filings.data.provenance} />}
      </form>
      {!symbol ? <div className="notice">Enter a symbol to list its filings, e.g. <span className="mono">FILINGS MSFT</span>.</div> : (
        <Result q={filings} title="Filings unavailable">
          {(list) => list.length === 0 ? <div className="notice">No {form === 'ALL' ? '' : form + ' '}filings in the recent filing index.</div> : (
            <table className="t">
              <thead><tr><th>Filed</th><th>Form</th><th>Period</th><th>Description</th><th>Document</th></tr></thead>
              <tbody>{list.map((f) => (
                <tr key={f.accessionNumber}>
                  <td className="mono">{f.filingDate}</td><td className="mono">{f.form}</td><td className="mono"><V>{f.reportDate ?? NA}</V></td>
                  <td>{f.description ?? ''}</td><td><a href={f.url} target="_blank" rel="noreferrer">{f.accessionNumber}</a></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Result>
      )}
    </div>
  );
}

export function useMemoSorted<T>(rows: T[], key: keyof T | null, dir: 1 | -1) {
  return useMemo(() => {
    if (!key) return rows;
    return [...rows].sort((a, b) => {
      const x = a[key] as unknown, y = b[key] as unknown;
      if (x === null || x === undefined) return 1; // missing values always sort last
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, key, dir]);
}
