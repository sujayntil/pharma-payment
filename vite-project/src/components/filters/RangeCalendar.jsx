import { useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { formatDateLocal } from '../../utils/formatters';

const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
/** "18 Nov 2026", "12–18 Nov 2026", "28 Oct – 3 Nov 2026". */
function rangeText(from, to) {
  if (from === to) return fmt(from);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${fmt(to)}`;
  if (fy === ty) return `${fmt(from).replace(` ${fy}`, '')} – ${fmt(to)}`;
  return `${fmt(from)} – ${fmt(to)}`;
}

/**
 * One calendar for a day or a range (the usual way in business apps):
 * tap a date = that day; tap a second date = from the first to the second;
 * tap the same date twice = that day. Nothing applies until "Show …".
 */
export default function RangeCalendar({ value, minDate, onApply, onCancel, applyText }) {
  const today = formatDateLocal(new Date());
  const [pick, setPick] = useState([value?.from || null, value?.to || null]);
  const [start, end] = pick;
  const range = start ? { from: start, to: end || start } : null;
  const label = range ? rangeText(range.from, range.to) : '';

  return (
    <Stack gap={6} align="stretch">
      <Group justify="center">
        <DatePicker type="range" allowSingleDateInRange value={pick} onChange={setPick}
          defaultDate={value?.to || value?.from || today} maxDate={today} minDate={minDate || undefined}
          size="sm" firstDayOfWeek={1} weekendDays={[]} aria-label="Pick a day or a range" />
      </Group>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
          {range ? <b style={{ color: 'var(--app-ink)' }}>{label}</b> : 'Tap a day, or two days for a range'}
          {start && !end && <> · tap another day for a range</>}
        </Text>
        <Group gap={6} wrap="nowrap">
          {onCancel && <Button size="xs" variant="subtle" color="gray" onClick={onCancel}>Cancel</Button>}
          <Button size="xs" disabled={!range} onClick={() => onApply(range)}>{applyText || 'Apply'}</Button>
        </Group>
      </Group>
    </Stack>
  );
}
