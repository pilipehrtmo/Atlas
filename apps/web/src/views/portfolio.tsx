import { dec, type LedgerState, type PortfolioValuation, type Provenance, type ProviderResult, type Quote, type Transaction, type TxType } from '@atlas/core';
import { Fragment, useEffect, useState } from 'react';
import { api, ApiError, invalidate, useApi } from '../api';
import { ErrorBox, Loading, Prov, Section, V } from '../components/common';
import { fmtNum, fmtPct, fmtSigned, tone } from '../format';
import { useTerminal } from '../terminal';
import type { ViewProps } from './types';

interface PortfolioDetail {
  portfolio: { id: number; name: string; baseCurrency: string };
  transactions: Transaction[];
  ledger?: LedgerState;
  valuation: PortfolioValuation | null;
  quotes: Record<string, ProviderResult<Quote>>;
  fxToBase?: Record<string, string>;
  fxProvenance?: Provenance | null;
  error?: string;
}

const FIELDS: Record<TxType, (keyof Transaction)[]> = {
  BUY: ['symbol', 'quantity', 'price', 'fee'],
  SELL: ['symbol', 'quantity', 'price', 'fee'],
  DIVIDEND: ['symbol', 'amount'],
  DEPOSIT: ['amount'],
  WITHDRAWAL: ['amount'],
  FEE: ['amount'],
  SPLIT: ['symbol', 'splitRatio'],
};

