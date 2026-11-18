import { useState } from 'react';
import { Button, Divider, Group, Popover, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconCheck, IconChevronDown } from '@tabler/icons-react';
import classes from '../filters/filters.module.css';
import css from './PeriodPicker.module.css';

/**
 * One date control for Insights: shows the period in use; opens a list of
 * ready periods with "Custom dates" (From/To) at the bottom.
 */
export default function PeriodPicker({ presets, periodId, custom, label, onPreset, onCustom, fullWidth = false }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(custom);
  const [error, setError] = useState('');

  const open = () => { setDraft(periodId === 'custom' ? custom : { from: '', to: '' }); setError(''); setOpened(true); };
  const pick = (id) => { onPreset(id); setOpened(false); };
  const apply = () => {
    if (!draft.from || !draft.to) { setError('Choose both dates.'); return; }
    if (draft.from > draft.to) { setError('Start date must be on or before end date.'); return; }
    onCustom(draft); setOpened(false);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" shadow="md" width={fullWidth ? 'target' : 260} trapFocus middlewares={{ flip: true, shift: { padding: 12 } }}>
      <Popover.Target>
        <Button variant="default" fullWidth={fullWidth} justify="flex-start" styles={{ label: { flex: 1 } }} leftSection={<IconCalendar size={16} />} rightSection={<IconChevronDown size={14} />}
          onClick={() => (opened ? setOpened(false) : open())} className={classes.trigger} aria-label={`Period: ${label}`}>
          <Text span size="sm" fw={600} truncate ta="left" style={{ flex: 1 }}>{label}</Text>
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw="calc(100vw - 24px)">
        <Stack gap={2}>
          {presets.map((p) => (
            <UnstyledButton key={p.id} className={css.item} data-active={periodId === p.id || undefined} onClick={() => pick(p.id)}>
              {p.label}{periodId === p.id && <IconCheck size={15} />}
            </UnstyledButton>
          ))}
          <Divider label="Custom dates" labelPosition="left" my={6} />
          <Group grow gap="xs">
            <TextInput size="xs" type="date" label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <TextInput size="xs" type="date" label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
          </Group>
          {error && <Text size="xs" c="red" mt={4}>{error}</Text>}
          <Group justify="flex-end" gap="xs" mt={8}>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setOpened(false)}>Cancel</Button>
            <Button size="xs" onClick={apply}>Apply</Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
