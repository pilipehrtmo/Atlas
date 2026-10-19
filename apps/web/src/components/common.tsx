import type { Provenance, ProviderResult } from '@atlas/core';
import type { ReactNode } from 'react';
import type { ApiError } from '../api';
import { ageDays, NA } from '../format';

const TIMELINESS_LABEL: Record<Provenance['timeliness'], string> = {
  realtime: 'REAL-TIME',
  delayed: 'DELAYED',
  eod: 'END OF DAY',
  periodic: 'AS REPORTED',
  synthetic: 'SYNTHETIC',
};

/** Source line rendered next to every data block: provider, as-of date, timeliness and staleness. */
export function Prov({ p, staleAfterDays }: { p: Provenance | null | undefined; staleAfterDays?: number }) {
  if (!p) return null;
  const age = ageDays(p.asOf);
  const stale = staleAfterDays !== undefined && age !== null && age > staleAfterDays && p.timeliness !== 'synthetic';
  const title = [
    `Provider: ${p.providerName}`,
    `As of: ${p.asOf ?? 'not stated'}`,
    `Retrieved: ${new Date(p.fetchedAt).toLocaleString()}${p.cached ? ' (cached)' : ''}`,
    p.delayMinutes ? `Delay: ${p.delayMinutes} min` : '',
    p.currency ? `Currency: ${p.currency}` : '',
    p.unit ? `Unit: ${p.unit}` : '',
    p.attribution ?? '',
  ].filter(Boolean).join('\n');
  return (
    <span className="prov" title={title}>
      <span className={`tag ${p.timeliness}`}>{TIMELINESS_LABEL[p.timeliness]}</span>
      {stale && <span className="tag stale">STALE {age}D</span>}
      {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.providerName}</a> : <span>{p.providerName}</span>}
      {p.asOf && <span>· {p.asOf.slice(0, 10)}</span>}
    </span>
  );
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return <div aria-busy="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 15}%` }} />)}</div>;
}

export function Unavailable({ reason, title = 'Data unavailable', provider }: { reason: string; title?: string; provider?: string }) {
  return (
    <div className="notice unavailable" role="status">
      <div className="ttl">{title}</div>
      <div>{reason}</div>
      {provider && provider !== 'none' && <div className="dim" style={{ marginTop: 4 }}>Provider: {provider}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <div className="ttl">Error</div>
      <div>{error.message}</div>
      {onRetry && <button className="btn" style={{ marginTop: 6 }} onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** Renders a ProviderResult with consistent loading / error / unavailable handling. */
export function Result<T>({ q, children, title }: { q: { data: ProviderResult<T> | null; error: ApiError | null; loading: boolean; reload: () => void }; children: (data: T, p: Provenance) => ReactNode; title?: string }) {
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  if (q.data.status === 'unavailable') return <Unavailable reason={q.data.reason} provider={q.data.provider} title={title} />;
  return <>{children(q.data.data, q.data.provenance)}</>;
}

export function Section({ title, right, children, pad = true }: { title: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="section">
      <div className="section-h">{title}<span className="spacer" />{right}</div>
      <div className={pad ? 'section-b' : ''}>{children}</div>
    </section>
  );
}

export function V({ children, className = '' }: { children: string; className?: string }) {
  return children === NA ? <span className="na" title="Unavailable from the current data source">{NA}</span> : <span className={className}>{children}</span>;
}
