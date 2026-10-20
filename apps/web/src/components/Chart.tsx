import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface ChartPoint {
  x: string; // label, usually a date
  y: number | null; // null = missing observation, drawn as a gap
  v?: number | null; // optional volume
}

export interface CompareSeries { label: string; values: (number | null)[]; color?: string }

/** Lightweight SVG line chart with optional volume bars, an optional comparison line and a hover readout. Missing points break the line. */
export function LineChart({ points, height = 220, format = (n) => n.toFixed(2), color, baseline, label, compare }: { points: ChartPoint[]; height?: number; format?: (n: number) => string; color?: string; baseline?: number; label?: string; compare?: CompareSeries }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const hasVol = points.some((p) => p.v);
  const padL = 4, padR = 58, padT = 8, padB = 18;
  const volH = hasVol ? Math.round(height * 0.18) : 0;
  const plotH = height - padT - padB - volH;
  const vals = points.map((p) => p.y).filter((y): y is number => y !== null);
  const cmpVals = (compare?.values ?? []).filter((y): y is number => y !== null);

  const geo = useMemo(() => {
    if (!vals.length) return null;
    let lo = Math.min(...vals, ...cmpVals), hi = Math.max(...vals, ...cmpVals);
    if (baseline !== undefined) { lo = Math.min(lo, baseline); hi = Math.max(hi, baseline); }
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    lo -= pad; hi += pad;
    const xs = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - padR);
    const ys = (y: number) => padT + (1 - (y - lo) / (hi - lo)) * plotH;
    const path = (ys2: (number | null)[]) => {
      let d = '', pen = false;
      ys2.forEach((y, i) => {
        if (y === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(y).toFixed(1)}`;
        pen = true;
      });
      return d;
    };
    const d = path(points.map((p) => p.y));
    const dc = compare ? path(compare.values) : '';
    // Soft area fill under the main line, only when the series has no gaps.
    const firstI = points.findIndex((p) => p.y !== null);
    const area = firstI >= 0 && points.every((p, i) => i < firstI || p.y !== null)
      ? `${d}L${xs(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}L${xs(firstI).toFixed(1)},${(padT + plotH).toFixed(1)}Z`
      : '';
    const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 5);
    const maxV = Math.max(1, ...points.map((p) => p.v ?? 0));
    return { xs, ys, d, dc, area, ticks, maxV };
  }, [points, w, plotH, baseline, compare]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!geo) return <div className="notice">No observations to chart.</div>;
  const first = vals[0], last = vals[vals.length - 1];
  const stroke = color ?? (last >= first ? 'var(--up)' : 'var(--down)');
  const hp = hover !== null ? points[hover] : null;
  const labelIdx = [0, Math.floor(points.length / 3), Math.floor((2 * points.length) / 3), points.length - 1];

  return (
    <div className="chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label={label ? `${label} chart` : "Price chart"}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (points.length - 1));
          setHover(i >= 0 && i < points.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={padL} x2={w - padR} y1={geo.ys(t)} y2={geo.ys(t)} />
            <text className="axis" x={w - padR + 4} y={geo.ys(t) + 3}>{format(t)}</text>
          </g>
        ))}
        {baseline !== undefined && <line x1={padL} x2={w - padR} y1={geo.ys(baseline)} y2={geo.ys(baseline)} stroke="var(--text-3)" strokeDasharray="3 3" />}
        {hasVol && points.map((p, i) => p.v ? (
          <rect key={i} x={geo.xs(i) - 0.5} width={Math.max(1, (w - padL - padR) / points.length - 1)} y={height - padB - (p.v / geo.maxV) * volH} height={(p.v / geo.maxV) * volH} fill="#2a3138" />
        ) : null)}
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        {geo.area && <path d={geo.area} fill={`url(#${gid})`} stroke="none" />}
        {compare && <path d={geo.dc} fill="none" stroke={compare.color ?? 'var(--text-2)'} strokeWidth={1.2} strokeDasharray="4 2" />}
        <path d={geo.d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        {labelIdx.map((i, k) => points[i] && (
          <text key={k} className="axis" x={geo.xs(i)} y={height - 4} textAnchor={k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}>{points[i].x}</text>
        ))}
        {hp && hp.y !== null && (
          <g>
            <line x1={geo.xs(hover!)} x2={geo.xs(hover!)} y1={padT} y2={height - padB} stroke="var(--text-3)" strokeDasharray="2 2" />
            <circle cx={geo.xs(hover!)} cy={geo.ys(hp.y)} r={2.5} fill={stroke} />
          </g>
        )}
      </svg>
      <div className="tip">
        {hp ? <>{hp.x} · {label ? `${label} ` : ''}<b>{hp.y === null ? 'n/a' : format(hp.y)}</b>{compare ? <> · {compare.label} <b>{compare.values[hover!] == null ? 'n/a' : format(compare.values[hover!]!)}</b></> : null}{hp.v ? ` · vol ${hp.v.toLocaleString()}` : ''}</> : <>{points[0].x} → {points[points.length - 1].x}{compare ? <> · <span style={{ color: stroke }}>━ {label ?? 'series'}</span> <span style={{ color: compare.color ?? 'var(--text-2)' }}>╍ {compare.label}</span></> : null}</>}
      </div>
    </div>
  );
}
