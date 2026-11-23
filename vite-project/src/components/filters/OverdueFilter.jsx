import { useContext, useRef, useState } from 'react';
import { Group, NumberInput, Stack } from '@mantine/core';
import { IconClockExclamation } from '@tabler/icons-react';
import { FilterSelect } from './FilterBar';
import { DUE_OPTIONS } from './dueFilter';
import { MoreFiltersContext, useInFilterSheet } from './filterSheetContext';

/**
 * "All bills / Not yet due / Overdue", and with Overdue a "More than __ days"
 * box (blank = any overdue). Due date = bill date + credit period (40 days,
 * 60 for distributors). onChange({ due, days }); typing is debounced.
 */
export default function OverdueFilter({ due, days, onChange, size, compact = false, zIndex }) {
  const [typed, setTyped] = useState(days ?? '');
  const [shown, setShown] = useState(days ?? '');
  const timer = useRef(null);
  // In the laptop "More" popover and the phone filter sheet: box under the dropdown.
  const inMore = useContext(MoreFiltersContext);
  const inSheet = useInFilterSheet();
  const vertical = inMore || inSheet;
  const Wrap = vertical ? Stack : Group;
  // Keep the box in step when the filter is cleared from outside (chip ×, Reset).
  if ((days ?? '') !== shown) { setShown(days ?? ''); setTyped(days ?? ''); }
  const onDays = (value) => {
    const next = value === '' || value == null ? '' : String(Math.max(0, Math.min(999, Math.floor(Number(value)))));
    setTyped(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ due: 'overdue', days: next }), 400);
  };
  return (
    <Wrap gap={6} {...(!vertical && { wrap: 'nowrap' })} style={{ minWidth: 0 }}>
      <FilterSelect placeholder="All bills" size={size} icon={<IconClockExclamation size={16} />} data={DUE_OPTIONS} value={due}
        onChange={(next) => onChange({ due: next || '', days: next === 'overdue' ? typed : '' })} style={compact && !vertical ? { flex: 1 } : undefined}
        {...(zIndex && { comboboxProps: { withinPortal: true, zIndex } })} />
      {due === 'overdue' && (
        <NumberInput size={size} w={vertical ? undefined : compact ? 120 : 150} placeholder="More than … days" value={typed} onChange={onDays}
          min={0} max={999} allowDecimal={false} allowNegative={false} hideControls suffix={typed !== '' ? ' days' : undefined}
          aria-label="Overdue by more than how many days" />
      )}
    </Wrap>
  );
}
