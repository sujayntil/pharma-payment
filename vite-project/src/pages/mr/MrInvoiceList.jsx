import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionIcon, Alert, Button, Group, Loader, Paper, SegmentedControl, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowsSort, IconCash, IconCategory, IconCircleCheck, IconHistory } from '@tabler/icons-react';
import { mrApi } from '../../api/mrApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import EmptyResults from '../../components/common/EmptyResults';
import { CardList } from '../../components/common/RowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSidePanelSpace } from '../../hooks/useSidePanelSpace';
import FilterBar, { FilterChecks, FilterSelect } from '../../components/filters/FilterBar';
import { TYPE_GROUPS, listLabel } from '../../utils/customerTypes';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import InvoiceCard from '../../components/collections/InvoiceCard';
import CustomerCollectModal from '../../components/collections/CustomerCollectModal';
import MultiCollectModal from '../../components/collections/MultiCollectModal';
import { TickAllCell, TickCell, TickedBar } from '../../components/collections/InvoiceTicks';
import { groupByCustomer, useInvoiceTicks } from '../../hooks/useInvoiceTicks';
import ContactActions from '../../components/customers/ContactActions';
import InvoiceAge from '../../components/collections/InvoiceAge';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { errorText, money, shortDate } from '../../utils/formatters';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useFirstInvoiceDate } from '../../hooks/useFirstInvoiceDate';
import TableScroll from '../../components/common/TableScroll';

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

/** Collect is offered only while there is something to collect. */
/** Call / WhatsApp icons for the invoice's customer. */
const contactFor = (item, size) => <ContactActions size={size} fixedWidth={size === 'sm'} name={item.customer || 'customer'} phone={item.customer_phone} alternatePhone={item.customer_alternate_phone} whatsappOn={item.customer_whatsapp_on} />;

const canRecord = (item) => Number(item.pending_amount) > 0 && (item.status === 'UNPAID' || item.status === 'PARTIAL');

