import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Group, Loader, Menu, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowBackUp, IconCash, IconCategory, IconDots, IconEdit, IconFileInvoice, /* IconHistory, */ IconUser, IconUserShield, IconWallet } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSidePanelSpace } from '../../hooks/useSidePanelSpace';
import FilterBar, { FilterChecks, FilterSelect } from '../../components/filters/FilterBar';
import { TYPE_GROUPS, listLabel } from '../../utils/customerTypes';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
// Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
// import MarkUnpaidModal from '../../components/collections/MarkUnpaidModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import ReversePaymentModal from '../../components/collections/ReversePaymentModal';
import ChangeModeModal from '../../components/collections/ChangeModeModal';
import { PAYMENT_MODES } from '../../components/collections/collectionUtils';
import { RecordedBy, StatusBadge } from '../../components/collections/CollectionBadges';
import { recorderOf, useActorLabel } from '../../components/collections/collectionUtils';
import { downloadErrorText, errorText, money, saveDownload, dayOf, timeOf } from '../../utils/formatters';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import EmptyResults from '../../components/common/EmptyResults';
import { useFirstInvoiceDate } from '../../hooks/useFirstInvoiceDate';
import TableScroll from '../../components/common/TableScroll';
import StickyFilters from '../../components/common/StickyFilters';
import TitleBar, { MiniStat } from '../../components/common/TitleBar';
import ExportMenu from '../../components/common/ExportMenu';
import { useRememberedState } from '../../hooks/useRememberedState';
import { offerUndo } from '../../utils/undo';

/**
 * Second line of a phone collection card, kept to one short line:
 * "16 Nov 2026, 2:01 pm · Rahul", plus "· by Admin" only when someone other
 * than the assigned MR recorded it, and the reference on its own line.
 */
function CardMeta({ row }) {
  const by = useActorLabel()(recorderOf(row));
  const mr = row.mr_name || 'Unassigned';
  return <>
    <span style={{ whiteSpace: 'nowrap' }}>{dayOf(row.payment_date)}, {timeOf(row.payment_date)}</span>
    {' · '}{mr}{by && by !== mr && by !== '—' ? ` · by ${by}` : ''}
    {row.transaction_reference && <><br />Ref: {row.transaction_reference}</>}
  </>;
}

const BLANK = { range: EMPTY_RANGE, mrId: '', mode: '', recordedBy: '', entryType: '', customerType: '', area: '' };
const NO_AREA = '__none__'; // Insights: customers without an area
const RECORDED_BY = [{ value: 'MR', label: 'By MR' }, { value: 'ADMIN', label: 'By Admin' }];
const ENTRY_TYPES = [{ value: 'collection', label: 'Collections only' }, { value: 'reversal', label: 'Reversals only' }];

