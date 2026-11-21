import { useRef, useState } from 'react';
import { Button, Collapse, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import PeriodGrid from '../filters/PeriodGrid';
import RangeCalendar from '../filters/RangeCalendar';
import DayStepper from '../filters/DayStepper';
import classes from '../filters/filters.module.css';

/**
 * One date control for Insights: shows the period in use; opens the month
 * grid (year, months, FY quarters, full FY) with "Custom dates" (From/To,
 * for weeks or any range) folded underneath.
 */
export default function PeriodPicker({ value, firstDate, label, onPick, onClear, isCustom = false, fullWidth = false, chips = [] }) {
  const [opened, setOpened] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const open = () => { setCustomOpen(isCustom); setOpened(true); };
  const pending = useRef(null); // a range's first tap, used if the picker closes before the second
  const pick = (range) => { pending.current = null; onPick(range); setOpened(false); };
  const close = () => { const r = pending.current; pending.current = null; if (r) onPick(r); setOpened(false); };

  return (
    <DayStepper value={isCustom ? value : null} firstDate={firstDate} onChange={(r) => { pending.current = null; setOpened(false); onPick(r); }}>
    <Popover opened={opened} onChange={(o) => (o ? setOpened(true) : close())} position="bottom-end" shadow="md" width={fullWidth ? 'target' : 330} trapFocus middlewares={{ flip: true, shift: { padding: 12 } }}>
      <Popover.Target>
        <Button variant="default" fullWidth={fullWidth} justify="flex-start" styles={{ label: { flex: 1 } }} leftSection={<IconCalendar size={16} />} rightSection={onClear ? <span role="button" tabIndex={0} aria-label="Clear dates" className={classes.clearX}
              onClick={(e) => { e.stopPropagation(); pending.current = null; setOpened(false); onClear(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pending.current = null; setOpened(false); onClear(); } }}><IconX size={14} /></span> : <IconChevronDown size={14} />}
          onClick={() => (opened ? close() : open())} className={classes.trigger} aria-label={`Period: ${label}`}>
          <Text span size="sm" fw={600} truncate ta="left" style={{ flex: 1 }}>{label}</Text>
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw="calc(100vw - 24px)">
        <Stack gap={8}>
          <PeriodGrid hideMonths={customOpen} value={value} firstDate={firstDate} chips={chips} onPick={pick} onPreview={(r) => { pending.current = null; onPick(r); }}
            onClear={onClear ? () => { pending.current = null; onClear(); setOpened(false); } : undefined}
            footer={(
              <UnstyledButton className={classes.customLink} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
                {customOpen ? <><IconChevronLeft size={14} /> Months</> : <>Pick a day or dates <IconChevronRight size={14} /></>}
              </UnstyledButton>
            )} />
          <Collapse expanded={customOpen}>
            <RangeCalendar key={`${opened}-${value?.from}-${value?.to}`} value={isCustom ? value : { from: '', to: '' }} minDate={firstDate ? String(firstDate).slice(0, 10) : undefined}
              onApply={pick} onCancel={() => { pending.current = null; setOpened(false); }} />
          </Collapse>
        </Stack>
      </Popover.Dropdown>
    </Popover>
    </DayStepper>
  );
}
