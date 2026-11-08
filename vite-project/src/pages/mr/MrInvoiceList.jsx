import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Loader, Paper, SegmentedControl, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowsSort, IconCash, IconCircleCheck, IconHistory } from '@tabler/icons-react';
import { mrApi } from '../../api/mrApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSidePanelSpace } from '../../hooks/useSidePanelSpace';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { errorText, money, shortDate } from '../../utils/formatters';

/*
 * MR "Invoices": one screen for what used to be "My Invoices" and "My
 * Collections". All invoices of the MR's customers, split by quick tabs.
 * Everything is filtered, sorted and paged by the server (GET /mr/outstanding):
 *   Pending -> invoices with a balance (the endpoint's default)
 *   Paid    -> include_settled + status=PAID
 *   All     -> include_settled
 * "Show only" narrows the tab further and is labelled after the tab, so the
 * filter sheet never looks like "all" is picked while you are on Pending.
 */
const TABS = [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }];
const ONLY_OPTIONS = {
  pending: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIAL', label: 'Part paid' }, { value: 'REVERSED', label: 'Reversed' }],
  paid: [],
  all: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIAL', label: 'Part paid' }, { value: 'PAID', label: 'Paid' }, { value: 'REVERSED', label: 'Reversed' }],
};
const ONLY_PLACEHOLDER = { pending: 'All pending', paid: 'All paid', all: 'All invoices' };
const SORTS = [{ value: 'newest', label: 'Newest invoice first' }, { value: 'oldest', label: 'Oldest invoice first' }, { value: 'amount', label: 'Highest pending first' }];

function tabParams(tab, only) {
  if (tab === 'paid') return { include_settled: true, status: 'PAID' };
  if (tab === 'all') return { include_settled: true, ...(only && { status: only }) };
  return only ? { status: only } : {};
}

/** Record collection is offered only while there is something to collect. */
const canRecord = (item) => Number(item.pending_amount) > 0 && (item.status === 'UNPAID' || item.status === 'PARTIAL');

