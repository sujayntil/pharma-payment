/* Small hand-drawn charts for Insights (no chart library needed). */
import { useRef, useState } from 'react';
import { money } from '../../utils/formatters';
import { lakh } from './insightsFormat';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 2026" for a month, "Week of 5 Nov" for a week (from 'YYYY-MM-DD'). */
function periodName(from, weekly = false) {
  const [y, m, d] = from.split('-').map(Number);
  return weekly ? `Week of ${d} ${MONTHS[m - 1]}` : `${MONTHS[m - 1]} ${y}`;
}

/**
 * A small card over a chart: hover on laptop, tap on phone (tap again to
 * open, where the chart opens things). leftPct: where the point is across the
 * chart (0–100); the card keeps inside the chart near the edges.
 */
export function ChartTip({ leftPct, title, rows, hint }) {
  const shift = leftPct < 18 ? '0%' : leftPct > 82 ? '-100%' : '-50%';
  return (
    <div role="status" style={{
      position: 'absolute', top: 4, left: `${leftPct}%`, transform: `translateX(${shift})`, pointerEvents: 'none', zIndex: 2,
      background: 'var(--app-surface)', border: '1px solid var(--app-line)', borderRadius: 10, padding: '8px 11px',
      boxShadow: '0 8px 24px rgba(0,0,0,.14)', minWidth: 150, fontSize: 12.5, color: 'var(--app-ink)', whiteSpace: 'nowrap',
    }}>
      <div style={{ fontWeight: 700, marginBottom: rows.length ? 5 : 0 }}>{title}</div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.65 }}>
          {r.color && <i style={{ width: r.line ? 10 : 8, height: r.line ? 3 : 8, borderRadius: r.line ? 2 : 2, background: r.color, border: r.border ? '1px solid var(--app-pending-line)' : undefined, flexShrink: 0 }} />}
          <span style={{ color: 'var(--app-muted)' }}>{r.label}</span>
          <b style={{ marginLeft: 'auto', paddingLeft: 12, fontVariantNumeric: 'tabular-nums' }}>{r.value}</b>
        </div>
      ))}
      {hint && <div style={{ marginTop: 5, fontSize: 11, color: 'var(--app-muted)' }}>{hint}</div>}
    </div>
  );
}

/** Hover (mouse) or first tap (touch) shows the tip; a second tap / a click acts. */
function useChartHover() {
  const [hover, setHover] = useState(null);
  const touch = useRef(false);
  const handlers = (i, act) => ({
    onPointerEnter: (e) => { touch.current = e.pointerType !== 'mouse'; if (!touch.current) setHover(i); },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setHover(null); },
    onPointerDown: (e) => { touch.current = e.pointerType !== 'mouse'; },
    onClick: () => {
      if (touch.current && hover !== i) { setHover(i); return; }
      if (act) { setHover(null); act(); } else if (touch.current) setHover(hover === i ? null : i);
    },
  });
  return { hover, handlers, touch, clear: () => setHover(null) };
}

