import { formatDateLocal } from '../../utils/formatters';

const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };

/** Presets use the browser's local date, matching how the backend reads IST dates. */
export function datePresets(today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fyStartYear = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; // Indian FY: Apr–Mar
  return [
    { id: 'today', label: 'Today', from: t, to: t },
    { id: 'yesterday', label: 'Yesterday', from: addDays(t, -1), to: addDays(t, -1) },
    { id: '7d', label: 'Last 7 days', from: addDays(t, -6), to: t },
    { id: '30d', label: 'Last 30 days', from: addDays(t, -29), to: t },
    { id: 'month', label: 'This month', from: new Date(t.getFullYear(), t.getMonth(), 1), to: t },
    { id: 'lastMonth', label: 'Last month', from: new Date(t.getFullYear(), t.getMonth() - 1, 1), to: new Date(t.getFullYear(), t.getMonth(), 0) },
    { id: 'quarter', label: 'Last 90 days', from: addDays(t, -89), to: t },
    { id: 'fy', label: 'This financial year', from: new Date(fyStartYear, 3, 1), to: t },
  ].map((preset) => ({ ...preset, from: formatDateLocal(preset.from), to: formatDateLocal(preset.to) }));
}

const fmt = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Business periods for the Dashboard and Insights date lists: months by name
 * (newest first, back to the first month with data, at most 12), financial-year
 * quarters (Apr–Jun = Q1), and the financial year. The current month, quarter
 * and year run till today ("so far").
 * Each: { id, label, group: 'month' | 'quarter' | 'year', from, to, current }.
 */
export function businessPeriods(firstDate, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = (d) => formatDateLocal(d);
  const last = (y, m) => new Date(y, m + 1, 0);
  const first = firstDate ? new Date(`${firstDate}T00:00:00`) : null;
  const startIndex = t.getFullYear() * 12 + t.getMonth();
  const oldest = first && !Number.isNaN(first.getTime()) ? Math.max(first.getFullYear() * 12 + first.getMonth(), startIndex - 11) : startIndex - 11;
  const out = [];
  for (let i = startIndex; i >= oldest; i -= 1) {
    const y = Math.floor(i / 12); const m = i % 12; const current = i === startIndex;
    out.push({ id: `m-${y}-${m + 1}`, group: 'month', current, label: `${LONG[m]} ${y}`, from: day(new Date(y, m, 1)), to: day(current ? t : last(y, m)) });
  }
  // Financial-year quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar.
  const qStart = (i) => i - (((i % 12) - 3 + 12) % 3);
  for (let q = qStart(startIndex), n = 0; q + 2 >= oldest && n < 4; q -= 3, n += 1) {
    const y = Math.floor(q / 12); const m = q % 12; const current = q === qStart(startIndex);
    const endIndex = q + 2; const ey = Math.floor(endIndex / 12); const em = endIndex % 12;
    const qn = Math.floor(((m - 3 + 12) % 12) / 3) + 1;
    out.push({ id: `q-${y}-${m + 1}`, group: 'quarter', current, label: `${MONTHS[m]}–${MONTHS[em]} ${ey} (Q${qn})`, from: day(new Date(y, m, 1)), to: day(current ? t : last(ey, em)) });
  }
  const fy = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  out.push({ id: `fy-${fy}`, group: 'year', current: true, label: `FY ${fy}–${String(fy + 1).slice(2)}`, from: day(new Date(fy, 3, 1)), to: day(t) });
  if (first && first < new Date(fy, 3, 1)) {
    out.push({ id: `fy-${fy - 1}`, group: 'year', current: false, label: `FY ${fy - 1}–${String(fy).slice(2)}`, from: day(new Date(fy - 1, 3, 1)), to: day(new Date(fy, 2, 31)) });
  }
  return out;
}

/** Human label for a {from, to} range: a preset name, or "1 Nov 2026 – 8 Nov 2026".
 * Months, quarters and financial years are named ("October 2026") first;
 * pass business: false for the old quick-preset names ("Last month"). */
export function describeRange({ from, to } = {}, { business = true } = {}) {
  if (!from && !to) return null;
  if (business) {
    const named = businessPeriods(null).find((p) => p.from === from && p.to === to)
      || monthOrQuarterName(from, to);
    if (named) return typeof named === 'string' ? named : named.label;
  }
  // Day-based quick ranges keep their names ("Today", "Last 7 days").
  const preset = datePresets().find((p) => p.from === from && p.to === to && (!business || !['month', 'lastMonth', 'fy'].includes(p.id)));
  if (preset) return preset.label;
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  return from ? `From ${fmt(from)}` : `Until ${fmt(to)}`;
}

export const EMPTY_RANGE = { from: '', to: '' };

/** "October 2025" for a whole calendar month outside the last 12, else null. */
function monthOrQuarterName(from, to) {
  if (!from || !to) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  // Whole months, the last one may still be running (ends today).
  const now = new Date();
  const runningToday = ty === now.getFullYear() && tm === now.getMonth() + 1 && td === now.getDate();
  if (fd !== 1 || (td !== new Date(ty, tm, 0).getDate() && !runningToday)) return null;
  if (fy === ty && fm === tm) return `${LONG[fm - 1]} ${fy}`;
  const span = (ty * 12 + tm) - (fy * 12 + fm);
  if (span === 2 && [1, 4, 7, 10].includes(fm)) return `${MONTHS[fm - 1]}–${MONTHS[tm - 1]} ${ty} (Q${Math.floor(((fm - 4 + 12) % 12) / 3) + 1})`;
  if (span === 11 && fm === 4) return `FY ${fy}–${String(fy + 1).slice(2)}`;
  // A range of months picked on the grid: "Jan–Mar 2026", "Nov 2025 – Feb 2026".
  if (span > 0) return fy === ty ? `${MONTHS[fm - 1]}–${MONTHS[tm - 1]} ${ty}` : `${MONTHS[fm - 1]} ${fy} – ${MONTHS[tm - 1]} ${ty}`;
  return null;
}

/** True when a range is the user's own From/To (not a month, quarter, FY, Today…). */
export function isCustomRange({ from, to } = {}) {
  if (!from && !to) return false;
  if (businessPeriods(null).some((p) => p.from === from && p.to === to)) return false;
  if (monthOrQuarterName(from, to)) return false;
  return !datePresets().some((p) => p.from === from && p.to === to && ['today', 'yesterday'].includes(p.id));
}

/**
 * Short name for a compared range, for "vs …" lines on small tiles:
 * "Oct 2026", "Jul–Sep 2026", "FY 2025–26", "1–18 Oct", "1 Jul – 18 Aug".
 */
export function shortRange({ from, to } = {}) {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const wholeEnd = td === new Date(ty, tm, 0).getDate();
  if (fd === 1 && wholeEnd) {
    const span = (ty * 12 + tm) - (fy * 12 + fm);
    if (span === 0) return `${MONTHS[fm - 1]} ${fy}`;
    if (span === 11 && fm === 4) return `FY ${fy}–${String(fy + 1).slice(2)}`;
    return `${MONTHS[fm - 1]}–${MONTHS[tm - 1]} ${ty}`;
  }
  if (fy === ty && fm === tm) return fd === td ? `${fd} ${MONTHS[fm - 1]}` : `${fd}–${td} ${MONTHS[fm - 1]}`;
  return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]}${fy !== ty ? ` ${ty}` : ''}`;
}
