import { useState } from 'react';
import { Button, Collapse, Group, Popover, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import PeriodGrid from '../filters/PeriodGrid';
import classes from '../filters/filters.module.css';

/**
 * One date control for Insights: shows the period in use; opens the month
 * grid (year, months, FY quarters, full FY) with "Custom dates" (From/To,
 * for weeks or any range) folded underneath.
 */
export default function PeriodPicker({ value, firstDate, label, onPick, isCustom = false, fullWidth = false }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const open = () => { setDraft(isCustom ? value : { from: '', to: '' }); setError(''); setCustomOpen(isCustom); setOpened(true); };
  const pick = (range) => { onPick(range); setOpened(false); };
  const apply = () => {
    if (!draft.from || !draft.to) { setError('Choose both dates.'); return; }
    if (draft.from > draft.to) { setError('Start date must be on or before end date.'); return; }
    pick(draft);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" shadow="md" width={fullWidth ? 'target' : 330} trapFocus middlewares={{ flip: true, shift: { padding: 12 } }}>
      <Popover.Target>
        <Button variant="default" fullWidth={fullWidth} justify="flex-start" styles={{ label: { flex: 1 } }} leftSection={<IconCalendar size={16} />} rightSection={<IconChevronDown size={14} />}
          onClick={() => (opened ? setOpened(false) : open())} className={classes.trigger} aria-label={`Period: ${label}`}>
          <Text span size="sm" fw={600} truncate ta="left" style={{ flex: 1 }}>{label}</Text>
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw="calc(100vw - 24px)">
        <Stack gap={10}>
          <PeriodGrid value={value} firstDate={firstDate} onPick={pick} />
          <UnstyledButton className={classes.customToggle} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
            <span>Custom dates (weeks or any range)</span>
            <IconChevronRight size={15} style={{ transform: customOpen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
          </UnstyledButton>
          <Collapse expanded={customOpen}>
            <Stack gap="xs">
              <Group grow gap="xs">
                <TextInput size="xs" type="date" label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
                <TextInput size="xs" type="date" label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
              </Group>
              {error && <Text size="xs" c="red">{error}</Text>}
              <Group justify="flex-end" gap="xs">
                <Button size="xs" variant="subtle" color="gray" onClick={() => setOpened(false)}>Cancel</Button>
                <Button size="xs" onClick={apply}>Apply</Button>
              </Group>
            </Stack>
          </Collapse>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
