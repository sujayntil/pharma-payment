import { useRef, useState } from 'react';
import { Button, Collapse, Divider, Group, Popover, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconCalendar, IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-react';
import { datePresets, describeRange, EMPTY_RANGE, isCustomRange } from './dateRanges';
import { formatDateLocal } from '../../utils/formatters';
import PeriodGrid from './PeriodGrid';
import classes from './filters.module.css';
import { useInFilterSheet } from './filterSheetContext';

/**
 * Compact date-range control: a button that opens quick presets plus a
 * custom From/To. Presets apply immediately; custom ranges apply on "Apply".
 *
 * months: show the month grid (year, 12 month tiles, FY quarters, full FY)
 *   instead of the quick ranges. firstDate: first invoice date, so months
 *   before it are faded. quick: chips next to "All": 'today', 'yesterday'.
 */
export default function DateRangeFilter({ label = 'Date', value = EMPTY_RANGE, onChange, allLabel = 'Any date', months = false, firstDate, quick = ['today'] }) {
  const inSheet = useInFilterSheet();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const presets = months ? [] : datePresets();
  const activePreset = presets.find((p) => p.from === value.from && p.to === value.to);
  const summary = describeRange(value, { business: months });

  const now = new Date();
  const today = formatDateLocal(now);
  const yesterday = formatDateLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const weekAgo = formatDateLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const QUICK = {
    today: { id: 'today', label: 'Today', from: today, to: today },
    yesterday: { id: 'yesterday', label: 'Yesterday', from: yesterday, to: yesterday },
    last7: { id: 'last7', label: 'Last 7 days', from: weekAgo, to: today },
  };
  // Month picker: the same three chips everywhere (All · Today · Last 7 days).
  const chips = months
    ? [{ id: 'all', label: allLabel, from: '', to: '' }, QUICK.today, QUICK.last7]
    : [{ id: 'all', label: allLabel, from: '', to: '' }, ...quick.map((id) => QUICK[id]).filter(Boolean)];

  const open = () => {
    setDraft(value); setError(''); setOpened(true);
    // Open Custom straight away when the dates in use are a custom range.
    setCustomOpen(months && isCustomRange(value));
  };
  // One month tapped (a range's first tap), then the picker closed: use that month.
  const pending = useRef(null);
  const commit = (range) => { pending.current = null; onChange({ from: range.from, to: range.to }); setOpened(false); };
  const close = () => { const r = pending.current; pending.current = null; if (r) onChange(r); setOpened(false); };
  const applyCustom = () => {
    if (draft.from && draft.to && draft.from > draft.to) { setError('Start date must be on or before end date.'); return; }
    commit(draft);
  };

  const custom = (
    <>
      <Group grow gap="xs">
        <TextInput size="xs" type="date" label="From" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.currentTarget.value })} />
        <TextInput size="xs" type="date" label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.currentTarget.value })} />
      </Group>
      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end" gap="xs">
        {!inSheet && <Button size="xs" variant="subtle" color="gray" onClick={() => { pending.current = null; setOpened(false); }}>Cancel</Button>}
        {/* In the phone sheet the sheet's own Apply is the only "Apply". */}
        <Button size="xs" onClick={applyCustom} disabled={!draft.from && !draft.to}>{inSheet ? 'Use these dates' : 'Apply'}</Button>
      </Group>
    </>
  );

  const panel = months ? (
          <Stack gap={8}>
            <PeriodGrid value={value} firstDate={firstDate} chips={chips} onPick={commit} onPreview={(r) => { pending.current = null; onChange(r); }}
              onClear={value.from || value.to ? () => commit(EMPTY_RANGE) : undefined}
              footer={(
                <UnstyledButton className={classes.customLink} onClick={() => setCustomOpen((o) => !o)} aria-expanded={customOpen}>
                  Custom dates <IconChevronRight size={14} style={{ transform: customOpen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
                </UnstyledButton>
              )} />
            <Collapse expanded={customOpen}><Stack gap="xs" pt={4}>{custom}</Stack></Collapse>
          </Stack>
        ) : (
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
            {custom}
          </Stack>
        );
  const trigger = (
        <Button
          variant={summary ? 'light' : 'default'}
          leftSection={<IconCalendar size={16} />}
          // Dates set: a small × clears them in one tap (no need to open the picker).
          rightSection={summary ? <span role="button" tabIndex={0} aria-label="Clear dates" className={classes.clearX}
              onClick={(e) => { e.stopPropagation(); pending.current = null; setOpened(false); onChange(EMPTY_RANGE); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pending.current = null; setOpened(false); onChange(EMPTY_RANGE); } }}><IconX size={14} /></span> : <IconChevronDown size={14} />}
          onClick={() => (opened ? close() : open())}
          className={classes.trigger}
        >
          <Text span size="sm" c="dimmed" mr={4}>{label}:</Text>
          <Text span size="sm" fw={600} truncate>{summary || allLabel}</Text>
        </Button>
  );

  // Phone filter sheet: open in place under the Dates row (no second layer on top).
  if (inSheet) {
    return (
      <div className={classes.inlineDates}>
        {trigger}
        <Collapse expanded={opened}><div className={classes.inlinePanel}>{panel}</div></Collapse>
      </div>
    );
  }

  return (
    <Popover opened={opened} onChange={(o) => (o ? setOpened(true) : close())} position="bottom-start" shadow="md" width={months ? 330 : 340} trapFocus middlewares={{ flip: true, shift: { padding: 12 } }}>
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown maw="calc(100vw - 24px)">{panel}</Popover.Dropdown>
    </Popover>
  );
}