export function PORT(_: ViewProps) {
  const list = useApi<{ id: number; name: string; baseCurrency: string }[]>('/api/portfolios');
  const [sel, setSel] = useState<number | null>(null);
  const [creating, setCreating] = useState<{ name: string; ccy: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (sel === null && list.data?.length) setSel(list.data[0].id); }, [list.data, sel]);

  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const create = async () => {
    if (!creating?.name.trim()) return;
    try {
      const r = await api<{ id: number }>('/api/portfolios', { method: 'POST', body: { name: creating.name.trim(), baseCurrency: creating.ccy } });
      invalidate('/api/portfolios'); list.reload(); setSel(r.id); setCreating(null); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="col">
      <div className="row">
        <span className="seg">{list.data.map((p) => <button key={p.id} className={`btn ${p.id === sel ? 'on' : ''}`} onClick={() => setSel(p.id)}>{p.name} <span className="dim">{p.baseCurrency}</span></button>)}</span>
        {creating ? (
          <form className="row" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <input autoFocus className="in" placeholder="Portfolio name" value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} style={{ width: 130 }} />
            <select className="in" value={creating.ccy} onChange={(e) => setCreating({ ...creating, ccy: e.target.value })}>{['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'IDR', 'SGD'].map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn primary">Create</button>
            <button type="button" className="btn" onClick={() => setCreating(null)}>Cancel</button>
          </form>
        ) : <button className="btn" onClick={() => setCreating({ name: '', ccy: 'USD' })}>+ Portfolio</button>}
      </div>
      {err && <div className="notice error">{err}</div>}
      {sel === null ? <div className="notice">No portfolios yet. Create one to start recording transactions. Atlas does not connect to brokers.</div> : <PortfolioDetailView id={sel} />}
    </div>
  );
}

function PortfolioDetailView({ id }: { id: number }) {
  const d = useApi<PortfolioDetail>(`/api/portfolios/${id}`);
  const { run } = useTerminal();
  const refresh = () => { invalidate(`/api/portfolios/${id}`); d.reload(); };
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  if (!d.data) return <Loading lines={6} />;
  const { valuation: v, ledger, portfolio: pf } = d.data;
  const base = pf.baseCurrency;
  const fx = (ccy: string) => (ccy === base ? '1' : d.data!.fxToBase?.[ccy]);
  // Unrealized P&L and cost in base currency, over positions that could be priced and converted.
  let unreal = dec(0), costValued = dec(0), unrealComplete = true;
  for (const p of v?.positions ?? []) {
    const r = fx(p.currency);
    if (p.unrealizedPnl === null || !r) { unrealComplete = false; continue; }
    unreal = unreal.plus(dec(p.unrealizedPnl).times(r));
    costValued = costValued.plus(dec(p.totalCost).times(r));
  }
  const byCcy = (rec: Record<string, string> | undefined) => Object.entries(rec ?? {}).filter(([, a]) => !dec(a).isZero());

  return (
    <div className="col">
      {d.data.error && <div className="notice error"><div className="ttl">Ledger error</div>{d.data.error} Fix or delete the offending transaction below.</div>}
      {v && (
        <div className="grid2">
          <Section title={`Summary (${base})`} right={<button className="btn" onClick={refresh}>Revalue</button>}>
            <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
              {v.totalValue !== null ? <span className="big">{fmtNum(v.totalValue)}</span> : <span className="big warn" title="One or more holdings could not be valued">Incomplete</span>}
              <span className="dim mono">{base}</span>
            </div>
            {v.missing.length > 0 && (
              <div className="warn" style={{ marginTop: 4 }}>
                Valued subtotal {fmtNum(v.valuedSubtotal)} {base}. Not valued: {v.missing.map((m) => `${m.item} (${m.reason.toLowerCase()})`).join('; ')}.
              </div>
            )}
            <dl className="kv" style={{ marginTop: 6 }}>
              <dt>Unrealized P&L{unrealComplete ? '' : ' (valued only)'}</dt><dd className={tone(unreal.toNumber())}>{fmtSigned(unreal.toString())} ({fmtPct(costValued.isZero() ? null : unreal.div(costValued).toString(), 2, true)})</dd>
              {byCcy(ledger?.realizedPnl).map(([c, a]) => <Fragment key={c}><dt>Realized P&L ({c})</dt><dd className={tone(a)}>{fmtSigned(a)}</dd></Fragment>)}
              {(ledger?.positions ?? []).some((p) => !dec(p.dividends).isZero()) && <><dt>Dividends received</dt><dd>{Object.entries(sumBy(ledger!.positions.map((p) => [p.currency, p.dividends]))).map(([c, a]) => `${fmtNum(a)} ${c}`).join(', ')}</dd></>}
              {v.cash.map((c) => <Fragment key={c.currency}><dt>Cash {c.currency}</dt><dd>{fmtNum(c.amount)}{c.currency !== base && <span className="dim"> ≈ <V>{fmtNum(c.amountBase)}</V> {base}</span>}</dd></Fragment>)}
            </dl>
            {d.data.fxProvenance && <div style={{ marginTop: 4 }}>FX: <Prov p={d.data.fxProvenance} /></div>}
          </Section>
          <Section title="Allocation">
            {v.totalValue === null ? <div className="dim">Weights are shown only when every holding can be valued.</div> : (
              <table className="t"><tbody>
                {v.positions.filter((p) => p.weight).sort((a, b) => Number(b.weight) - Number(a.weight)).map((p) => (
                  <tr key={p.symbol}><td className="sym" style={{ width: 60 }}>{p.symbol}</td><td><div className="bar-h" style={{ width: `${Number(p.weight) * 100}%` }} /></td><td className="num" style={{ width: 60 }}>{fmtPct(p.weight, 1, true, false)}</td></tr>
                ))}
                <tr><td className="dim">Cash</td><td><div className="bar-h" style={{ width: `${cashWeight(v) * 100}%`, background: 'var(--text-3)' }} /></td><td className="num">{fmtPct(cashWeight(v), 1, true, false)}</td></tr>
                <tr><td colSpan={3} className="dim" style={{ paddingTop: 6 }}>By currency: {Object.entries(v.allocationByCurrency).map(([c, w]) => `${c} ${fmtPct(w, 1, true, false)}`).join(' · ')}</td></tr>
              </tbody></table>
            )}
          </Section>
        </div>
      )}
      {v && (
        <Section title="Holdings" pad={false}>
          {v.positions.length === 0 ? <div className="notice">No open positions.</div> : (
            <table className="t">
              <thead><tr><th>Symbol</th><th className="num">Qty</th><th className="num">Avg cost</th><th className="num">Last</th><th className="num">Mkt value</th><th className="num">Unreal. P&L</th><th className="num">%</th><th>Ccy</th><th>Price source</th></tr></thead>
              <tbody>{v.positions.map((p) => {
                const q = d.data!.quotes[p.symbol];
                return (
                  <tr key={p.symbol} className="click" onClick={() => run(p.symbol)}>
                    <td className="sym">{p.symbol}</td>
                    <td className="num">{fmtNum(p.quantity, 4).replace(/\.?0+$/, '')}</td>
                    <td className="num"><V>{fmtNum(p.averageCost, 4)}</V></td>
                    <td className="num"><V>{fmtNum(p.price?.price)}</V></td>
                    <td className="num"><V>{fmtNum(p.marketValue)}</V></td>
                    <td className={`num ${tone(p.unrealizedPnl)}`}><V>{fmtSigned(p.unrealizedPnl)}</V></td>
                    <td className={`num ${tone(p.unrealizedPct)}`}><V>{fmtPct(p.unrealizedPct, 2, true)}</V></td>
                    <td className="mono dim">{p.currency}</td>
                    <td>{q?.status === 'ok' ? <Prov p={q.provenance} staleAfterDays={4} /> : <span className="na" title={q?.status === 'unavailable' ? q.reason : ''}>unavailable</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <div className="dim" style={{ fontSize: 10, padding: '4px 7px' }}>Cost basis: weighted average, buy fees included. Benchmark comparison and performance history are not built yet.</div>
        </Section>
      )}
      <TransactionForm portfolioId={id} baseCurrency={base} onSaved={refresh} />
      <Section title={`Transactions (${d.data.transactions.length})`} pad={false}>
        <table className="t">
          <thead><tr><th>Date</th><th>Type</th><th>Symbol</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th><th className="num">Fee</th><th>Ccy</th><th>Note</th><th /></tr></thead>
          <tbody>{[...d.data.transactions].reverse().map((t) => <TxRow key={t.id} t={t} portfolioId={id} onChange={refresh} />)}</tbody>
        </table>
      </Section>
    </div>
  );
}

function TxRow({ t, portfolioId, onChange }: { t: Transaction; portfolioId: number; onChange: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <tr>
      <td className="mono">{t.date}</td><td className="mono">{t.type}</td><td className="sym">{t.symbol ?? ''}</td>
      <td className="num">{t.quantity ?? (t.splitRatio ? `×${t.splitRatio}` : '')}</td><td className="num">{t.price ?? ''}</td><td className="num">{t.amount ?? ''}</td><td className="num">{t.fee ?? ''}</td>
      <td className="mono dim">{t.currency}</td><td className="dim" title={t.note}>{err ? <span className="down">{err}</span> : t.note?.slice(0, 30)}</td>
      <td><button className="icon-btn" title="Delete transaction" onClick={async () => {
        try { await api(`/api/portfolios/${portfolioId}/transactions/${t.id}`, { method: 'DELETE' }); onChange(); } catch (e) { setErr((e as Error).message); }
      }}>×</button></td>
    </tr>
  );
}

function TransactionForm({ portfolioId, baseCurrency, onSaved }: { portfolioId: number; baseCurrency: string; onSaved: () => void }) {
  const empty = { date: new Date().toISOString().slice(0, 10), type: 'BUY' as TxType, symbol: '', quantity: '', price: '', fee: '', amount: '', splitRatio: '', currency: baseCurrency, note: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === 'symbol' || k === 'currency' ? e.target.value.toUpperCase() : e.target.value });
  const fields = FIELDS[f.type];
  const submit = async () => {
    setErr(null);
    const body: Record<string, string> = { date: f.date, type: f.type, currency: f.currency };
    for (const k of fields) if ((f as Record<string, string>)[k]) body[k] = (f as Record<string, string>)[k];
    if (f.note) body.note = f.note;
    try {
      await api(`/api/portfolios/${portfolioId}/transactions`, { method: 'POST', body });
      setF({ ...empty, type: f.type, currency: f.currency });
      onSaved();
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae.issues?.join('; ') ?? ae.message);
    }
  };
  const input = (k: keyof typeof f, ph: string, w = 80) => <input className="in mono" placeholder={ph} value={f[k]} onChange={set(k)} style={{ width: w }} inputMode={k === 'symbol' ? 'text' : 'decimal'} />;
  return (
    <Section title="Record transaction">
      <form className="row" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className="in mono" type="date" value={f.date} onChange={set('date')} />
        <select className="in" value={f.type} onChange={set('type')}>{(Object.keys(FIELDS) as TxType[]).map((t) => <option key={t}>{t}</option>)}</select>
        {fields.includes('symbol') && input('symbol', 'Symbol', 70)}
        {fields.includes('quantity') && input('quantity', 'Quantity')}
        {fields.includes('price') && input('price', 'Price / share')}
        {fields.includes('amount') && input('amount', 'Amount', 90)}
        {fields.includes('fee') && input('fee', 'Fee', 60)}
        {fields.includes('splitRatio') && input('splitRatio', 'New per old (4 = 4:1)', 140)}
        {input('currency', 'CCY', 50)}
        {input('note', 'Note', 120)}
        <button className="btn primary">Save</button>
      </form>
      {err && <div className="down" style={{ marginTop: 4 }}>{err}</div>}
      <div className="dim" style={{ fontSize: 10, marginTop: 4 }}>Transactions are checked against the full ledger before saving: sells cannot exceed the position held and an instrument keeps one currency.</div>
    </Section>
  );
}

function sumBy(pairs: [string, string][]) {
  const out: Record<string, string> = {};
  for (const [k, v] of pairs) out[k] = dec(out[k] ?? '0').plus(v).toString();
  return Object.fromEntries(Object.entries(out).filter(([, v]) => !dec(v).isZero()));
}

function cashWeight(v: PortfolioValuation) {
  if (v.totalValue === null || dec(v.totalValue).isZero()) return 0;
  return v.cash.reduce((a, c) => a.plus(c.amountBase ?? '0'), dec(0)).div(v.totalValue).toNumber();
}

