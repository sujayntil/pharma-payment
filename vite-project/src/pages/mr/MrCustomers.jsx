import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconArrowsSort, IconCash, IconCategory, IconHistory } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { customersApi } from '../../api/customersApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import EmptyResults from '../../components/common/EmptyResults';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { TickAllCell, TickCell, TickedBar } from '../../components/collections/InvoiceTicks';
import { useInvoiceTicks } from '../../hooks/useInvoiceTicks';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import CustomerCollectModal from '../../components/collections/CustomerCollectModal';
import { PanelTop } from '../../components/common/BackToTop';
import LedgerShareButton from '../../components/customers/LedgerShareButton';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { STATUS_LABELS } from '../../components/collections/collectionUtils';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import { CustomerContactModal, CustomerContactRow } from '../../components/customers/CustomerContact';
import ContactActions from '../../components/customers/ContactActions';
import { displayPhone, errorText, money, shortDate } from '../../utils/formatters';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { recentCustomers, rememberCustomer } from '../../utils/recentCustomers';
import InvoiceAge from '../../components/collections/InvoiceAge';
import { useAuth } from '../../hooks/useAppStore';
import { saveResume } from '../../utils/resume';
import { useFirstInvoiceDate } from '../../hooks/useFirstInvoiceDate';

const BLANK_LEDGER = { range: EMPTY_RANGE, status: '' };
const CUSTOMER_TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital'];

const SORT_OPTIONS = [
  { value: 'oldest', label: 'Oldest pending first' },
  { value: 'pending', label: 'Most pending first' },
  { value: 'name', label: 'Name A–Z' },
];
const SORT_LABELS = { pending: 'Most pending first', name: 'Name A–Z' };