export default function MrInvoiceList({ initialTab = 'pending' }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(initialTab);
  const [only, setOnly] = useState('');
  const [range, setRange] = useState(EMPTY_RANGE);
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState({ items: [], total_count: 0, filtered_outstanding: 0 });
  const [counts, setCounts] = useState({ pending: null, paid: null, all: null });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null); const [historyKey, setHistoryKey] = useState(0);
  const [recording, setRecording] = useState(null);
  const panelSpace = useSidePanelSpace(Boolean(openId));

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await mrApi.getOutstanding({
          ...tabParams(tab, only),
          sort_order: sort,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(range.from && { date_from: range.from }),
          ...(range.to && { date_to: range.to }),
        });
        if (active) setData(result);
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, only, range, sort, page, debouncedSearch, reload]);

  // Tab counts (unfiltered), refreshed after every collection.
  useEffect(() => {
    let active = true;
    Promise.all(TABS.map((t) => mrApi.getOutstanding({ ...tabParams(t.value, ''), limit: 1, offset: 0 })))
      .then((results) => { if (active) setCounts({ pending: results[0].total_count, paid: results[1].total_count, all: results[2].total_count }); })
      .catch(() => { /* counts are a convenience; the list shows its own errors */ });
    return () => { active = false; };
  }, [reload]);

  const changeTab = (next) => {
    setTab(next);
    if (!ONLY_OPTIONS[next].some((o) => o.value === only)) setOnly('');
    setPage(1);
  };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setOnly(''); setRange(EMPTY_RANGE); setSort('newest'); setSearch(''); setPage(1); };
  const onSaved = useCallback(() => { setReload((v) => v + 1); setHistoryKey((v) => v + 1); }, []);

  const rangeLabel = describeRange(range);
  const onlyOptions = ONLY_OPTIONS[tab];
  const chips = [
    only && { key: 'only', label: `Show only: ${onlyOptions.find((o) => o.value === only)?.label}`, onRemove: () => { setOnly(''); setPage(1); } },
    rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => { setRange(EMPTY_RANGE); setPage(1); } },
    sort !== 'newest' && { key: 'sort', label: SORTS.find((s) => s.value === sort)?.label, onRemove: () => { setSort('newest'); setPage(1); } },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];
  const filtered = chips.some(Boolean);
  const items = data.items || [];
  const tabData = TABS.map((t) => ({ value: t.value, label: counts[t.value] == null ? t.label : `${t.label} ${counts[t.value]}` }));

  const historyIcon = (item) => (
    <Tooltip label="Invoice details" withArrow>
      <ActionIcon variant="light" color="gray" aria-label={`Open invoice ${item.invoice_number}`} onClick={(e) => { e.stopPropagation(); setOpenId(item.invoice_id); }}><IconHistory size={16} /></ActionIcon>
    </Tooltip>
  );

  return <Stack gap="md" style={panelSpace}>
    <div><Title order={1}>Invoices</Title><Text c="dimmed">All invoices of your customers. Open one to record a payment or see its history.</Text></div>
    <SegmentedControl fullWidth={isMobile} style={isMobile ? undefined : { alignSelf: 'flex-start' }} data={tabData} value={tab} onChange={changeTab} aria-label="Invoice status" />
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search invoice or customer" chips={chips} onReset={reset}>
      {onlyOptions.length > 0 && (
        <FilterSelect placeholder={ONLY_PLACEHOLDER[tab]} icon={<IconCircleCheck size={16} />} data={onlyOptions} value={only} onChange={(next) => { setOnly(next); setPage(1); }} />
      )}
      <DateRangeFilter label="Invoice date" value={range} onChange={(next) => { setRange(next); setPage(1); }} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORTS} value={sort} clearable={false} allowDeselect={false} onChange={(next) => { setSort(next || 'newest'); setPage(1); }} />
    </FilterBar>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    <Group justify="space-between" gap="xs">
      <Text fw={700}>{data.total_count} {data.total_count === 1 ? 'invoice' : 'invoices'}</Text>
      <Text size="sm" c="dimmed">{money(data.filtered_outstanding)} pending</Text>
    </Group>
    <Paper {...listPaperProps(isMobile)}>
      {loading ? <Group justify="center" p="xl"><Loader /></Group>
        : !items.length ? <Text c="dimmed" ta="center" py="xl">{filtered ? 'No invoices match these filters.' : tab === 'pending' ? 'Nothing pending. All your invoices are settled.' : 'No invoices here yet.'}</Text>
          : isMobile ? <CardList>{items.map((item) => <InvoiceCard key={item.invoice_id} invoice={item} onOpen={() => setOpenId(item.invoice_id)} />)}</CardList>
            : <Table.ScrollContainer minWidth={1000}><Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th ta="right">Bill</Table.Th><Table.Th ta="right">Collected</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>{items.map((item) => <Table.Tr key={item.invoice_id} onClick={() => setOpenId(item.invoice_id)} style={{ cursor: 'pointer' }} bg={openId === item.invoice_id ? 'green.0' : undefined}>
                <Table.Td fw={600}>{item.invoice_number}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(item.invoice_date)}</Table.Td>
                <Table.Td>{item.customer || '—'}</Table.Td>
                <Table.Td ta="right">{money(item.total_amount)}</Table.Td>
                <Table.Td ta="right">{money(item.paid_amount)}</Table.Td>
                <Table.Td ta="right" fw={700} c={Number(item.pending_amount) > 0 ? 'red' : 'green'}>{money(item.pending_amount)}</Table.Td>
                <Table.Td><StatusCell row={item} /></Table.Td>
                <Table.Td maw={200}><RecordedBy row={item} /></Table.Td>
                <Table.Td><Group gap={6} wrap="nowrap" justify="flex-end">
                  {canRecord(item) && <Button size="xs" leftSection={<IconCash size={14} />} onClick={(e) => { e.stopPropagation(); setRecording(item); }}>Record</Button>}
                  {historyIcon(item)}
                </Group></Table.Td>
              </Table.Tr>)}</Table.Tbody>
            </Table></Table.ScrollContainer>}
      <ListPagination total={data.total_count} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="invoices" />
    </Paper>
    <InvoiceHistory invoiceId={openId} onClose={() => setOpenId(null)} onRecord={(invoice) => setRecording(invoice)} refreshKey={historyKey} />
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={onSaved} />
  </Stack>;
}