export function Spark({ values = [], color, width = 74, height = 24 }) {
  // Only with real history: most of the periods must have data (6 of 8).
  // A line that is mostly zeros (data starting recently) says nothing.
  if (values.length < 2 || values.filter((v) => v).length < Math.max(3, values.length - 2)) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const points = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / ((max - min) || 1)) * (height - 4)).toFixed(1)}`).join(' ');
  // viewBox: if the tile is tight the line shrinks as a whole instead of being cut off.
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minWidth: 40, flexShrink: 1 }} aria-hidden><polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Sales bars + collected line. Hover a bar for its numbers; click (or tap twice) to pick that month / week. */
/** wide: drawn across the full page width (keeps the chart from growing too tall). */
export function TrendChart({ points = [], selected, onPick, weekly = false, wide = false }) {
  const W = wide ? 1180 : 760; const H = 230; const pl = 48; const pb = 26; const pt = 10;
  const max = Math.max(...points.map((p) => Math.max(p.sales, p.collected)), 1);
  const bw = (W - pl - 10) / Math.max(points.length, 1);
  const y = (v) => H - pb - (Math.max(v, 0) / max) * (H - pb - pt);
  const short = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`);
  const line = points.map((p, i) => `${pl + i * bw + bw / 2},${y(p.collected)}`);
  const { hover, handlers, touch, clear } = useChartHover();
  const hp = hover !== null ? points[hover] : null;
  const hRec = hp ? Math.min(Math.max(hp.recovered || 0, 0), hp.sales) : 0;
  return (
    <div style={{ position: 'relative' }} onPointerLeave={(e) => e.pointerType === 'mouse' && clear()}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'manipulation' }} role="img" aria-label="Sales and collections over time">
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max * k) / 4;
          return <g key={k}><line x1={pl} x2={W - 6} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--app-chart-grid)' }} /><text x={pl - 8} y={y(v) + 4} fontSize="10.5" style={{ fill: 'var(--app-axis)' }} textAnchor="end">{short(v)}</text></g>;
        })}
        {points.map((p, i) => {
          const x = pl + i * bw + bw * 0.18; const w = bw * 0.64;
          const on = selected && p.from <= selected.to && p.to >= selected.from;
          const rec = Math.min(Math.max(p.recovered || 0, 0), p.sales);
          const dim = (hover !== null && hover !== i) || (hover === null && selected && !on);
          return (
            <g key={p.from} style={{ cursor: 'pointer' }} {...handlers(i, () => onPick?.(p))} opacity={dim ? 0.5 : 1}>
              {/* the hovered column gets a soft band */}
              <rect x={pl + i * bw} y={pt} width={bw} height={H - pb - pt} rx="6" style={{ fill: hover === i ? 'var(--app-soft)' : 'transparent' }} />
              {/* the whole bar = that period's sales; dark = recovered so far, light = still pending */}
              <rect x={x} y={y(p.sales)} width={w} height={H - pb - y(p.sales)} rx="4" style={{ fill: 'var(--app-pending)' }} stroke={on ? '#2f9e44' : 'none'} strokeWidth={on ? 1.5 : 0} />
              {rec > 0 && <rect x={x} y={y(rec)} width={w} height={H - pb - y(rec)} rx="4" fill="#2f9e44" />}
              <text x={x + w / 2} y={H - 8} fontSize="10.5" style={{ fill: on || hover === i ? 'var(--app-ink)' : 'var(--app-axis)' }} fontWeight={on || hover === i ? 700 : 400} textAnchor="middle">{p.label}</text>
            </g>
          );
        })}
        <polyline points={line.join(' ')} fill="none" stroke="#1c7ed6" strokeWidth="2.2" strokeLinejoin="round" pointerEvents="none" />
        {line.map((pt2, i) => { const [cx, cy] = pt2.split(','); return <circle key={pt2} cx={cx} cy={cy} r={hover === i ? 4.5 : 3.2} stroke="#1c7ed6" style={{ fill: 'var(--app-surface)' }} strokeWidth="2" pointerEvents="none" />; })}
      </svg>
      {hp && (
        <ChartTip
          leftPct={((pl + hover * bw + bw / 2) / W) * 100}
          title={periodName(hp.from, weekly)}
          rows={[
            { label: 'Sales', value: money(hp.sales) },
            { label: `Recovered${hp.sales ? ` · ${Math.round((hRec / hp.sales) * 100)}%` : ''}`, value: money(hRec), color: '#2f9e44' },
            { label: 'Pending', value: money(Math.max(hp.sales - hRec, 0)), color: 'var(--app-pending)', border: true },
            { label: 'All collections', value: money(hp.collected), color: '#1c7ed6', line: true },
          ]}
          hint={touch.current && onPick ? `Tap again to open ${weekly ? 'this week' : MONTHS[Number(hp.from.slice(5, 7)) - 1]}` : null}
        />
      )}
    </div>
  );
}

