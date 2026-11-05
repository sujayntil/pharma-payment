import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Drawer, Group, Loader, Modal, NumberInput, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput, Select, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { adminApi } from '../../api/adminApi';
import { paymentsApi } from '../../api/paymentsApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const emptyCustomer = { name: '', type: '', phone: '', address: '', gstin: '', mr_id: '' };

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [filters, setFilters] = useState({ mrId: '', type: '' }); const [applied, setApplied] = useState({ mrId: '', type: '' }); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null); const [ledger, setLedger] = useState(null); const [ledgerSearch, setLedgerSearch] = useState(''); const [ledgerDates, setLedgerDates] = useState({ from: '', to: '' }); const [ledgerApplied, setLedgerApplied] = useState({ from: '', to: '' }); const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerRefresh, setLedgerRefresh] = useState(0); const [paymentInvoice, setPaymentInvoice] = useState(null); const [paymentAmount, setPaymentAmount] = useState(''); const [paymentMode, setPaymentMode] = useState(null); const [paymentReference, setPaymentReference] = useState(''); const [paymentBusy, setPaymentBusy] = useState(false); const [paymentError, setPaymentError] = useState(''); const [paymentNotice, setPaymentNotice] = useState('');
  const [editing, setEditing] = useState(null); const [customerForm, setCustomerForm] = useState(emptyCustomer); const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch((err) => { if (active) setError(err.detail || err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(search.trim() && { search: search.trim() }), ...(applied.mrId && { mr_id: applied.mrId }), ...(applied.type.trim() && { customer_type: applied.type.trim() }) });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [applied, page, refresh, search]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLedgerLoading(true); setError('');
      try {
        const result = await customersApi.getCustomerLedger(selected.id, { limit: PAGE_SIZE, offset: (ledgerPage - 1) * PAGE_SIZE, ...(ledgerSearch.trim() && { search: ledgerSearch.trim() }), ...(ledgerApplied.from && { date_from: ledgerApplied.from }), ...(ledgerApplied.to && { date_to: ledgerApplied.to }) });
        if (active) setLedger(result);
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLedgerLoading(false); }
    }, ledgerSearch ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ledgerApplied, ledgerPage, ledgerRefresh, ledgerSearch, selected]);

  const openLedger = (customer) => { setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerDates({ from: '', to: '' }); setLedgerApplied({ from: '', to: '' }); setLedgerPage(1); setPaymentNotice(''); };
  const openEdit = (customer) => { setEditing(customer); setCustomerForm({ name: customer.name, type: customer.type || '', phone: customer.phone || '', address: customer.address || '', gstin: customer.gstin || '', mr_id: customer.mr_id ? String(customer.mr_id) : '' }); };
  const saveCustomer = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await customersApi.updateCustomer(editing.id, { ...customerForm, name: customerForm.name.trim(), type: customerForm.type.trim() || null, phone: customerForm.phone.trim() || null, address: customerForm.address.trim() || null, gstin: customerForm.gstin.trim() || null, mr_id: customerForm.mr_id ? Number(customerForm.mr_id) : null }); setEditing(null); setNotice('Customer details saved.'); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const deleteCustomer = async () => { setBusy(true); setError(''); try { await customersApi.deleteCustomer(deleting.id); setDeleting(null); setNotice('Customer deleted.'); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const applyFilters = () => { setPage(1); setApplied(filters); };
  const clearFilters = () => { const next = { mrId: '', type: '' }; setFilters(next); setApplied(next); setSearch(''); setPage(1); };
  const applyLedgerDates = () => { setLedgerPage(1); setLedgerApplied(ledgerDates); };
  const openPayment = (invoice) => { setPaymentInvoice(invoice); setPaymentAmount(''); setPaymentMode(null); setPaymentReference(''); setPaymentError(''); setPaymentNotice(''); };
  const savePayment = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(paymentInvoice?.pending_amount || 0) + 0.01) { setPaymentError('Enter an amount up to the pending balance.'); return; }
    setPaymentBusy(true); setPaymentError('');
    try {
      await paymentsApi.createPayment({ invoice_id: paymentInvoice.invoice_id, amount, mode: paymentMode || null, transaction_reference: paymentReference.trim() || null });
      setPaymentInvoice(null); setPaymentNotice(`Collection recorded for invoice ${paymentInvoice.invoice_number}.`); setLedgerRefresh((value) => value + 1);
    } catch (err) { setPaymentError(err.detail || err.message || 'Could not record collection.'); }
    finally { setPaymentBusy(false); }
  };

  return <Stack gap="md"><Group justify="space-between" align="end"><div><Title order={1}>Customers</Title><Text c="dimmed">Browse, filter, and maintain customer records.</Text></div><Badge variant="light" size="lg">{total} customers</Badge></Group>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}{notice && <Alert color="green" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    <Paper withBorder p="md"><Stack gap="sm"><SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" verticalSpacing="sm"><Select label="Assigned MR" clearable searchable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={filters.mrId || null} onChange={(value) => setFilters({ ...filters, mrId: value || '' })} /><TextInput label="Customer type" placeholder="Chemist, Doctor…" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.currentTarget.value })} /><Group align="end" grow><Button onClick={applyFilters}>Apply filters</Button><Button variant="subtle" onClick={clearFilters}>Clear</Button></Group></SimpleGrid><TextInput leftSection={<IconSearch size={16} />} placeholder="Search by name, type or phone" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} /></Stack></Paper>
    <Paper withBorder p="md">{loading ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? <Text ta="center" c="dimmed" py="xl">No customers match these filters.</Text> : <ScrollArea><Table miw={760} highlightOnHover><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Phone</Table.Th><Table.Th>MR</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id}><Table.Td fw={600}>{customer.name}</Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.phone || '—'}</Table.Td><Table.Td>{customer.mr_name || 'Unassigned'}</Table.Td><Table.Td><Group gap="xs" wrap="nowrap"><Button size="xs" variant="light" onClick={() => openLedger(customer)}>Ledger</Button><Button size="xs" variant="default" onClick={() => openEdit(customer)}>Edit</Button><Button size="xs" variant="light" color="red" onClick={() => setDeleting(customer)}>Delete</Button></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(760px, 100%)" title={`Ledger — ${selected?.name || ''}`}>
      {paymentNotice && <Alert color="green" withCloseButton onClose={() => setPaymentNotice('')}>{paymentNotice}</Alert>}
      {ledger && <><SimpleGrid cols={{ base: 1, sm: 3 }} mb="md"><Paper withBorder p="sm"><Text size="xs" c="dimmed">Invoiced in selected dates</Text><Text fw={700}>{money(ledger.total_invoiced)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Collected in selected dates</Text><Text fw={700}>{money(ledger.total_paid)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Outstanding in selected dates</Text><Text fw={700} c="red">{money(ledger.outstanding)}</Text></Paper></SimpleGrid><SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" verticalSpacing="sm" mb="md"><TextInput type="date" label="From date" value={ledgerDates.from} onChange={(event) => setLedgerDates({ ...ledgerDates, from: event.currentTarget.value })} /><TextInput type="date" label="To date" value={ledgerDates.to} onChange={(event) => setLedgerDates({ ...ledgerDates, to: event.currentTarget.value })} /><Group align="end" grow><Button onClick={applyLedgerDates}>Apply dates</Button><Button variant="subtle" onClick={() => { setLedgerDates({ from: '', to: '' }); setLedgerApplied({ from: '', to: '' }); setLedgerPage(1); }}>All dates</Button></Group></SimpleGrid><TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search this customer's invoices" value={ledgerSearch} onChange={(event) => { setLedgerSearch(event.currentTarget.value); setLedgerPage(1); }} /></>}
      {ledgerLoading || !ledger ? <Group justify="center" p="xl"><Loader /></Group> : !ledger.invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <><ScrollArea><Table miw={680}><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th><Table.Th>Collection</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id}><Table.Td>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.date || '—'}</Table.Td><Table.Td>{invoice.mr || '—'}</Table.Td><Table.Td>{money(invoice.amount)}</Table.Td><Table.Td>{invoice.mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td><Table.Td>{Number(invoice.pending_amount) > 0 ? <Button size="xs" variant="light" color="green" onClick={() => openPayment(invoice)}>Record</Button> : '—'}</Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea><ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(ledgerSearch.trim())} label="invoices" /></>}
    </Drawer>
    <Modal opened={!!paymentInvoice} onClose={() => { if (!paymentBusy) setPaymentInvoice(null); }} title={`Record collection · ${paymentInvoice?.invoice_number || ''}`} centered>
      <Stack>
        <Alert color="blue">Pending balance: {money(paymentInvoice?.pending_amount)}</Alert>
        <NumberInput label="Amount received (₹)" min={0.01} max={Number(paymentInvoice?.pending_amount || 0)} decimalScale={2} value={paymentAmount} onChange={setPaymentAmount} />
        <Select label="Payment mode" clearable data={['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other']} value={paymentMode} onChange={setPaymentMode} />
        <TextInput label="Reference / UTR (optional)" value={paymentReference} onChange={(event) => setPaymentReference(event.currentTarget.value)} />
        {paymentError && <Alert color="red">{paymentError}</Alert>}
        <Group justify="end"><Button variant="default" disabled={paymentBusy} onClick={() => setPaymentInvoice(null)}>Cancel</Button><Button color="green" loading={paymentBusy} onClick={savePayment}>Save collection</Button></Group>
      </Stack>
    </Modal>
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name || 'customer'}`} centered><form onSubmit={saveCustomer}><Stack><TextInput label="Customer name" required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.currentTarget.value })} /><TextInput label="Customer type" value={customerForm.type} onChange={(event) => setCustomerForm({ ...customerForm, type: event.currentTarget.value })} /><Select label="Assigned MR" clearable searchable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={customerForm.mr_id || null} onChange={(value) => setCustomerForm({ ...customerForm, mr_id: value || '' })} /><TextInput label="Phone" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.currentTarget.value })} /><TextInput label="Address" value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.currentTarget.value })} /><TextInput label="GSTIN" value={customerForm.gstin} onChange={(event) => setCustomerForm({ ...customerForm, gstin: event.currentTarget.value })} /><Button type="submit" loading={busy}>Save customer</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete customer" centered><Stack><Alert color="red">Delete {deleting?.name}? Customers with invoices cannot be deleted, so their ledger history stays protected.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={deleteCustomer}>Delete customer</Button></Group></Stack></Modal>
  </Stack>;
}
