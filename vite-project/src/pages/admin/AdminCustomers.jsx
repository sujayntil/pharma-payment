import { useEffect, useMemo, useState } from 'react';
import { /* ActionIcon, Menu, */ Alert, Badge, Button, Drawer, Group, Loader, Modal, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Select, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { /* IconArrowBackUp, IconDots, IconHistory, */ IconCash, IconCategory, IconUser } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { adminApi } from '../../api/adminApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
// Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
// import MarkUnpaidModal from '../../components/collections/MarkUnpaidModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { errorText, money, shortDate } from '../../utils/formatters';

const emptyCustomer = { name: '', type: '', phone: '', address: '', gstin: '', mr_id: '' };
const CUSTOMER_TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital'];
const BLANK_LEDGER = { range: EMPTY_RANGE, status: '' };

/** openCustomer: optional { id, name } to open straight into that ledger (from the Dashboard). */
export default function AdminCustomers({ openCustomer = null }) {
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState({ mrId: '', type: '' }); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(openCustomer); const [ledger, setLedger] = useState(null); const [ledgerSearch, setLedgerSearch] = useState(''); const [debouncedLedgerSearch] = useDebouncedValue(ledgerSearch, 300); const [ledgerFilters, setLedgerFilters] = useState(BLANK_LEDGER); const [ledgerPage, setLedgerPage] = useState(1); const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const isMobile = useIsMobile();
  const [recording, setRecording] = useState(null); /* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed: const [reversing, setReversing] = useState(null); */ const [historyId, setHistoryId] = useState(null);
  const [editing, setEditing] = useState(null); const [customerForm, setCustomerForm] = useState(emptyCustomer); const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }), ...(filters.mrId && { mr_id: filters.mrId }), ...(filters.type && { customer_type: filters.type }) });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, refresh, debouncedSearch]);

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
  }, [ledgerFilters, ledgerPage, ledgerRefresh, debouncedLedgerSearch, selected]);

  const mrOptions = useMemo(() => mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), [mrs]);
  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setFilters({ mrId: '', type: '' }); setSearch(''); setPage(1); };
  const chips = [
    filters.mrId && { key: 'mr', label: `MR: ${mrOptions.find((o) => o.value === filters.mrId)?.label || '—'}`, onRemove: () => update({ mrId: '' }) },
    filters.type && { key: 'type', label: `Type: ${filters.type}`, onRemove: () => update({ type: '' }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const updateLedger = (patch) => { setLedgerFilters((current) => ({ ...current, ...patch })); setLedgerPage(1); };
  const onLedgerSearch = (value) => { setLedgerSearch(value); setLedgerPage(1); };
  const resetLedger = () => { setLedgerFilters(BLANK_LEDGER); setLedgerSearch(''); setLedgerPage(1); };
  const ledgerRange = describeRange(ledgerFilters.range);
  const ledgerChips = [
    ledgerFilters.status && { key: 'status', label: `Status: ${ledgerFilters.status.toLowerCase()}`, onRemove: () => updateLedger({ status: '' }) },
    ledgerRange && { key: 'range', label: `Invoice date: ${ledgerRange}`, onRemove: () => updateLedger({ range: EMPTY_RANGE }) },
    ledgerSearch.trim() && { key: 'q', label: `“${ledgerSearch.trim()}”`, onRemove: () => onLedgerSearch('') },
  ];
  const reloadLedger = () => setLedgerRefresh((value) => value + 1);
  const customerActions = (customer) => <Group gap="xs" wrap="nowrap" justify="flex-end"><Button size="xs" variant="light" onClick={() => openLedger(customer)}>Ledger</Button><Button size="xs" variant="default" onClick={() => openEdit(customer)}>Edit</Button><Button size="xs" variant="subtle" color="red" onClick={() => setDeleting(customer)}>Delete</Button></Group>;
  // One visible action (Record). Clicking the row opens the invoice panel.
  const ledgerActions = (invoice) => (
    <Group gap={4} wrap="nowrap" justify="flex-end" onClick={(event) => event.stopPropagation()}>
              {Number(invoice.pending_amount) > 0 && <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={() => setRecording(invoice)}>Record</Button>}
              {/* Replaced by clicking the row (opens the invoice panel):
              <Menu position="bottom-end" shadow="md" withinPortal>
                <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${invoice.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconHistory size={15} />} onClick={() => setHistoryId(invoice.invoice_id)}>Invoice history</Menu.Item>
                  {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
                  {invoice.paid_amount > 0 && <Menu.Item color="orange" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing(invoice)}>Mark unpaid</Menu.Item>} * /}
                </Menu.Dropdown>
              </Menu> */}
            </Group>
  );

  const openLedger = (customer) => { setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerFilters(BLANK_LEDGER); setLedgerPage(1); };
  const openEdit = (customer) => { setEditing(customer); setCustomerForm({ name: customer.name, type: customer.type || '', phone: customer.phone || '', address: customer.address || '', gstin: customer.gstin || '', mr_id: customer.mr_id ? String(customer.mr_id) : '' }); };
  const saveCustomer = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await customersApi.updateCustomer(editing.id, { ...customerForm, name: customerForm.name.trim(), type: customerForm.type.trim() || null, phone: customerForm.phone.trim() || null, address: customerForm.address.trim() || null, gstin: customerForm.gstin.trim() || null, mr_id: customerForm.mr_id ? Number(customerForm.mr_id) : null }); setEditing(null); setNotice('Customer details saved.'); setRefresh((value) => value + 1); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };
  const deleteCustomer = async () => { setBusy(true); setError(''); try { await customersApi.deleteCustomer(deleting.id); setDeleting(null); setNotice('Customer deleted.'); setRefresh((value) => value + 1); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };

  return <Stack gap="md"><Group justify="space-between" align="end"><div><Title order={1}>Customers</Title><Text c="dimmed">Browse, filter, and maintain customer records.</Text></div><Badge variant="light" size="lg">{total} customers</Badge></Group>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}{notice && <Alert color="green" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search by name, type or phone" chips={chips} onReset={reset}>
      <FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} searchable data={mrOptions} value={filters.mrId} onChange={(mrId) => update({ mrId })} />
      <FilterSelect placeholder="All types" icon={<IconCategory size={16} />} data={CUSTOMER_TYPES} value={filters.type} onChange={(type) => update({ type })} />
    </FilterBar>
    <Paper {...listPaperProps(isMobile)}>{loading ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? <Text ta="center" c="dimmed" py="xl">No customers match these filters.</Text> : isMobile ? <CardList>{customers.map((customer) => (
      <RowCard
        key={customer.id}
        title={customer.name}
        subtitle={[customer.type, customer.phone].filter(Boolean).join(' · ') || undefined}
        badges={customer.mr_name ? <Badge variant="light">{customer.mr_name}</Badge> : <Badge color="gray" variant="light">Unassigned</Badge>}
        details={[{ label: 'Invoices', value: customer.invoice_count }]}
        actions={customerActions(customer)}
      />
    ))}</CardList> : <ScrollArea><Table miw={760} highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Phone</Table.Th><Table.Th>MR</Table.Th><Table.Th>Invoices</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id}><Table.Td fw={600}>{customer.name}</Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.phone || '—'}</Table.Td><Table.Td>{customer.mr_name || <Badge color="gray" variant="light">Unassigned</Badge>}</Table.Td><Table.Td>{customer.invoice_count}</Table.Td><Table.Td>{customerActions(customer)}</Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(820px, 100%)" title={<Text fw={700}>Ledger — {selected?.name || ''}</Text>}>
      <Stack gap="md">
        {ledger && <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs"><StatCard size="md" label="Invoiced" value={money(ledger.total_invoiced)} /><StatCard size="md" label="Collected" color="green" value={money(ledger.total_paid)} /><StatCard size="md" label="Outstanding" color="red" value={money(ledger.outstanding)} /></SimpleGrid>}
        <FilterBar compact search={ledgerSearch} onSearch={onLedgerSearch} searchPlaceholder="Search this customer's invoices" chips={ledgerChips} onReset={resetLedger}>
          <StatusTabs value={ledgerFilters.status} onChange={(status) => updateLedger({ status })} />
          <DateRangeFilter label="Invoice date" value={ledgerFilters.range} onChange={(range) => updateLedger({ range })} />
        </FilterBar>
        {ledgerLoading || !ledger ? <Group justify="center" p="xl"><Loader /></Group> : !ledger.invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <>{isMobile ? <CardList>{ledger.invoices.map((invoice) => (
          <InvoiceCard key={invoice.invoice_id} invoice={invoice} showCustomer={false} onOpen={() => setHistoryId(invoice.invoice_id)} />
        ))}</CardList> : <ScrollArea><Table miw={820} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>MR</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id} onClick={() => setHistoryId(invoice.invoice_id)} style={{ cursor: 'pointer' }}>
          <Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.date)}</Table.Td><Table.Td>{invoice.mr || '—'}</Table.Td><Table.Td ta="right">{money(invoice.amount)}</Table.Td><Table.Td ta="right" c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td>
          <Table.Td><StatusCell row={invoice} /></Table.Td>
          <Table.Td maw={180}><RecordedBy row={invoice} /></Table.Td>
          <Table.Td>{ledgerActions(invoice)}</Table.Td>
        </Table.Tr>)}</Table.Tbody></Table></ScrollArea>}<ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(debouncedLedgerSearch.trim())} label="invoices" /></>}
      </Stack>
    </Drawer>
    <RecordCollectionModal invoice={recording && { ...recording, customer_name: selected?.name }} onClose={() => setRecording(null)} onSaved={reloadLedger} />
    {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
    <MarkUnpaidModal invoice={reversing && { ...reversing, customer_name: selected?.name }} onClose={() => setReversing(null)} onSaved={reloadLedger} /> */}
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={reloadLedger} onRecord={setRecording} refreshKey={ledgerRefresh} />
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name || 'customer'}`} centered><form onSubmit={saveCustomer}><Stack><TextInput label="Customer name" required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.currentTarget.value })} /><TextInput label="Customer type" value={customerForm.type} onChange={(event) => setCustomerForm({ ...customerForm, type: event.currentTarget.value })} /><Select label="Assigned MR" clearable searchable data={mrOptions} value={customerForm.mr_id || null} onChange={(value) => setCustomerForm({ ...customerForm, mr_id: value || '' })} /><TextInput label="Phone" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.currentTarget.value })} /><TextInput label="Address" value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.currentTarget.value })} /><TextInput label="GSTIN" value={customerForm.gstin} onChange={(event) => setCustomerForm({ ...customerForm, gstin: event.currentTarget.value })} /><Button type="submit" loading={busy}>Save customer</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete customer" centered><Stack><Alert color="red">Delete {deleting?.name}? Customers with invoices cannot be deleted, so their ledger history stays protected.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={deleteCustomer}>Delete customer</Button></Group></Stack></Modal>
  </Stack>;
}
