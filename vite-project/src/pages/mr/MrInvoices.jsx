import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const blank = { invoice_number: '', invoice_date: '', customer_name: '', total_amount: '', payment_mode: '', remarks: '' };
const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other'];

export default function MrInvoices() {
  const [invoices, setInvoices] = useState([]); const [total, setTotal] = useState(0); const [search, setSearch] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [status, setStatus] = useState(''); const [applied, setApplied] = useState({}); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); const [form, setForm] = useState(blank); const [deleting, setDeleting] = useState(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await invoicesApi.getMyInvoices({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(search.trim() && { search: search.trim() }),
          ...applied,
        });
        if (active) { setInvoices(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [applied, page, refresh, search]);

  const openEdit = (invoice) => { setEditing(invoice); setForm({ invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date || '', customer_name: invoice.customer_name || '', total_amount: invoice.total_amount, payment_mode: invoice.payment_mode || '', remarks: invoice.remarks || '' }); };
  const save = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await invoicesApi.updateInvoice(editing.id, { ...form, total_amount: Number(form.total_amount) }); setEditing(null); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); setError(''); try { await invoicesApi.deleteInvoice(deleting.id); setDeleting(null); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const applyFilters = () => { setPage(1); setApplied({ ...(from && { date_from: from }), ...(to && { date_to: to }), ...(status && { status }) }); };
  const clearFilters = () => { setFrom(''); setTo(''); setStatus(''); setApplied({}); setPage(1); };

  return <Stack gap="md"><div><Title order={1}>My invoices</Title><Text c="dimmed">Invoices assigned to you, with payment status and balance.</Text></div>
    <Paper withBorder p="md"><SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" verticalSpacing="sm"><TextInput type="date" label="From invoice date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /><TextInput type="date" label="To invoice date" value={to} onChange={(e) => setTo(e.currentTarget.value)} /><Select label="Status" clearable data={['PAID', 'PARTIAL', 'UNPAID']} value={status || null} onChange={(value) => setStatus(value || '')} /><Group align="end" grow><Button onClick={applyFilters}>Apply filters</Button><Button variant="subtle" onClick={clearFilters}>Clear</Button></Group></SimpleGrid><TextInput mt="md" leftSection={<IconSearch size={16} />} placeholder="Search by invoice number or customer" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} /></Paper>
    {error && <Alert color="red" onClose={() => setError('')} withCloseButton>{error}</Alert>}
    <Paper withBorder p="md">{loading ? <Group justify="center" p="xl"><Loader /></Group> : !invoices.length ? <Text c="dimmed" ta="center" py="xl">No invoices match these filters.</Text> : <Table.ScrollContainer minWidth={900}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Collected</Table.Th><Table.Th>Pending</Table.Th><Table.Th style={{ whiteSpace: 'nowrap' }}>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.invoice_date || '—'}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td><Table.Td>{money(invoice.total_amount)}</Table.Td><Table.Td>{money(invoice.paid_amount)}</Table.Td><Table.Td c={invoice.pending_amount ? 'red' : 'green'}>{money(invoice.pending_amount)}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}><Badge style={{ whiteSpace: 'nowrap' }} color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td><Table.Td><Group gap="xs" wrap="nowrap"><Button size="xs" variant="light" onClick={() => openEdit(invoice)}>Edit</Button><Button size="xs" variant="light" color="red" onClick={() => setDeleting(invoice)}>Delete</Button></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="invoices" />
    </Paper>
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit invoice ${editing?.invoice_number || ''}`} centered><form onSubmit={save}><Stack><TextInput label="Invoice number" required value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.currentTarget.value })} /><TextInput type="date" label="Invoice date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.currentTarget.value })} /><TextInput label="Customer" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.currentTarget.value })} /><NumberInput label="Total amount (₹)" min={0.01} decimalScale={2} required value={form.total_amount} onChange={(value) => setForm({ ...form, total_amount: value })} /><Select label="Payment mode" clearable data={modes} value={form.payment_mode || null} onChange={(value) => setForm({ ...form, payment_mode: value || '' })} /><TextInput label="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.currentTarget.value })} /><Button type="submit" loading={busy}>Save changes</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete invoice" centered><Stack><Alert color="red">This removes invoice {deleting?.invoice_number} and its payment history.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={remove}>Delete permanently</Button></Group></Stack></Modal>
  </Stack>;
}