/** Simple monthly bars (customer panel). Hover / tap a bar for its amount. */
export function MonthBars({ months = [], highlightFrom = 9 }) {
  const W = 480; const H = 120; const n = Math.max(months.length, 1); const w = W / n;
  const max = Math.max(...months.map((m) => m.sales), 1);
  const { hover, handlers, clear } = useChartHover();
  const hm = hover !== null ? months[hover] : null;
  return (
    <div style={{ position: 'relative' }} onPointerLeave={(e) => e.pointerType === 'mouse' && clear()}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'manipulation' }} role="img" aria-label="Monthly sales, last 12 months">
        {months.map((m, i) => {
          const h = (m.sales / max) * 90;
          return (
            <g key={m.month} {...handlers(i)} style={{ cursor: 'default' }} opacity={hover !== null && hover !== i ? 0.5 : 1}>
              <rect x={i * w} y={0} width={w} height={H} style={{ fill: 'transparent' }} />
              <rect x={i * w + w * 0.2} y={100 - h} width={w * 0.6} height={h} rx="3" style={{ fill: i >= highlightFrom ? '#2f9e44' : 'var(--app-pending-line)' }} />
              <text x={i * w + w / 2} y="116" fontSize="10" style={{ fill: hover === i ? 'var(--app-ink)' : 'var(--app-axis)' }} fontWeight={hover === i ? 700 : 400} textAnchor="middle">{m.label}</text>
            </g>
          );
        })}
      </svg>
      {hm && <ChartTip leftPct={((hover * w + w / 2) / W) * 100} title={periodName(`${hm.month}-01`)} rows={[{ label: 'Sales', value: money(hm.sales) }]} />}
    </div>
  );
}

/** Hover (or tap) a slice: the centre shows that type's amount and share. */
/** size: drawn size in px; unit: hover line ("of sales", "of what's owed"). */
export function Donut({ rows = [], total = 0, active, onPick, centerLabel = 'Sales', size = 148, unit = 'of sales', label = 'Sales by customer type' }) {
  const R = 62; const r = 40; const c = 74;
  let a = -Math.PI / 2;
  const [hover, setHover] = useState(null);
  const hRow = rows.find((row) => row.key === hover);
  const at = (ang, rad) => [c + rad * Math.cos(ang), c + rad * Math.sin(ang)];
  return (
    <svg width={size} height={size} viewBox="0 0 148 148" style={{ flexShrink: 0 }} role="img" aria-label={label}>
      {total > 0 && rows.filter((row) => row.value > 0).map((row) => {
        const f = row.value / total; const b = a + f * Math.PI * 2; const big = f > 0.5 ? 1 : 0;
        const [x1, y1] = at(a, R); const [x2, y2] = at(b - 0.0001, R); const [x3, y3] = at(b - 0.0001, r); const [x4, y4] = at(a, r);
        a = b;
        const lit = hover ? hover === row.key : !active || active === row.key;
        return <path key={row.key} d={`M${x1},${y1}A${R},${R} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${big} 0 ${x4},${y4}Z`} fill={row.color} opacity={lit ? 1 : 0.25}
          style={{ cursor: 'pointer', transition: 'opacity 120ms', transformOrigin: `${c}px ${c}px`, transform: hover === row.key ? 'scale(1.04)' : undefined }}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(row.key)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          onClick={() => onPick?.(row.key)}><title>{`${row.key}: ${money(row.value)}`}</title></path>;
      })}
      {!total && <circle cx={c} cy={c} r={(R + r) / 2} fill="none" style={{ stroke: 'var(--app-chart-grid)' }} strokeWidth={R - r} />}
      <text x={c} y={hRow ? 64 : 70} textAnchor="middle" fontSize="11" style={{ fill: 'var(--app-axis)' }}>{hRow ? hRow.key : centerLabel}</text>
      <text x={c} y={hRow ? 82 : 88} textAnchor="middle" fontSize="14" fontWeight="700" style={{ fill: 'var(--app-ink)' }}>{lakh(hRow ? hRow.value : total)}</text>
      {hRow && total > 0 && <text x={c} y={97} textAnchor="middle" fontSize="10.5" style={{ fill: 'var(--app-axis)' }}>{Math.round((hRow.value / total) * 100)}% {unit}</text>}
    </svg>
  );
}
