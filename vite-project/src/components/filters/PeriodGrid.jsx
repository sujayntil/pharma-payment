import { useState } from 'react';
import { ActionIcon, Button, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { formatDateLocal } from '../../utils/formatters';
import css from './PeriodGrid.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => formatDateLocal(d);
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();

/**
 * Month grid for picking a period: chips on top (All time / Today / …),
 * a year with ‹ › arrows and its 12 months as tiles, then that financial
 * year's quarters (Apr–Mar: Q1–Q4) and the full FY. Months before the first
 * invoice or after today are faded. The current month / quarter / FY run
 * till today. Same size however much data there is.
 *
 *
 * A range: tap the first month (or quarter), then the last one; everything
 * between is picked (Jan then Mar = Jan–Mar). After the first tap a hint
 * and "Done" show; Done (or closing the picker) uses that one month.
 *
 * value: { from, to } in use. firstDate: 'YYYY-MM-DD' of the first invoice (or null).
 * chips: [{ id, label, from, to }] shown first ('' from/to = everything).
 * onPick({ from, to }). onPending(range | null): the first tap of a range,
 * so the picker can use it if closed before a second tap.
 */
export default function PeriodGrid({ value = {}, firstDate, chips = [], onPick, onPending }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = firstDate ? new Date(`${firstDate}T00:00:00`) : null;
  const firstIdx = first && !Number.isNaN(first.getTime()) ? monthIndex(first) : monthIndex(today) - 11;
  const todayIdx = monthIndex(today);
  const picked = value.from ? new Date(`${value.from}T00:00:00`) : today;
  const [year, setYear] = useState(Math.min(picked.getFullYear(), today.getFullYear()));
  const firstYear = Math.floor(firstIdx / 12);

  // A span of months [startIdx, endIdx]: ends today if it is still running.
  const span = (startIdx, endIdx) => {
    const sy = Math.floor(startIdx / 12); const sm = startIdx % 12;
    const ey = Math.floor(endIdx / 12); const em = endIdx % 12;
    const end = endIdx >= todayIdx ? today : new Date(ey, em + 1, 0);
    return { from: day(new Date(sy, sm, 1)), to: day(end) };
  };
  const usable = (startIdx, endIdx) => endIdx >= firstIdx && startIdx <= todayIdx;
  const isOn = (r) => r.from === value.from && r.to === value.to;
  // First tap of a range: { start, end } month indexes.
  const [anchor, setAnchor] = useState(null);
  // Months inside the range in use (or the first tap), for the light fill.
  const shown = anchor || (value.from && value.to ? { start: monthIndex(new Date(`${value.from}T00:00:00`)), end: monthIndex(new Date(`${value.to}T00:00:00`)) } : null);
  const tap = (startIdx, endIdx) => {
    if (!anchor) {
      setAnchor({ start: startIdx, end: endIdx });
      onPending?.(span(startIdx, endIdx));
      return;
    }
    const start = Math.min(anchor.start, startIdx);
    const end = Math.max(anchor.end, endIdx);
    setAnchor(null);
    onPending?.(null);
    onPick(span(start, end));
  };
  const nameOf = (startIdx, endIdx) => {
    const sy = Math.floor(startIdx / 12); const ey = Math.floor(endIdx / 12);
    const a = MONTHS[startIdx % 12]; const b = MONTHS[endIdx % 12];
    if (startIdx === endIdx) return `${a} ${sy}`;
    return sy === ey ? `${a}–${b} ${ey}` : `${a} ${sy} – ${b} ${ey}`;
  };

  // Quarters of the financial year that starts in April of `year`.
  const fyStart = year * 12 + 3;
  const quarters = [0, 1, 2, 3].map((q) => ({ label: `Q${q + 1}`, start: fyStart + q * 3, end: fyStart + q * 3 + 2 }));
  const fy = { start: fyStart, end: fyStart + 11 };

  // rangeable: months and quarters (two taps make a range); Full FY applies at once.
  const tile = (key, label, startIdx, endIdx, className, extra, rangeable = true) => {
    const ok = usable(startIdx, endIdx);
    const r = ok ? span(startIdx, endIdx) : null;
    const on = anchor ? anchor.start === startIdx && anchor.end === endIdx : (r && isOn(r));
    const inside = !on && ok && shown && startIdx >= shown.start && endIdx <= shown.end && (shown.end > shown.start);
    return (
      <UnstyledButton key={key} className={className} disabled={!ok} data-off={!ok || undefined} data-on={on || undefined} data-in={inside || undefined}
        data-now={(startIdx <= todayIdx && todayIdx <= endIdx) || undefined}
        onClick={() => { if (!r) return; if (rangeable) tap(startIdx, endIdx); else { setAnchor(null); onPending?.(null); onPick(r); } }} aria-label={extra}>
        {label}
      </UnstyledButton>
    );
  };

  return (
    <div className={css.wrap}>
      {chips.length > 0 && (
        <div className={css.chips}>
          {chips.map((c) => (
            <UnstyledButton key={c.id} className={css.chip} data-on={(!anchor && (c.from || '') === (value.from || '') && (c.to || '') === (value.to || '')) || undefined} onClick={() => { setAnchor(null); onPending?.(null); onPick({ from: c.from, to: c.to, ...(c.all && { all: true }) }); }}>{c.label}</UnstyledButton>
          ))}
        </div>
      )}
      <Group justify="space-between" mb={8}>
        <ActionIcon variant="default" radius="xl" size={30} aria-label="Previous year" disabled={year <= firstYear} onClick={() => setYear(year - 1)}><IconChevronLeft size={16} /></ActionIcon>
        <Text fw={700} fz={15}>{year}</Text>
        <ActionIcon variant="default" radius="xl" size={30} aria-label="Next year" disabled={year >= today.getFullYear()} onClick={() => setYear(year + 1)}><IconChevronRight size={16} /></ActionIcon>
      </Group>
      <div className={css.months}>
        {MONTHS.map((m, i) => tile(m, m, year * 12 + i, year * 12 + i, css.month, `${m} ${year}`))}
      </div>
      <div className={css.label}>Quarters · FY {year}–{String(year + 1).slice(2)}</div>
      <div className={css.quarters}>
        {quarters.map((q) => tile(q.label, q.label, q.start, q.end, css.quarter, `${q.label} FY ${year}–${String(year + 1).slice(2)}`))}
        {tile('fy', 'Full FY', fy.start, fy.end, css.quarter, `FY ${year}–${String(year + 1).slice(2)}`, false)}
      </div>
      {anchor ? (
        <Group className={css.hint} justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" c="dimmed" style={{ minWidth: 0 }}><b style={{ color: 'var(--app-ink)' }}>{nameOf(anchor.start, anchor.end)}</b> · tap another month or quarter for a range</Text>
          <Button size="compact-sm" style={{ flexShrink: 0 }} onClick={() => { const r = span(anchor.start, anchor.end); setAnchor(null); onPending?.(null); onPick(r); }}>Done</Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed" mt={10}>Tip: tap two months (or quarters) to pick everything between.</Text>
      )}
    </div>
  );
}