export default function MrInvoiceList({ initialTab = 'pending' }) {
  const firstDate = useFirstInvoiceDate(); // month picker fades months before it
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(initialTab);
  const [only, setOnly] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [range, setRange] = useState(EMPTY_RANGE);
  // Pending is worked oldest first; Paid and All read newest first. A sort the
  // MR picks in Filters overrides this until Reset.
  const [sortChoice, setSortChoice] = useState(null);
  const defaultSort = tab === 'pending' ? 'oldest' : 'newest';
  const sort = sortChoice || defaultSort;
  const setSort = (next) => setSortChoice(next && next !== defaultSort ? next : null);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState({ items: [], total_count: 0, filtered_outstanding: 0 });
  const [counts, setCounts] = useState({ pending: null, paid: null, all: null });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null); const [historyKey, setHistoryKey] = useState(0);
  // A bell entry or phone alert links here as ?invoice=12: swap it for a clean
  // address (so Back closes the panel and a reload doesn't reopen it), then open that invoice.
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const linkedParam = Number(params.get('invoice')) || null;
  useEffect(() => {
    if (linkedParam) navigate(location.pathname, { replace: true, state: { openInvoice: linkedParam, linkId: Date.now() } });
  }, [linkedParam, location.pathname, navigate]);
  const wanted = location.state?.openInvoice;
  const linkId = location.state?.linkId;
  const [handledLink, setHandledLink] = useState(null);
  if (wanted && linkId !== handledLink) {
    setHandledLink(linkId);
    setOpenId(wanted);
  }
  const [recording, setRecording] = useState(null);
  // Ticks stay while searching / filtering, so several customers can be collected together.
  const ticks = useInvoiceTicks('invoices');
  const [collectingOne, setCollectingOne] = useState(null);
  const [collectingMany, setCollectingMany] = useState(null);
  const panelSpace = useSidePanelSpace(Boolean(openId));
  // Laptop: while the invoice panel is open the table drops Bill, Collected
  // and Recorded by (all shown in the panel) so nothing scrolls sideways.
  const panelOpen = Boolean(openId) && !isMobile;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await mrApi.getOutstanding({
          ...tabParams(tab, only),
          ...(customerType && { customer_type: customerType }),
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
  }, [tab, only, customerType, range, sort, page, debouncedSearch, reload, appRefresh]);

  // Tab counts (unfiltered), refreshed after every collection.
  useEffect(() => {
    let active = true;
    Promise.all(TABS.map((t) => mrApi.getOutstanding({ ...tabParams(t.value, ''), limit: 1, offset: 0 })))
      .then((results) => { if (active) setCounts({ pending: results[0].total_count, paid: results[1].total_count, all: results[2].total_count }); })
      .catch(() => { /* counts are a convenience; the list shows its own errors */ });
    return () => { active = false; };
  }, [reload, appRefresh]);

  const changeTab = (next) => {
    setTab(next);
    if (!ONLY_OPTIONS[next].some((o) => o.value === only)) setOnly('');
    setPage(1);
  };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setOnly(''); setCustomerType(''); setRange(EMPTY_RANGE); setSortChoice(null); setSearch(''); setPage(1); };
  const onSaved = useCallback(() => { setReload((v) => v + 1); setHistoryKey((v) => v + 1); }, []);
  const clearTicksSoon = ticks.clearSoon;
  const onTickedSaved = useCallback(() => { onSaved(); clearTicksSoon(); }, [onSaved, clearTicksSoon]);
  // One customer: the usual Collect sheet. Several: one row per customer.
  const collectTicked = () => {
    const list = groupByCustomer(ticks.invoices());
    if (list.length === 1) setCollectingOne({ id: list[0].customerId, name: list[0].customer, invoiceIds: list[0].invoices.map((item) => item.invoice_id) });
    else setCollectingMany(list);
  };

  const rangeLabel = describeRange(range);
  const onlyOptions = ONLY_OPTIONS[tab];
  const chips = [
    only && { key: 'only', label: `Show only: ${onlyOptions.find((o) => o.value === only)?.label}`, onRemove: () => { setOnly(''); setPage(1); } },
    customerType && { key: 'type', label: `Customer type: ${listLabel(customerType)}`, onRemove: () => { setCustomerType(''); setPage(1); } },
    rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => { setRange(EMPTY_RANGE); setPage(1); } },
    sortChoice && { key: 'sort', label: SORTS.find((s) => s.value === sort)?.label, onRemove: () => { setSortChoice(null); setPage(1); } },
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
    <Title order={1}>Invoices</Title>
    <SegmentedControl fullWidth={isMobile} style={isMobile ? undefined : { alignSelf: 'flex-start' }} data={tabData} value={tab} onChange={changeTab} aria-label="Invoice status" />
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Invoice, customer" chips={chips} onReset={reset} activeOutline>
      {onlyOptions.length > 0 && (
        <FilterSelect placeholder={ONLY_PLACEHOLDER[tab]} icon={<IconCircleCheck size={16} />} data={onlyOptions} value={only} onChange={(next) => { setOnly(next); setPage(1); }} />
      )}
      <FilterChecks placeholder="All customer types" icon={<IconCategory size={16} />} data={TYPE_GROUPS} value={customerType} onChange={(next) => { setCustomerType(next || ''); setPage(1); }} />
      <DateRangeFilter label="Invoice date" value={range} onChange={(next) => { setRange(next); setPage(1); }} months firstDate={firstDate} quick={['today', 'yesterday']} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORTS} value={sort} clearable={false} allowDeselect={false} onChange={(next) => { setSort(next || defaultSort); setPage(1); }} />
    </FilterBar>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    <Group justify="space-between" gap="xs">
      <Text fw={700}>{data.total_count} {data.total_count === 1 ? 'invoice' : 'invoices'}</Text>
      <Text size="sm" c="dimmed">{money(data.filtered_outstanding)} pending</Text>
    </Group>
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && items.length > 0)}>
      {loading && !items.length ? <Group justify="center" p="xl"><Loader /></Group>
        : !items.length ? (filtered ? <EmptyResults search={search} noun="invoices" onClear={reset} /> : <Text c="dimmed" ta="center" py="xl">{tab === 'pending' ? 'Nothing pending. All your invoices are settled.' : 'No invoices here yet.'}</Text>)
          : isMobile ? <CardList>{items.map((item) => <InvoiceCard
              key={item.invoice_id}
              invoice={item}
              onOpen={() => setOpenId(item.invoice_id)}
              // Pending: icons share the bottom row with Collect. Settled: no
              // Collect, so the icons sit beside the status badge instead.
              actions={canRecord(item) ? <>{contactFor(item)}<Button className="collect-button" size="sm" leftSection={<IconCash size={15} />} onClick={() => setRecording(item)}>Collect</Button></> : undefined}
              afterStatus={canRecord(item) ? undefined : contactFor(item)}
              onSelect={ticks.toggle}
              selected={ticks.isTicked(item)}
              selecting={ticks.count > 0}
            />)}</CardList>
            : <TableScroll minWidth={panelOpen ? 640 : 1000}><Table className="pin-last" striped highlightOnHover verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th w={36}><TickAllCell ticks={ticks} invoices={items} /></Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th>{!panelOpen && <><Table.Th ta="right">Bill</Table.Th><Table.Th ta="right">Collected</Table.Th></>}<Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th>{!panelOpen && <Table.Th>Recorded by</Table.Th>}<Table.Th /></Table.Tr></Table.Thead>
              <Table.Tbody>{items.map((item) => <Table.Tr key={item.invoice_id} onClick={() => setOpenId(item.invoice_id)} style={{ cursor: 'pointer' }}  data-selected={openId === item.invoice_id || undefined}>
                <Table.Td onClick={(e) => e.stopPropagation()}><TickCell ticks={ticks} invoice={item} /></Table.Td>
                <Table.Td fw={600}>{item.invoice_number}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(item.invoice_date)}<InvoiceAge date={item.invoice_date} pending={item.pending_amount} customerType={item.customer_type} prefix="" size="xs" block /></Table.Td>
                <Table.Td>{item.customer || '—'}</Table.Td>
                {!panelOpen && <><Table.Td ta="right">{money(item.total_amount)}</Table.Td>
                <Table.Td ta="right">{money(item.paid_amount)}</Table.Td></>}
                <Table.Td ta="right" fw={700} c={Number(item.pending_amount) > 0 ? 'red' : 'green'}>{money(item.pending_amount)}</Table.Td>
                <Table.Td><StatusCell row={item} /></Table.Td>
                {!panelOpen && <Table.Td maw={200}><RecordedBy row={item} /></Table.Td>}
                <Table.Td><Group gap={6} wrap="nowrap" justify="flex-end">
                  {contactFor(item, 'sm')}
                  {canRecord(item) && <Button size="xs" leftSection={<IconCash size={14} />} onClick={(e) => { e.stopPropagation(); setRecording(item); }}>Collect</Button>}
                  {historyIcon(item)}
                </Group></Table.Td>
              </Table.Tr>)}</Table.Tbody>
            </Table></TableScroll>}
      <ListPagination total={data.total_count} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="invoices" />
    </Paper>
    <TickedBar ticks={ticks} invoices={items} onCollect={collectTicked} bottom={isMobile ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : 8} />
    <InvoiceHistory invoiceId={openId} onClose={() => setOpenId(null)} onRecord={(invoice) => setRecording(invoice)} refreshKey={historyKey} />
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={onSaved} />
    <CustomerCollectModal customer={collectingOne} onClose={() => setCollectingOne(null)} onSaved={onTickedSaved} />
    <MultiCollectModal groups={collectingMany} onClose={() => setCollectingMany(null)} onSaved={onTickedSaved} />
  </Stack>;
}
