/**
 * Margin calculator maths: one function used everywhere.
 * Prices are entered incl. GST; the maths runs before GST.
 */
const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export const SELL_AT = { mrp: 'MRP', ptr: 'PTR', pts: 'PTS' };

/** A box the Admin has filled in (nothing is pre-filled). */
export const filled = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Labels of the boxes still empty that this scheme's result needs. */
export function missing(p, s) {
  const need = [['MRP', p?.mrp], ['GST', p?.gst], ['Cost', p?.cost], ['Purchase GST', p?.purchase_gst]];
  if (s?.sell_at === 'ptr' || s?.sell_at === 'pts') need.push(['Retailer %', p?.retailer_margin]);
  if (s?.sell_at === 'pts') need.push(['Stockist %', p?.stockist_margin]);
  const out = need.filter(([, v]) => !filled(v)).map(([label]) => label);
  if (!s?.sell_at) out.push('Sell at');
  if (!filled(s?.discount)) out.push('Discount');
  return out;
}

/** PTR / PTS can be shown once MRP, GST and the margins are in. */
export const canPtr = (p) => filled(p?.mrp) && filled(p?.gst) && filled(p?.retailer_margin);
export const canPts = (p) => canPtr(p) && filled(p?.stockist_margin);

export function calc(p, s) {
  const g = num(p.gst) / 100;
  const gi = num(p.purchase_gst) / 100;
  const mrp = num(p.mrp);
  const cost = num(p.cost);
  const Q = filled(p.batch) ? Math.max(0, Math.round(num(p.batch))) : NaN;
  const MRPex = mrp / (1 + g);
  const PTRex = MRPex * (1 - num(p.retailer_margin) / 100);
  const PTSex = PTRex * (1 - num(p.stockist_margin) / 100);
  const CostEx = cost / (1 + gi);
  const base = { mrp: MRPex, ptr: PTRex, pts: PTSex }[s?.sell_at] ?? MRPex;
  const R0 = base * (1 - num(s?.discount) / 100); // paid-unit price, before GST
  const a = Math.max(0, num(s?.buy));
  const b = Math.max(0, num(s?.free));
  const free = a > 0 && b > 0;
  const R = free ? (R0 * a) / (a + b) : R0; // per unit shipped, before GST
  const get = R * (1 + g); // billing value per unit shipped
  const gstGovt = Math.max(0, R * g - CostEx * gi);
  const per = get - gstGovt - cost; // you keep, after GST paid
  const pre = get - cost; // before GST paid
  return {
    mrp, cost, Q, a, b, free,
    ptr: PTRex * (1 + g), pts: PTSex * (1 + g),
    paidInc: R0 * (1 + g), R, get, gstGovt, per, pre,
    received: get * Q, gstBatch: gstGovt * Q, next: cost * Q, take: per * Q,
    pMrp: mrp ? per / mrp : NaN,
    pAft: get ? per / get : NaN,
    pBef: get ? pre / get : NaN,
    costPct: mrp ? cost / mrp : NaN,
    offMrp: MRPex ? 1 - R0 / MRPex : NaN,
    offPtr: PTRex ? 1 - R0 / PTRex : NaN,
    offPts: PTSex ? 1 - R0 / PTSex : NaN,
    // Total discount per unit shipped (free goods included).
    totMrp: MRPex ? 1 - R / MRPex : NaN,
    totPtr: PTRex ? 1 - R / PTRex : NaN,
    totPts: PTSex ? 1 - R / PTSex : NaN,
  };
}

export function rule(s) {
  if (!s || !s.sell_at || !filled(s.discount)) return 'Not set yet';
  const d = num(s.discount);
  let text = d === 0 ? `${SELL_AT[s.sell_at]} price` : `${SELL_AT[s.sell_at]} − ${d}%`;
  if (num(s.free) > 0) text += ` + ${num(s.buy)}+${num(s.free)} free`;
  return text;
}

export const schemeName = (s) => (s?.name?.trim() ? s.name : (s?.sell_at && filled(s?.discount) ? rule(s) : 'Untitled scheme'));
export const productName = (p) => (p?.name?.trim() ? p.name : 'Untitled product');

/** ₹1,19,400.00 style; dp 0 for batch totals. Half-paise round up. */
export function rupees(v, dp = 2) {
  if (!Number.isFinite(v)) return '—';
  const k = 10 ** dp;
  const r = Math.round(v * k + (v >= 0 ? 1e-7 : -1e-7)) / k;
  const neg = r < 0 && Math.abs(r) >= 1 / k;
  return `${neg ? '−' : ''}₹${Math.abs(r).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export const pct = (v, dp = 1) => (Number.isFinite(v) ? `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(dp)}%` : '—');
export const pctShort = (v) => (Number.isFinite(v) ? `${parseFloat((v * 100).toFixed(2))}%` : '—');
export const units = (v) => Math.round(v || 0).toLocaleString('en-IN');

/** Tone for "% of bill after GST": red when negative, amber under 5%. */
export const marginTone = (v) => (!Number.isFinite(v) ? '' : v < -0.00005 ? 'neg' : v < 0.05 ? 'warn' : '');
