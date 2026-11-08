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

/** Human label for a {from, to} range: a preset name, or "1 Nov 2026 – 8 Nov 2026". */
export function describeRange({ from, to } = {}) {
  if (!from && !to) return null;
  const preset = datePresets().find((p) => p.from === from && p.to === to);
  if (preset) return preset.label;
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  return from ? `From ${fmt(from)}` : `Until ${fmt(to)}`;
}

export const EMPTY_RANGE = { from: '', to: '' };