/** preset: filters to open with (from Insights' "See in Collections"). */
export default function AdminCollections({ preset = null }) {
  const firstDate = useFirstInvoiceDate(); // month picker fades months before it
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [count, setCount] = useState(0); const [mrs, setMrs] = useState([]);
  // Remembered; a link from elsewhere (preset) brings its own filters.
  const [search, setSearch] = useRememberedState('collections:search', preset?.search || '', { skip: Boolean(preset) }); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useRememberedState('collections:filters', () => ({ ...BLANK, ...(preset || {}), range: preset?.range || EMPTY_RANGE }), { skip: Boolean(preset) }); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const isMobile = useIsMobile();
  const [changingMode, setChangingMode] = useState(null); const [recording, setRecording] = useState(null); /* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed: const [reversing, setReversing] = useState(null); */ const [reversingPayment, setReversingPayment] = useState(null); const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await adminApi.getCollections({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(filters.range.from && { date_from: filters.range.from }),
          ...(filters.range.to && { date_to: filters.range.to }),
          ...(filters.mrId && { mr_id: filters.mrId }),
          ...(filters.mode && { mode: filters.mode }),
          ...(filters.recordedBy && { recorded_by: filters.recordedBy }),
          ...(filters.entryType && { entry_type: filters.entryType }),
          ...(filters.customerType && { customer_type: filters.customerType }),
          ...(filters.area && { area: filters.area }),
        });
        if (active) { setRows(result.rows); setTotal(result.total_amount); setCount(result.total_count); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [debouncedSearch, filters, page, refresh, appRefresh]);

  // Export: every ledger entry matching the current filters and search (not just this page).
  const [exporting, setExporting] = useState(false);
  const exportExcel = async (format = 'xlsx') => {
    setExporting(true); setError('');
    try {
      saveDownload(await adminApi.exportCollections({
        format,
        ...(search.trim() && { search: search.trim() }),
        ...(filters.range.from && { date_from: filters.range.from }),
        ...(filters.range.to && { date_to: filters.range.to }),
        ...(filters.mrId && { mr_id: filters.mrId }),
        ...(filters.mode && { mode: filters.mode }),
        ...(filters.recordedBy && { recorded_by: filters.recordedBy }),
        ...(filters.entryType && { entry_type: filters.entryType }),
        ...(filters.customerType && { customer_type: filters.customerType }),
        ...(filters.area && { area: filters.area }),
      }), `collections.${format}`);
    } catch (err) { setError(await downloadErrorText(err)); }
    finally { setExporting(false); }
  };

  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => {
    const before = { filters, search };
    setFilters(BLANK); setSearch(''); setPage(1);
    offerUndo('Filters cleared', () => { setFilters(before.filters); setSearch(before.search); setPage(1); });
  };
  const reload = () => setRefresh((value) => value + 1);
  const panelSpace = useSidePanelSpace(Boolean(historyId));
  const mrOptions = useMemo(() => mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), [mrs]);
  const rangeLabel = describeRange(filters.range);
  // Payment rows describe money already received, so they carry no Collect
  // button. When the row's invoice still has money due (part paid, or after
  // a reversal), the ⋯ menu offers "Collect balance".
  const canReverse = (row) => !row.is_reversal && row.amount > 0 && !row.fully_reversed && Number(row.paid_amount) > 0;
  const rowActions = (row) => (
    <Group gap={4} wrap="nowrap" justify="flex-end" onClick={(event) => event.stopPropagation()}>
      <Menu position="bottom-end" shadow="md" withinPortal>
        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${row.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconFileInvoice size={15} />} onClick={() => setHistoryId(row.invoice_id)}>Open invoice</Menu.Item>
          {Number(row.pending_amount) > 0.009 && <Menu.Item color="green" leftSection={<IconCash size={15} />} onClick={() => setRecording(row)}>Collect balance · {money(row.pending_amount)}</Menu.Item>}
          {!row.is_reversal && row.amount > 0 && !row.fully_reversed && <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setChangingMode({ ...row, collected_by: row.recorded_by })}>Change payment mode</Menu.Item>}
          {canReverse(row) && <Menu.Item color="red" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversingPayment(row)}>Reverse payment</Menu.Item>}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
  // Small grey note under a part-paid invoice: what is still to collect.
  const leftNote = (row) => (!row.is_reversal && Number(row.pending_amount) > 0
    ? <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{money(row.pending_amount)} left</Text>
    : null);

  const chips = [
    rangeLabel && { key: 'range', label: `Collected: ${rangeLabel}`, onRemove: () => update({ range: EMPTY_RANGE }) },
    filters.mrId && { key: 'mr', label: `MR: ${filters.mrId === '0' ? 'No MR' : (mrOptions.find((o) => o.value === filters.mrId)?.label || '—')}`, onRemove: () => update({ mrId: '' }) },
    // Only set when opened from Insights (no picker for these here).
    filters.customerType && { key: 'ctype', label: `Customer type: ${listLabel(filters.customerType)}`, onRemove: () => update({ customerType: '' }) },
    filters.area && { key: 'area', label: `Area: ${filters.area === NO_AREA ? 'Not set' : filters.area}`, onRemove: () => update({ area: '' }) },
    filters.mode && { key: 'mode', label: `Mode: ${filters.mode}`, onRemove: () => update({ mode: '' }) },
    filters.recordedBy && { key: 'by', label: `Recorded ${RECORDED_BY.find((o) => o.value === filters.recordedBy)?.label.toLowerCase()}`, onRemove: () => update({ recordedBy: '' }) },
    filters.entryType && { key: 'type', label: ENTRY_TYPES.find((o) => o.value === filters.entryType)?.label, onRemove: () => update({ entryType: '' }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const exportButton = <ExportMenu loading={exporting} disabled={!count} onExport={exportExcel} />;
  const filterBar = (
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search invoice, customer, MR…" chips={chips} onReset={reset}
      moreAsButton moreActive={[filters.mode, filters.recordedBy, filters.entryType].filter(Boolean).length} more={<>
        <FilterSelect placeholder="All modes" icon={<IconWallet size={16} />} data={[...PAYMENT_MODES, 'Admin adjustment', 'Reversal']} value={filters.mode} onChange={(mode) => update({ mode })} />
        <FilterSelect placeholder="Recorded by" icon={<IconUserShield size={16} />} data={RECORDED_BY} value={filters.recordedBy} onChange={(recordedBy) => update({ recordedBy })} />
        <FilterSelect placeholder="All entries" data={ENTRY_TYPES} value={filters.entryType} onChange={(entryType) => update({ entryType })} />
        <FilterChecks placeholder="All customer types" icon={<IconCategory size={16} />} data={TYPE_GROUPS} value={filters.customerType} onChange={(customerType) => update({ customerType })} />
      </>}>
      <DateRangeFilter label="Collected" value={filters.range} onChange={(range) => update({ range })} months firstDate={firstDate} quick={['today', 'yesterday']} />
      <FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} data={mrOptions} value={filters.mrId} onChange={(mrId) => update({ mrId })} />
    </FilterBar>
  );

  return <Stack gap="md" style={panelSpace}>
    {isMobile ? (
      <>
        <Title order={1}>Collections</Title>
        {filterBar}
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <StatCard size="slim" label={`Net collected${rangeLabel ? ` · ${rangeLabel}` : ''}`} hint="Collections minus reversals" value={money(total)} bg="var(--mantine-color-green-light)" />
          <StatCard size="slim" label="Ledger entries" value={count} />
        </SimpleGrid>
        <Group justify="space-between" gap="xs"><Text fw={700}>{count} {count === 1 ? 'entry' : 'entries'}</Text>{exportButton}</Group>
      </>
    ) : (
      // Laptop: title, its two cards, search and filters stay pinned; rows scroll.
      <StickyFilters atTop>
        <Stack gap="sm">
          <TitleBar title="Collections">
            <MiniStat tone="green" label={`Net collected${rangeLabel ? ` · ${rangeLabel}` : ''}`} value={money(total)} />
            <MiniStat label="Entries" value={count} />
            {exportButton}
          </TitleBar>
          {filterBar}
        </Stack>
      </StickyFilters>
    )}
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && rows.length > 0)}>{loading && !rows.length ? <Group justify="center" p="xl"><Loader /></Group> : !rows.length ? (chips.some(Boolean) ? <EmptyResults search={search} noun="collections" onClear={reset} /> : <Text ta="center" c="dimmed" py="xl">No collections recorded yet.</Text>) : isMobile ? <CardList>{rows.map((row) => (
      <RowCard
        key={row.payment_id}
        onClick={() => setHistoryId(row.invoice_id)}
        title={`${row.invoice_number} · ${row.customer_name || '—'}`}
        subtitle={<CardMeta row={row} />}
        amount={`${row.is_reversal ? '−' : ''}${money(Math.abs(row.amount))}`}
        amountColor={row.is_reversal ? 'orange.8' : undefined}
        highlight={row.is_reversal ? 'orange.0' : undefined}
        badges={<><Badge variant="light" color={row.is_reversal ? 'orange' : 'gray'}>{row.mode || '—'}</Badge><StatusBadge status={row.invoice_status} />{leftNote(row)}<div style={{ marginLeft: 'auto' }}>{rowActions(row)}</div></>}
      />
    ))}</CardList> : <TableScroll minWidth={historyId ? 720 : 940}><Table className="pin-last" striped highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Assigned MR</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th>Invoice status</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{rows.map((row) => <Table.Tr key={row.payment_id} onClick={() => setHistoryId(row.invoice_id)} style={{ cursor: 'pointer' }}  data-selected={historyId === row.invoice_id || undefined}>
      <Table.Td style={{ whiteSpace: 'nowrap' }}>{dayOf(row.payment_date)}<Text size="xs" c="dimmed">{timeOf(row.payment_date)}</Text></Table.Td>
      <Table.Td fw={600}>{row.invoice_number}</Table.Td>
      <Table.Td>{row.customer_name || '—'}</Table.Td>
      <Table.Td>{row.mr_name || <Text span c="dimmed" size="sm">Unassigned</Text>}</Table.Td>
      <Table.Td ta="right" fw={700} c={row.is_reversal ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{row.is_reversal ? '−' : ''}{money(Math.abs(row.amount))}</Table.Td>
      <Table.Td><Badge variant="light" color={row.is_reversal ? 'orange' : 'gray'}>{row.mode || '—'}</Badge>{row.transaction_reference && <Text size="xs" c="dimmed" lineClamp={1} maw={180} title={row.transaction_reference}>{row.transaction_reference}</Text>}</Table.Td>
      <Table.Td><RecordedBy row={row} /></Table.Td>
      <Table.Td><StatusBadge status={row.invoice_status} />{leftNote(row)}</Table.Td>
      <Table.Td>{rowActions(row)}</Table.Td>
    </Table.Tr>)}</Table.Tbody></Table></TableScroll>}
      <ListPagination total={count} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="entries" />
    </Paper>
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={reload} />
    {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
    <MarkUnpaidModal invoice={reversing} onClose={() => setReversing(null)} onSaved={reload} /> */}
    <ReversePaymentModal payment={reversingPayment} onClose={() => setReversingPayment(null)} onSaved={reload} />
    <ChangeModeModal payment={changingMode} onClose={() => setChangingMode(null)} onSaved={reload} />
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={reload} onRecord={setRecording} refreshKey={refresh} />
  </Stack>;
}
