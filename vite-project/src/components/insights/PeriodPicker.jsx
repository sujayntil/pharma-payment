import { useRef, useState } from 'react';
import { Button, Collapse, Group, Popover, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-react';
import PeriodGrid from '../filters/PeriodGrid';
import classes from '../filters/filters.module.css';

/**
 * One date control for Insights: shows the period in use; opens the month
 * grid (year, months, FY quarters, full FY) with "Custom dates" (From/To,
 * for weeks or any range) folded underneath.
 */
export default function PeriodPicker({ value, firstDate, label, onPick, onClear, isCustom = false, fullWidth = false, chips = [] }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const open = () => { setDraft(isCustom ? value : { from: '', to: '' }); setError(''); setCustomOpen(isCustom); setOpened(true); };
  const pending = useRef(null); // a range's first tap, used if the picker closes before the second
  const pick = (range) => { pending.current = null; onPick(range); setOpened(false); };
  const close = () => { const r = pending.current; pending.current = null; if (r) onPick(r); setOpened(false); };
  const apply = () => {
    if (!draft.from || !draft.to) { setError('Choose both dates.'); return; }
    if (draft.from > draft.to) { setError('Start date must be on or before end date.'); return; }
    pick(draft);
  };

  return (
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
          <PeriodGrid value={value} firstDate={firstDate} chips={chips} onPick={pick} onPending={(r) => { pending.current = r; }}
            onClear={onClear ? () => { pending.current = null; onClear(); setOpened(false); } : undefined}
            footer={(
              <UnstyledButton className={classes.customLink} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
                Custom dates <IconChevronRight size={14} style={{ transform: customOpen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
              </UnstyledButton>
            )} />
          <Collapse expanded={customOpen}>
            <Stack gap="xs">
              <Group grow gap="xs">
                <TextInput size="xs" type="date" label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
                <TextInput size="xs" type="date" label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
              </Group>
              {error && <Text size="xs" c="red">{error}</Text>}
              <Group justify="flex-end" gap="xs">
                <Button size="xs" variant="subtle" color="gray" onClick={() => { pending.current = null; setOpened(false); }}>Cancel</Button>
                <Button size="xs" onClick={apply}>Apply</Button>
              </Group>
            </Stack>
          </Collapse>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
