/* Small hand-drawn charts for Insights (no chart library needed). */
import { lakh } from './insightsFormat';

export function Spark({ values = [], color, width = 74, height = 24 }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const points = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / ((max - min) || 1)) * (height - 4)).toFixed(1)}`).join(' ');
  return <svg width={width} height={height} aria-hidden><polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Sales bars + collected line; tap a bar to pick that month / week. */
export function TrendChart({ points = [], selected, onPick }) {
  const W = 760; const H = 230; const pl = 48; const pb = 26; const pt = 10;
  const max = Math.max(...points.map((p) => Math.max(p.sales, p.collected)), 1);
  const bw = (W - pl - 10) / Math.max(points.length, 1);
  const y = (v) => H - pb - (Math.max(v, 0) / max) * (H - pb - pt);
  const short = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`);
  const line = points.map((p, i) => `${pl + i * bw + bw / 2},${y(p.collected)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Sales and collections over time">
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (max * k) / 4;
        return <g key={k}><line x1={pl} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#f1f3f5" /><text x={pl - 8} y={y(v) + 4} fontSize="10.5" fill="#8a929c" textAnchor="end">{short(v)}</text></g>;
      })}
      {points.map((p, i) => {
        const x = pl + i * bw + bw * 0.18; const w = bw * 0.64;
        const on = selected && p.from <= selected.to && p.to >= selected.from;
        const rec = Math.min(Math.max(p.recovered || 0, 0), p.sales);
        const pct = p.sales ? Math.round((rec / p.sales) * 100) : 0;
        return (
          <g key={p.from} style={{ cursor: 'pointer' }} onClick={() => onPick?.(p)} opacity={selected && !on ? 0.55 : 1}>
            <title>{`${p.label}: sales ${lakh(p.sales)} · recovered ${lakh(rec)} (${pct}%) · pending ${lakh(p.sales - rec)} · all collections ${lakh(p.collected)}`}</title>
            <rect x={pl + i * bw} y={pt} width={bw} height={H - pb - pt} fill="transparent" />
            {/* the whole bar = that period's sales; dark = recovered so far, light = still pending */}
            <rect x={x} y={y(p.sales)} width={w} height={H - pb - y(p.sales)} rx="4" fill="#d3f9d8" stroke={on ? '#2f9e44' : 'none'} strokeWidth={on ? 1.5 : 0} />
            {rec > 0 && <rect x={x} y={y(rec)} width={w} height={H - pb - y(rec)} rx="4" fill="#2f9e44" />}
            <text x={x + w / 2} y={H - 8} fontSize="10.5" fill={on ? '#1a1d21' : '#8a929c'} fontWeight={on ? 700 : 400} textAnchor="middle">{p.label}</text>
          </g>
        );
      })}
      <polyline points={line.join(' ')} fill="none" stroke="#1c7ed6" strokeWidth="2.2" strokeLinejoin="round" pointerEvents="none" />
      {line.map((pt2) => { const [cx, cy] = pt2.split(','); return <circle key={pt2} cx={cx} cy={cy} r="3.2" fill="#fff" stroke="#1c7ed6" strokeWidth="2" pointerEvents="none" />; })}
    </svg>
  );
}

export function Donut({ rows = [], total = 0, active, onPick, centerLabel = 'Sales' }) {
  const R = 62; const r = 40; const c = 74;
  let a = -Math.PI / 2;
  const at = (ang, rad) => [c + rad * Math.cos(ang), c + rad * Math.sin(ang)];
  return (
    <svg width="148" height="148" viewBox="0 0 148 148" style={{ flexShrink: 0 }} role="img" aria-label="Sales by customer type">
      {total > 0 && rows.filter((row) => row.value > 0).map((row) => {
        const f = row.value / total; const b = a + f * Math.PI * 2; const big = f > 0.5 ? 1 : 0;
        const [x1, y1] = at(a, R); const [x2, y2] = at(b - 0.0001, R); const [x3, y3] = at(b - 0.0001, r); const [x4, y4] = at(a, r);
        a = b;
        return <path key={row.key} d={`M${x1},${y1}A${R},${R} 0 ${big} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${big} 0 ${x4},${y4}Z`} fill={row.color} opacity={active && active !== row.key ? 0.25 : 1} style={{ cursor: 'pointer' }} onClick={() => onPick?.(row.key)} />;
      })}
      {!total && <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="#f1f3f5" strokeWidth={R - r} />}
      <text x={c} y={70} textAnchor="middle" fontSize="11" fill="#8a929c">{centerLabel}</text>
      <text x={c} y={88} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1a1d21">{lakh(total)}</text>
    </svg>
  );
}