/** openCustomer: optional { id, name } to open straight into that ledger (from Home). */
export default function MrCustomers({ openCustomer = null }) {
  const firstDate = useFirstInvoiceDate(); // month picker fades months before it
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300); const [page, setPage] = useState(1); const [customerType, setCustomerType] = useState(''); const [sort, setSort] = useState(''); const [recent, setRecent] = useState(recentCustomers);
  const [selected, setSelected] = useState(openCustomer); const [ledger, setLedger] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState(''); const [debouncedLedgerSearch] = useDebouncedValue(ledgerSearch, 300); const [ledgerFilters, setLedgerFilters] = useState(BLANK_LEDGER); const [ledgerPage, setLedgerPage] = useState(1);
  const isMobile = useIsMobile();
  // Back closes the open ledger instead of leaving the screen.
  useBackClose(!!selected, () => setSelected(null));
  const [recording, setRecording] = useState(null); const [editingContact, setEditingContact] = useState(null); const [collectingCustomer, setCollectingCustomer] = useState(null); const [historyId, setHistoryId] = useState(null); const [refresh, setRefresh] = useState(0);
  const ticks = useInvoiceTicks(selected?.id);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getMyCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }), ...(customerType && { customer_type: customerType }), sort: sort || 'oldest' });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [page, debouncedSearch, customerType, sort, refresh, appRefresh]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLedgerLoading(true); setError('');
      try {
        const result = await customersApi.getCustomerLedger(selected.id, { limit: PAGE_SIZE, offset: (ledgerPage - 1) * PAGE_SIZE, ...(debouncedLedgerSearch.trim() && { search: debouncedLedgerSearch.trim() }), ...(ledgerFilters.range.from && { date_from: ledgerFilters.range.from }), ...(ledgerFilters.range.to && { date_to: ledgerFilters.range.to }), ...(ledgerFilters.status && { status: ledgerFilters.status }) });
        if (active) setLedger(result);
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLedgerLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ledgerFilters, ledgerPage, debouncedLedgerSearch, selected, refresh, appRefresh]);

  // Remember the open customer, so the app can reopen on it (see utils/resume).
  const { userId } = useAuth();
  useEffect(() => {
    saveResume(userId, { customer: selected ? { id: selected.id, name: selected.name } : null });
  }, [selected, userId]);

  const onSearch = (value) => { setSearch(value); setPage(1); };
  const onType = (value) => { setCustomerType(value || ''); setPage(1); };
  const onSort = (value) => { setSort(value === 'oldest' ? '' : value || ''); setPage(1); };
  const resetList = () => { setCustomerType(''); setSort(''); setSearch(''); setPage(1); };
  // Opening a customer also puts them first in the "Recent" row.
  const openLedger = (customer) => { rememberCustomer(customer); setRecent(recentCustomers()); setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerFilters(BLANK_LEDGER); setLedgerPage(1); };
  const updateLedger = (patch) => { setLedgerFilters((current) => ({ ...current, ...patch })); setLedgerPage(1); };
  // The ledger's filters (no paging), for the PDF.
  const ledgerPdfParams = { ...(debouncedLedgerSearch.trim() && { search: debouncedLedgerSearch.trim() }), ...(ledgerFilters.range.from && { date_from: ledgerFilters.range.from }), ...(ledgerFilters.range.to && { date_to: ledgerFilters.range.to }), ...(ledgerFilters.status && { status: ledgerFilters.status }) };
  const onLedgerSearch = (value) => { setLedgerSearch(value); setLedgerPage(1); };
  const resetLedger = () => { setLedgerFilters(BLANK_LEDGER); setLedgerSearch(''); setLedgerPage(1); };
  const ledgerRange = describeRange(ledgerFilters.range);
  // Reloads both the ledger and the customer list so outstanding totals update.
  const onCollected = () => { setRefresh((value) => value + 1); ticks.clearSoon(); };
  // Collect is offered per invoice, only while something is pending.
  const recordButton = (invoice, size) => Number(invoice.pending_amount) > 0 && <Button className="collect-button" size={size} leftSection={<IconCash size={size === 'sm' ? 15 : 14} />} onClick={() => setRecording({ ...invoice, customer_name: selected?.name })}>Collect</Button>;
  const ledgerActions = (invoice, size) => <>
    <Tooltip label="Invoice history" withArrow>
      <ActionIcon variant="light" color="gray" size={size === 'sm' ? 'lg' : 'md'} aria-label={`History for ${invoice.invoice_number}`} onClick={() => setHistoryId(invoice.invoice_id)}><IconHistory size={size === 'sm' ? 18 : 16} /></ActionIcon>
    </Tooltip>
    {recordButton(invoice, size)}
  </>;
  const ledgerChips = [
    ledgerFilters.status && { key: 'status', label: `Status: ${STATUS_LABELS[ledgerFilters.status] || ledgerFilters.status}`, onRemove: () => updateLedger({ status: '' }) },
    ledgerRange && { key: 'range', label: `Invoice date: ${ledgerRange}`, onRemove: () => updateLedger({ range: EMPTY_RANGE }) },
    ledgerSearch.trim() && { key: 'q', label: `“${ledgerSearch.trim()}”`, onRemove: () => onLedgerSearch('') },
  ];

  return <Stack gap="md"><Group justify="space-between" align="center"><Title order={1}>My customers</Title><Badge size="lg" variant="light">{total} {total === 1 ? 'customer' : 'customers'}</Badge></Group>
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Customer, phone" chips={[customerType && { key: 'type', label: `Type: ${customerType}`, onRemove: () => onType('') }, sort && { key: 'sort', label: SORT_LABELS[sort], onRemove: () => onSort('') }, search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') }]} onReset={resetList} activeOutline>
      <FilterSelect placeholder="All types" icon={<IconCategory size={16} />} data={CUSTOMER_TYPES} value={customerType} onChange={onType} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORT_OPTIONS} value={sort || 'oldest'} clearable={false} allowDeselect={false} onChange={onSort} />
    </FilterBar>
    {/* Recent: the last few customers opened on this phone, one tap away. */}
    {recent.length > 0 && !search.trim() && (
      <ScrollArea type="never" offsetScrollbars={false}>
        <Group gap={8} wrap="nowrap" pb={2}>
          <Text size="xs" c="dimmed" fw={600} style={{ whiteSpace: 'nowrap' }}>Recent</Text>
          {recent.map((item) => (
            <Button key={item.id} size="compact-sm" variant="default" radius="xl" onClick={() => openLedger(item)} style={{ flexShrink: 0, maxWidth: 200 }}>
              <Text span size="sm" truncate>{item.name}</Text>
            </Button>
          ))}
        </Group>
      </ScrollArea>
    )}
    {error && <Alert color="red">{error}</Alert>}
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && customers.length > 0)}>{loading && !customers.length ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? (search.trim() || customerType ? <EmptyResults search={search} noun="customers" onClear={resetList} /> : <Text c="dimmed" ta="center" py="xl">No customers are assigned to you yet.</Text>) : isMobile ? <CardList>{customers.map((customer) => (
      <RowCard
        key={customer.id}
        onClick={() => openLedger(customer)}
        title={customer.name}
        subtitle={[customer.type, displayPhone(customer.phone), displayPhone(customer.alternate_phone)].filter(Boolean).join(' · ') || undefined}
        amount={money(customer.outstanding)}
        amountLabel="pending"
        amountColor={customer.outstanding ? 'red' : 'green'}
        badges={Number(customer.outstanding) > 0 ? (
          // Pending: info line, then its own action row (fits small phones):
          // call / WhatsApp on the left, Collect on the right.
          <Stack gap={8} w="100%">
            <Text size="sm" c="dimmed">
              <Text span size="sm" fw={600} c="var(--mantine-color-text)">{customer.invoice_count}</Text> {Number(customer.invoice_count) === 1 ? 'invoice' : 'invoices'}
              {/* Pending: how long the oldest unpaid invoice has waited (red once overdue: 40 days, 60 for distributors); settled: last invoice date. */}
              {Number(customer.outstanding) > 0 && customer.oldest_pending_date
                ? <InvoiceAge date={customer.oldest_pending_date} pending={customer.outstanding} customerType={customer.type} size="sm" prefix=" · Oldest " />
                : customer.latest_invoice_date && <> · Last <Text span size="sm" fw={600} c="var(--mantine-color-text)">{shortDate(customer.latest_invoice_date)}</Text></>}
            </Text>
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <ContactActions name={customer.name} phone={customer.phone} alternatePhone={customer.alternate_phone} whatsappOn={customer.whatsapp_on} />
              {/* Every pending invoice, without opening the customer. */}
              <Button size="sm" leftSection={<IconCash size={15} />} onClick={(event) => { event.stopPropagation(); setCollectingCustomer({ id: customer.id, name: customer.name }); }} onKeyDown={(event) => event.stopPropagation()} aria-label={`Collect all from ${customer.name}`} style={{ flexShrink: 0 }}>
                Collect all
              </Button>
            </Group>
          </Stack>
        ) : (
          // Settled: info line, with the call / WhatsApp icons on its right.
          <Group justify="space-between" align="center" wrap="nowrap" gap="xs" w="100%">
            <Text size="sm" c="dimmed">
              <Text span size="sm" fw={600} c="var(--mantine-color-text)">{customer.invoice_count}</Text> {Number(customer.invoice_count) === 1 ? 'invoice' : 'invoices'}
              {/* Pending: how long the oldest unpaid invoice has waited (red once overdue: 40 days, 60 for distributors); settled: last invoice date. */}
              {Number(customer.outstanding) > 0 && customer.oldest_pending_date
                ? <InvoiceAge date={customer.oldest_pending_date} pending={customer.outstanding} customerType={customer.type} size="sm" prefix=" · Oldest " />
                : customer.latest_invoice_date && <> · Last <Text span size="sm" fw={600} c="var(--mantine-color-text)">{shortDate(customer.latest_invoice_date)}</Text></>}
            </Text>
            <ContactActions name={customer.name} phone={customer.phone} alternatePhone={customer.alternate_phone} whatsappOn={customer.whatsapp_on} />
          </Group>
        )}
      />
    ))}</CardList> : <ScrollArea><Table highlightOnHover miw={680} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Invoices</Table.Th><Table.Th ta="right">Total billed</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Last invoice</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id} onClick={() => openLedger(customer)} style={{ cursor: 'pointer' }}><Table.Td fw={600}>{customer.name}<Text size="xs" c="dimmed">{[displayPhone(customer.phone), displayPhone(customer.alternate_phone)].filter(Boolean).join(' · ')}</Text></Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.invoice_count}</Table.Td><Table.Td ta="right">{money(customer.total_invoiced)}</Table.Td><Table.Td ta="right" fw={700} c={customer.outstanding ? 'red' : 'green'}>{money(customer.outstanding)}<InvoiceAge block date={customer.oldest_pending_date} pending={customer.outstanding} customerType={customer.type} prefix="Oldest " /></Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(customer.latest_invoice_date)}</Table.Td><Table.Td><Group gap={8} wrap="nowrap" justify="flex-end"><ContactActions size="sm" fixedWidth name={customer.name} phone={customer.phone} alternatePhone={customer.alternate_phone} whatsappOn={customer.whatsapp_on} />{Number(customer.outstanding) > 0 ? <Button size="xs" leftSection={<IconCash size={14} />} onClick={(event) => { event.stopPropagation(); setCollectingCustomer({ id: customer.id, name: customer.name }); }} aria-label={`Collect all from ${customer.name}`}>Collect all</Button> : <div style={{ width: 104 }} />}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(760px, 100%)" styles={{ title: { flex: 1, minWidth: 0, marginRight: 8 } }} title={<Group gap="xs" wrap="nowrap" align="center" justify="space-between" style={{ flex: 1 }}><Text fw={700} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{selected?.name}</Text>{selected && <LedgerShareButton customerId={selected.id} customerName={ledger?.customer?.name || selected.name} params={ledgerPdfParams} disabled={!ledger || !ledger.invoice_count} />}</Group>}>
      <Stack gap="md">
        {selected && (
          <CustomerContactRow
            name={selected.name}
            phone={ledger?.customer?.phone ?? selected.phone}
            alternatePhone={ledger?.customer?.alternate_phone ?? selected.alternate_phone}
            whatsappOn={ledger?.customer ? ledger.customer.whatsapp_on : selected.whatsapp_on}
            onEdit={() => setEditingContact({ id: selected.id, name: selected.name, phone: ledger?.customer?.phone ?? selected.phone, alternate_phone: ledger?.customer?.alternate_phone ?? selected.alternate_phone, whatsapp_on: ledger?.customer ? ledger.customer.whatsapp_on : selected.whatsapp_on })}
          />
        )}
        {ledger && (isMobile
          ? (
            // Phones: one compact row instead of three stacked boxes.
            <Paper withBorder p="sm" radius="md">
              <SimpleGrid cols={3} spacing="xs">
                {[['Invoiced', ledger.total_invoiced, undefined], ['Collected', ledger.total_paid, 'green'], ['Pending', ledger.outstanding, 'red']].map(([label, value, color]) => (
                  <div key={label} style={{ minWidth: 0, textAlign: 'center', borderLeft: label === 'Invoiced' ? undefined : '1px solid var(--app-line)' }}><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={700} c={color} style={{ overflowWrap: 'anywhere' }}>{money(value)}</Text></div>
                ))}
              </SimpleGrid>
            </Paper>
          )
          : <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs"><StatCard size="md" label="Invoiced" value={money(ledger.total_invoiced)} /><StatCard size="md" label="Collected" color="green" value={money(ledger.total_paid)} /><StatCard size="md" label="Pending" color="red" value={money(ledger.outstanding)} /></SimpleGrid>)}
        <FilterBar compact search={ledgerSearch} onSearch={onLedgerSearch} searchPlaceholder="Search this customer's invoices" chips={ledgerChips} onReset={resetLedger}>
          <StatusTabs value={ledgerFilters.status} onChange={(status) => updateLedger({ status })} />
          <DateRangeFilter label="Invoice date" value={ledgerFilters.range} onChange={(range) => updateLedger({ range })} months firstDate={firstDate} quick={[]} />
        </FilterBar>
        {!ledger ? <Group justify="center" p="xl"><Loader /></Group> : <div {...reloadingStyle(ledgerLoading)}>{!ledger.invoices.length ? <EmptyResults search={ledgerSearch} noun="invoices" onClear={resetLedger} /> : <>{isMobile ? <CardList>{ledger.invoices.map((invoice) => (
          <InvoiceCard key={invoice.invoice_id} invoice={invoice} customerType={ledger?.customer?.type ?? selected?.type} showCustomer={false} onOpen={() => setHistoryId(invoice.invoice_id)} actions={recordButton(invoice, 'sm') || undefined} onSelect={ticks.toggle} selected={ticks.isTicked(invoice)} selecting={ticks.count > 0} />
        ))}</CardList> : <ScrollArea><Table miw={820} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th w={36}>{ledger && <TickAllCell ticks={ticks} invoices={ledger.invoices} />}</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id} onClick={() => setHistoryId(invoice.invoice_id)} style={{ cursor: 'pointer' }}><Table.Td onClick={(event) => event.stopPropagation()}><TickCell ticks={ticks} invoice={invoice} /></Table.Td><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.date)}</Table.Td><Table.Td ta="right">{money(invoice.amount)}</Table.Td><Table.Td ta="right" c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td><Table.Td><StatusCell row={invoice} /></Table.Td><Table.Td maw={180}><RecordedBy row={invoice} /></Table.Td><Table.Td onClick={(event) => event.stopPropagation()}><Group gap={4} wrap="nowrap" justify="flex-end">{ledgerActions(invoice, 'xs')}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}<ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(debouncedLedgerSearch.trim())} label="invoices" /></>}</div>}
        <TickedBar ticks={ticks} invoices={ledger?.invoices} onCollect={() => setCollectingCustomer({ id: selected.id, name: selected.name, invoiceIds: ticks.ids() })} />
      </Stack>
      {/* Long ledger: ↑ back to the totals and filters. */}
      <PanelTop hidden={ticks.count > 0} />
    </Drawer>
    <CustomerCollectModal customer={collectingCustomer} onClose={() => setCollectingCustomer(null)} onSaved={onCollected} />
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={onCollected} />
    {/* Saving reloads the ledger and the list so the new numbers show everywhere. */}
    <CustomerContactModal customer={editingContact} onClose={() => setEditingContact(null)} onSaved={(saved) => { setSelected((current) => (current && current.id === saved.id ? { ...current, ...saved } : current)); onCollected(); }} />
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onRecord={(invoice) => setRecording({ ...invoice, customer_name: invoice.customer_name || selected?.name })} refreshKey={refresh} />
  </Stack>;
}
