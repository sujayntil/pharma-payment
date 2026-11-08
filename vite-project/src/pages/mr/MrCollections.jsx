import { useEffect, useState } from 'react';
import { ActionIcon, Button, Group, Loader, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowsSort, IconCash, IconCircleCheck, IconHistory } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchMrOutstanding, setSearchQuery } from '../../store/slices/mrSlice';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { money, shortDate } from '../../utils/formatters';

const SORTS = [{ value: 'newest', label: 'Newest invoice first' }, { value: 'oldest', label: 'Oldest invoice first' }, { value: 'amount', label: 'Highest pending first' }];
const STATUSES = [{ value: 'UNPAID', label: 'Pending' }, { value: 'PARTIAL', label: 'Partially paid' }, { value: 'PAID', label: 'Paid' }, { value: 'REVERSED', label: 'Reversed' }];

// My Collections lists ALL invoices of the MR's customers (include_settled);
// every filter, the sort, paging and the summary are applied by the server.
const outstandingParams = (page, search, range, sort, status) => ({
  include_settled: true,
  limit: PAGE_SIZE,
  offset: (page - 1) * PAGE_SIZE,
  sort_order: sort,
  ...(search.trim() && { search: search.trim() }),
  ...(range.from && { date_from: range.from }),
  ...(range.to && { date_to: range.to }),
  ...(status && { status }),
});

/** Record collection is offered only while there is something to collect. */
const canRecord = (item) => Number(item.pending_amount) > 0 && (item.status === 'UNPAID' || item.status === 'PARTIAL');

export default function MrCollections() {
  return <Stack gap="md">
    <div><Title order={1}>Collections</Title><Text c="dimmed">All invoices of your customers. Record a payment on pending or partially paid ones.</Text></div>
    <ToCollect />
  </Stack>;
}

function ToCollect() {
  const dispatch = useAppDispatch();
  const { outstanding, outstandingCount, filteredOutstanding, loading, searchQuery } = useAppSelector((state) => state.mr);
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [page, setPage] = useState(1); const [range, setRange] = useState(EMPTY_RANGE); const [sort, setSort] = useState('newest'); const [status, setStatus] = useState('');
  const [active, setActive] = useState(null); const [historyId, setHistoryId] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    dispatch(fetchMrOutstanding(outstandingParams(page, debouncedSearch, range, sort, status)));
  }, [debouncedSearch, dispatch, page, range, sort, status]);

  const onSearch = (value) => { dispatch(setSearchQuery(value)); setPage(1); };
  const reset = () => { setRange(EMPTY_RANGE); setSort('newest'); setStatus(''); onSearch(''); };
  // Settled invoices stay in the list now, so a plain reload keeps the page.
  const onSaved = () => dispatch(fetchMrOutstanding(outstandingParams(page, debouncedSearch, range, sort, status)));
  const rangeLabel = describeRange(range);
  const chips = [
    status && { key: 'status', label: `Status: ${STATUSES.find((s) => s.value === status)?.label}`, onRemove: () => { setStatus(''); setPage(1); } },
    rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => { setRange(EMPTY_RANGE); setPage(1); } },
    searchQuery.trim() && { key: 'q', label: `“${searchQuery.trim()}”`, onRemove: () => onSearch('') },
  ];
  const filtered = Boolean(searchQuery.trim() || rangeLabel || status);

  const historyIcon = (item) => (
    <Tooltip label="Invoice history" withArrow>
      <ActionIcon variant="light" color="gray" size="lg" aria-label={`History for ${item.invoice_number}`} onClick={() => setHistoryId(item.invoice_id)}><IconHistory size={18} /></ActionIcon>
    </Tooltip>
  );

  return <Stack gap="md">
    <Paper withBorder p="md" bg="green.0"><Text size="sm" c="dimmed">{filtered ? 'Outstanding in these results' : 'Outstanding across your invoices'}</Text><Title order={2}>{money(filteredOutstanding)}</Title></Paper>
    <FilterBar search={searchQuery} onSearch={onSearch} searchPlaceholder="Search invoice or customer" chips={chips} onReset={reset}>
      <FilterSelect placeholder="All statuses" icon={<IconCircleCheck size={16} />} data={STATUSES} value={status} onChange={(next) => { setStatus(next); setPage(1); }} />
      <DateRangeFilter label="Invoice date" value={range} onChange={(next) => { setRange(next); setPage(1); }} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORTS} value={sort} clearable={false} allowDeselect={false} onChange={(next) => { setSort(next || 'newest'); setPage(1); }} />
    </FilterBar>
    <Paper {...listPaperProps(isMobile)}>
      {loading ? <Group justify="center" p="xl"><Loader /></Group> : !outstanding.length ? <Text c="dimmed" ta="center" py="xl">{filtered ? 'No invoices match these filters.' : outstandingCount ? 'No invoices on this page.' : 'No invoices assigned to you yet.'}</Text> : isMobile ? <CardList>{outstanding.map((item) => (
        <RowCard
          key={item.invoice_id}
          title={item.customer || 'Unnamed customer'}
          subtitle={`${item.invoice_number} · ${shortDate(item.invoice_date)}`}
          amount={money(item.pending_amount)}
          amountLabel="pending"
          amountColor={Number(item.pending_amount) > 0 ? 'red' : 'green'}
          badges={<StatusCell row={item} />}
          details={[{ label: 'Recorded by', value: <RecordedBy row={item} />, full: true }]}
          actions={<>{historyIcon(item)}{canRecord(item) && <Button size="sm" leftSection={<IconCash size={15} />} onClick={() => setActive(item)}>Record collection</Button>}</>}
        />
      ))}</CardList> : <Table.ScrollContainer minWidth={900}><Table striped highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{outstanding.map((item) => <Table.Tr key={item.invoice_id}>
        <Table.Td fw={600}>{item.customer || 'Unnamed customer'}</Table.Td><Table.Td>{item.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(item.invoice_date)}</Table.Td><Table.Td ta="right" fw={700} c={Number(item.pending_amount) > 0 ? 'red' : 'green'}>{money(item.pending_amount)}</Table.Td>
        <Table.Td><StatusCell row={item} /></Table.Td>
        <Table.Td maw={200}><RecordedBy row={item} /></Table.Td>
        <Table.Td><Group gap={6} wrap="nowrap" justify="flex-end">{canRecord(item) && <Button size="xs" onClick={() => setActive(item)}>Record collection</Button>}{historyIcon(item)}</Group></Table.Td>
      </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={outstandingCount} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="invoices" />
    </Paper>
    <RecordCollectionModal invoice={active} onClose={() => setActive(null)} onSaved={onSaved} />
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} />
  </Stack>;
}
