import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconCash, IconHistory } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { customersApi } from '../../api/customersApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import FilterBar from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { STATUS_LABELS } from '../../components/collections/collectionUtils';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import { errorText, money, shortDate } from '../../utils/formatters';

const BLANK_LEDGER = { range: EMPTY_RANGE, status: '' };

/** openCustomer: optional { id, name } to open straight into that ledger (from Home). */
export default function MrCustomers({ openCustomer = null }) {
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(openCustomer); const [ledger, setLedger] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState(''); const [debouncedLedgerSearch] = useDebouncedValue(ledgerSearch, 300); const [ledgerFilters, setLedgerFilters] = useState(BLANK_LEDGER); const [ledgerPage, setLedgerPage] = useState(1);
  const isMobile = useIsMobile();
  // Back closes the open ledger instead of leaving the screen.
  useBackClose(!!selected, () => setSelected(null));
  const [recording, setRecording] = useState(null); const [recordingCustomer, setRecordingCustomer] = useState(null); const [historyId, setHistoryId] = useState(null); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getMyCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }) });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [page, debouncedSearch, refresh]);

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
  }, [ledgerFilters, ledgerPage, debouncedLedgerSearch, selected, refresh]);

  const onSearch = (value) => { setSearch(value); setPage(1); };
  const openLedger = (customer) => { setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerFilters(BLANK_LEDGER); setLedgerPage(1); };
  const updateLedger = (patch) => { setLedgerFilters((current) => ({ ...current, ...patch })); setLedgerPage(1); };
  const onLedgerSearch = (value) => { setLedgerSearch(value); setLedgerPage(1); };
  const resetLedger = () => { setLedgerFilters(BLANK_LEDGER); setLedgerSearch(''); setLedgerPage(1); };
  const ledgerRange = describeRange(ledgerFilters.range);
  // Reloads both the ledger and the customer list so outstanding totals update.
  const onCollected = () => setRefresh((value) => value + 1);
  const ledgerActions = (invoice, size) => <>
    <Tooltip label="Invoice history" withArrow>
      <ActionIcon variant="light" color="gray" size={size === 'sm' ? 'lg' : 'md'} aria-label={`History for ${invoice.invoice_number}`} onClick={() => setHistoryId(invoice.invoice_id)}><IconHistory size={size === 'sm' ? 18 : 16} /></ActionIcon>
    </Tooltip>
    {Number(invoice.pending_amount) > 0 && <Button size={size} leftSection={<IconCash size={size === 'sm' ? 15 : 14} />} onClick={() => setRecording({ ...invoice, customer_name: selected?.name })}>Record collection</Button>}
  </>;
  const ledgerChips = [
    ledgerFilters.status && { key: 'status', label: `Status: ${STATUS_LABELS[ledgerFilters.status] || ledgerFilters.status}`, onRemove: () => updateLedger({ status: '' }) },
    ledgerRange && { key: 'range', label: `Invoice date: ${ledgerRange}`, onRemove: () => updateLedger({ range: EMPTY_RANGE }) },
    ledgerSearch.trim() && { key: 'q', label: `“${ledgerSearch.trim()}”`, onRemove: () => onLedgerSearch('') },
  ];

  return <Stack gap="md"><Group justify="space-between" align="end"><div><Title order={1}>My customers</Title><Text c="dimmed">Customers assigned to you, with invoice and pending totals. Open a customer to see their ledger.</Text></div><Badge size="lg" variant="light">{total} customers</Badge></Group>
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search customer, type or phone" chips={[search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') }]} />
    {error && <Alert color="red">{error}</Alert>}
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && customers.length > 0)}>{loading && !customers.length ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? <Text c="dimmed" ta="center" py="xl">{search ? 'No customers match your search.' : 'No customers are assigned to you yet.'}</Text> : isMobile ? <CardList>{customers.map((customer) => (
      <RowCard
        key={customer.id}
        onClick={() => openLedger(customer)}
        title={customer.name}
        subtitle={[customer.type, customer.phone].filter(Boolean).join(' · ') || undefined}
        amount={money(customer.outstanding)}
        amountLabel="outstanding"
        amountColor={customer.outstanding ? 'red' : 'green'}
        details={[{ label: 'Invoices', value: customer.invoice_count }, { label: 'Last invoice', value: shortDate(customer.latest_invoice_date) }]}
      />
    ))}</CardList> : <ScrollArea><Table highlightOnHover miw={680} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Invoices</Table.Th><Table.Th ta="right">Total billed</Table.Th><Table.Th ta="right">Outstanding</Table.Th><Table.Th>Last invoice</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id} onClick={() => openLedger(customer)} style={{ cursor: 'pointer' }}><Table.Td fw={600}>{customer.name}<Text size="xs" c="dimmed">{customer.phone || ''}</Text></Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.invoice_count}</Table.Td><Table.Td ta="right">{money(customer.total_invoiced)}</Table.Td><Table.Td ta="right" fw={700} c={customer.outstanding ? 'red' : 'green'}>{money(customer.outstanding)}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(customer.latest_invoice_date)}</Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(760px, 100%)" title={<Text fw={700}>{selected?.name}</Text>}>
      <Stack gap="md">
        {ledger && (isMobile
          ? (
            // Phones: one compact row instead of three stacked boxes.
            <Paper withBorder p="sm" radius="md">
              <SimpleGrid cols={3} spacing="xs">
                {[['Invoiced', ledger.total_invoiced, undefined], ['Collected', ledger.total_paid, 'green'], ['Outstanding', ledger.outstanding, 'red']].map(([label, value, color]) => (
                  <div key={label} style={{ minWidth: 0 }}><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={700} c={color} style={{ overflowWrap: 'anywhere' }}>{money(value)}</Text></div>
                ))}
              </SimpleGrid>
            </Paper>
          )
          : <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs"><StatCard size="md" label="Invoiced" value={money(ledger.total_invoiced)} /><StatCard size="md" label="Collected" color="green" value={money(ledger.total_paid)} /><StatCard size="md" label="Outstanding" color="red" value={money(ledger.outstanding)} /></SimpleGrid>)}
        {/* Same form, validation, API and permissions as My Collections, with this customer pre-selected. */}
        <Button leftSection={<IconCash size={16} />} fullWidth={isMobile} style={{ alignSelf: isMobile ? 'stretch' : 'flex-start' }} onClick={() => setRecordingCustomer({ id: selected.id, name: selected.name })}>Record collection</Button>
        <FilterBar compact search={ledgerSearch} onSearch={onLedgerSearch} searchPlaceholder="Search this customer's invoices" chips={ledgerChips} onReset={resetLedger}>
          <StatusTabs value={ledgerFilters.status} onChange={(status) => updateLedger({ status })} />
          <DateRangeFilter label="Invoice date" value={ledgerFilters.range} onChange={(range) => updateLedger({ range })} />
        </FilterBar>
        {!ledger ? <Group justify="center" p="xl"><Loader /></Group> : <div {...reloadingStyle(ledgerLoading)}>{!ledger.invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <>{isMobile ? <CardList>{ledger.invoices.map((invoice) => (
          <InvoiceCard key={invoice.invoice_id} invoice={invoice} showCustomer={false} onOpen={() => setHistoryId(invoice.invoice_id)} />
        ))}</CardList> : <ScrollArea><Table miw={820} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id} onClick={() => setHistoryId(invoice.invoice_id)} style={{ cursor: 'pointer' }}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.date)}</Table.Td><Table.Td ta="right">{money(invoice.amount)}</Table.Td><Table.Td ta="right" c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td><Table.Td><StatusCell row={invoice} /></Table.Td><Table.Td maw={180}><RecordedBy row={invoice} /></Table.Td><Table.Td onClick={(event) => event.stopPropagation()}><Group gap={4} wrap="nowrap" justify="flex-end">{ledgerActions(invoice, 'xs')}</Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}<ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(debouncedLedgerSearch.trim())} label="invoices" /></>}</div>}
      </Stack>
    </Drawer>
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={onCollected} />
    <RecordCollectionModal customer={recordingCustomer} onClose={() => setRecordingCustomer(null)} onSaved={onCollected} />
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onRecord={(invoice) => setRecording({ ...invoice, customer_name: invoice.customer_name || selected?.name })} refreshKey={refresh} />
  </Stack>;
}
