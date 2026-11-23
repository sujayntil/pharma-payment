import { useContext, useState } from 'react';
import { Badge, Button, Checkbox, CloseButton, Combobox, Drawer, Group, Input, InputBase, Paper, Pill, Popover, Select, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { IconAdjustmentsHorizontal, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import classes from './filters.module.css';
import { FilterSheetContext, MoreFiltersContext, SHEET_DROPDOWN_PROPS, useInFilterSheet } from './filterSheetContext';

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

/**
 * Tick one or more options (e.g. customer types). value / onChange use a
 * comma-separated string ("Chemist,Doctor"; "" = all), so it drops into the
 * same filter state and URL params as a single select. The button reads
 * "Chemist, Doctor", or "3 types" once three or more are ticked.
 */
export function FilterChecks({ value, onChange, data, placeholder, icon, noun = 'types', size, w, style, zIndex, className }) {
  const inSheet = useInFilterSheet();
  const inMore = useContext(MoreFiltersContext);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const picked = String(value || '').split(',').filter(Boolean);
  const label = !picked.length ? null : picked.length <= 2 ? picked.join(', ') : `${picked.length} ${noun}`;
  const toggle = (item) => {
    const next = picked.includes(item) ? picked.filter((x) => x !== item) : data.filter((d) => d === item || picked.includes(d));
    onChange(next.join(','));
  };
  return (
    <Combobox store={combobox} onOptionSubmit={toggle} shadow="md" zIndex={zIndex}
      withinPortal={!inMore} middlewares={{ flip: true, shift: { padding: 8 } }} {...(inSheet && SHEET_DROPDOWN_PROPS)}>
      <Combobox.Target>
        <InputBase component="button" type="button" pointer className={className ?? classes.select} size={size} w={w} style={style} leftSection={icon}
          rightSection={picked.length ? <CloseButton size="sm" aria-label={`Clear ${placeholder}`} onClick={(e) => { e.stopPropagation(); onChange(''); }} /> : <Combobox.Chevron />}
          rightSectionPointerEvents={picked.length ? 'all' : 'none'}
          onClick={() => combobox.toggleDropdown()} aria-label={placeholder}>
          {label ? <span className={classes.checksLabel}>{label}</span> : <Input.Placeholder>{placeholder}</Input.Placeholder>}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {data.map((item) => (
            <Combobox.Option value={item} key={item} active={picked.includes(item)}>
              <Group gap="sm" wrap="nowrap">
                <Checkbox checked={picked.includes(item)} onChange={() => {}} size="xs" tabIndex={-1} aria-hidden style={{ pointerEvents: 'none' }} />
                <span>{item}</span>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

/** Label-less select sized for a filter row; the placeholder doubles as the "All" option. */
export function FilterSelect({ value, onChange, data, placeholder, icon, ...props }) {
  const inSheet = useInFilterSheet();
  const inMore = useContext(MoreFiltersContext);
  return (
    <Select
      className={classes.select}
      data={data}
      value={value || null}
      onChange={(next) => onChange(next || '')}
      placeholder={placeholder}
      leftSection={icon}
      clearable
      comboboxProps={{ shadow: 'md', middlewares: { flip: true, shift: { padding: 8 } }, ...(inSheet && SHEET_DROPDOWN_PROPS), ...(inMore && { withinPortal: false }) }}
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
 * moreAsButton: on laptops, put the `more` filters behind a "More" button
 *        (keeps the bar to one line).
 * activeOutline: draw a green outline round the phone Filters button while
 *        any filter is on (used on the MR screens).
 */
export default function FilterBar({ search, onSearch, searchPlaceholder, children, more, moreActive = 0, moreAsButton = false, chips = [], onReset, summary, compact = false, activeOutline = false }) {
  const active = chips.filter(Boolean);
  const filterCount = active.filter((chip) => chip.key !== 'q').length;
  const hasFilters = Boolean(children || more);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  useBackClose(sheetOpen && isMobile, () => setSheetOpen(false));
  useSwipeDownToClose(sheetOpen && isMobile, () => setSheetOpen(false));

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
              style={activeOutline && filterCount ? { outline: '2px solid var(--mantine-primary-color-filled)', outlineOffset: 2 } : undefined}
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
            classNames={{ content: `${classes.sheet} ${SWIPE_SHEET_CLASS}`, body: classes.sheetBody }}
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
        {more && moreAsButton ? (
          <Popover position="bottom-end" shadow="md" withinPortal trapFocus={false} width={260}>
            <Popover.Target>
              <Button variant={moreActive ? 'light' : 'default'} leftSection={<IconAdjustmentsHorizontal size={16} />}
                rightSection={moreActive ? <Badge size="sm" circle>{moreActive}</Badge> : null} aria-label={moreActive ? `More filters, ${moreActive} on` : 'More filters'}>
                More
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <MoreFiltersContext.Provider value>
                <Stack gap="sm" className={classes.moreFields}>{more}</Stack>
              </MoreFiltersContext.Provider>
            </Popover.Dropdown>
          </Popover>
        ) : more}
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
