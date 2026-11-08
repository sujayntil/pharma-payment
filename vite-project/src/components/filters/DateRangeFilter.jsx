import { useState } from 'react';
import { Button, Divider, Group, Popover, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronDown } from '@tabler/icons-react';
import { datePresets, describeRange, EMPTY_RANGE } from './dateRanges';
import classes from './filters.module.css';
import { SHEET_DROPDOWN_PROPS, useInFilterSheet } from './filterSheetContext';

/**
 * Compact date-range control: a button that opens quick presets plus a
 * custom From/To. Presets apply immediately; custom ranges apply on "Apply".
 */
export default function DateRangeFilter({ label = 'Date', value = EMPTY_RANGE, onChange, allLabel = 'Any date' }) {
  const inSheet = useInFilterSheet();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const presets = datePresets();
  const activePreset = presets.find((p) => p.from === value.from && p.to === value.to);
  const summary = describeRange(value);

  const open = () => { setDraft(value); setError(''); setOpened(true); };
  const commit = (range) => { onChange(range); setOpened(false); };
  const applyCustom = () => {
    if (draft.from && draft.to && draft.from > draft.to) { setError('Start date must be on or before end date.'); return; }
    commit(draft);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md" width={340} trapFocus middlewares={{ flip: true, shift: { padding: 12 } }} {...(inSheet && SHEET_DROPDOWN_PROPS)}>
      <Popover.Target>
        <Button
          variant={summary ? 'light' : 'default'}
          leftSection={<IconCalendar size={16} />}
          rightSection={<IconChevronDown size={14} />}
          onClick={() => (opened ? setOpened(false) : open())}
          className={classes.trigger}
        >
          <Text span size="sm" c="dimmed" mr={4}>{label}:</Text>
          <Text span size="sm" fw={600} truncate>{summary || allLabel}</Text>
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw="calc(100vw - 24px)">
        <Stack gap="xs">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">Quick ranges</Text>
          <SimpleGrid cols={2} spacing={6} verticalSpacing={6}>
            <UnstyledButton className={classes.preset} data-active={!summary || undefined} onClick={() => commit(EMPTY_RANGE)}>{allLabel}</UnstyledButton>
            {presets.map((preset) => (
              <UnstyledButton key={preset.id} className={classes.preset} data-active={activePreset?.id === preset.id || undefined} onClick={() => commit({ from: preset.from, to: preset.to })}>
                {preset.label}
              </UnstyledButton>
            ))}
          </SimpleGrid>
          <Divider label="Custom range" labelPosition="left" my={4} />
          <Group grow gap="xs">
            <TextInput size="xs" type="date" label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
            <TextInput size="xs" type="date" label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
          </Group>
          {error && <Text size="xs" c="red">{error}</Text>}
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="subtle" color="gray" onClick={() => setOpened(false)}>Cancel</Button>
            <Button size="xs" onClick={applyCustom} disabled={!draft.from && !draft.to}>Apply</Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
