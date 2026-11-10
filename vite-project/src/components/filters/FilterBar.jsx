import { useState } from 'react';
import { Badge, Button, CloseButton, Drawer, Group, Paper, Pill, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconAdjustmentsHorizontal, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import classes from './filters.module.css';
import { FilterSheetContext, SHEET_DROPDOWN_PROPS, useInFilterSheet } from './filterSheetContext';

/** Search box with a clear button and Esc-to-clear. */
export function SearchInput({ value, onChange, placeholder = 'Search', className, ...props }) {
  return (
    <TextInput
      className={className ?? classes.search}
      leftSection={<IconSearch size={16} />}
      rightSection={value ? <CloseButton size="sm" aria-label="Clear search" onClick={() => onChange('')} /> : null}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Escape' && value) onChange(''); }}
      aria-label={placeholder}
      {...props}
    />
  );
}

/** Label-less select sized for a filter row; the placeholder doubles as the "All" option. */
export function FilterSelect({ value, onChange, data, placeholder, icon, ...props }) {
  const inSheet = useInFilterSheet();
  return (
    <Select
      className={classes.select}
      data={data}
      value={value || null}
      onChange={(next) => onChange(next || '')}
      placeholder={placeholder}
      leftSection={icon}
      clearable
      comboboxProps={{ shadow: 'md', middlewares: { flip: true, shift: { padding: 8 } }, ...(inSheet && SHEET_DROPDOWN_PROPS) }}
      aria-label={placeholder}
      {...props}
    />
  );
}

/**
 * Consistent filter section for every list. Filters still apply as soon as
 * they change (same logic and API calls as before); only the layout differs.
 *
 * Desktop: one aligned bar -- search, filters, and a Reset button.
 * Phones:  search + a "Filters" button (with active count) that opens a
 *          bottom sheet holding every filter, with Clear / Apply actions.
 * Both:    removable chips for whatever is active.
 *
 * chips: [{ key, label, onRemove }] (key 'q' = the search chip)
 * more:  secondary filters, shown with the others (moreActive is kept for
 *        backward compatibility; the count now comes from the chips).
 */
// eslint-disable-next-line no-unused-vars
export default function FilterBar({ search, onSearch, searchPlaceholder, children, more, moreActive = 0, chips = [], onReset, summary, compact = false }) {
  const active = chips.filter(Boolean);
  const filterCount = active.filter((chip) => chip.key !== 'q').length;
  const hasFilters = Boolean(children || more);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  useBackClose(sheetOpen && isMobile, () => setSheetOpen(false));

  const chipRow = (active.length > 0 || summary) && (
    <Group gap={6} justify="space-between" className={classes.chips} wrap="wrap">
      <Group gap={6} wrap="wrap" className={classes.chipList}>
        {active.length > 0 && <Text size="xs" c="dimmed" fw={600}>Filtered by</Text>}
        {active.map((chip) => (
          <Pill key={chip.key} className={classes.pill} withRemoveButton onRemove={chip.onRemove} removeButtonProps={{ 'aria-label': `Remove ${chip.label}` }}>
            {chip.label}
          </Pill>
        ))}
      </Group>
      {summary && <Text size="xs" c="dimmed">{summary}</Text>}
    </Group>
  );

  if (isMobile) {
    const content = (
      <>
        <Group gap="xs" wrap="nowrap" align="center">
          {onSearch && <SearchInput className={classes.mobileSearch} value={search} onChange={onSearch} placeholder={searchPlaceholder} />}
          {hasFilters && (
            <Button
              className={onSearch ? classes.filtersButton : classes.filtersButtonFull}
              variant={filterCount ? 'light' : 'default'}
              leftSection={<IconAdjustmentsHorizontal size={16} />}
              rightSection={filterCount ? <Badge size="sm" circle>{filterCount}</Badge> : null}
              onClick={() => setSheetOpen(true)}
              aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
            >
              Filters
            </Button>
          )}
        </Group>
        {chipRow}
        {hasFilters && (
          <Drawer
            opened={sheetOpen}
            onClose={() => setSheetOpen(false)}
            position="bottom"
            radius="lg"
            title={<Group gap={8}><Text fw={700}>Filters</Text>{filterCount > 0 && <Badge size="sm" variant="light">{filterCount} active</Badge>}</Group>}
            classNames={{ content: classes.sheet, body: classes.sheetBody }}
          >
            <FilterSheetContext.Provider value>
              <Stack gap="sm" className={classes.sheetFields}>
                {children}
                {more}
              </Stack>
            </FilterSheetContext.Provider>
            <Group grow gap="sm" className={classes.sheetFooter}>
              <Button variant="default" leftSection={<IconFilterOff size={16} />} disabled={!filterCount || !onReset} onClick={() => onReset?.()}>Clear</Button>
              <Button onClick={() => setSheetOpen(false)}>Apply</Button>
            </Group>
          </Drawer>
        )}
      </>
    );
    if (compact) return <div>{content}</div>;
    return <Paper withBorder p="sm" className={classes.bar}>{content}</Paper>;
  }

  const content = (
    <>
      <Group gap="sm" wrap="wrap" align="center">
        {onSearch && <SearchInput value={search} onChange={onSearch} placeholder={searchPlaceholder} />}
        {children}
        {more}
        {onReset && (
          <Button className={classes.reset} variant="subtle" color="gray" leftSection={<IconFilterOff size={15} />} disabled={!active.length} onClick={onReset}>
            Reset
          </Button>
        )}
      </Group>
      {chipRow}
    </>
  );
  if (compact) return <div>{content}</div>;
  return <Paper withBorder p="sm" className={classes.bar}>{content}</Paper>;
}
