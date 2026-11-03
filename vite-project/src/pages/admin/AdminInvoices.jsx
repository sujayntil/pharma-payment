import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { adminApi } from '../../api/adminApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const blankFilters = { mrId: '', status: '', from: '', to: '' };
const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other'];

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]); const [total, setTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [filters, setFilters] = useState(blankFilters); const [applied, setApplied] = useState(blankFilters); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null); const [form, setForm] = useState(null); const [deleting, setDeleting] = useState(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

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
        const result = await invoicesApi.getInvoices({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(search.trim() && { search: search.trim() }), ...(applied.mrId && { mr_id: applied.mrId }), ...(applied.status && { status: applied.status }), ...(applied.from && { date_from: applied.from }), ...(applied.to && { date_to: applied.to }) });
        if (active) { setInvoices(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [applied, page, refresh, search]);

  const apply = () => { setPage(1); setApplied(filters); };
  const clear = () => { setFilters(blankFilters); setApplied(blankFilters); setSearch(''); setPage(1); };
  const openEdit = (invoice) => { setEditing(invoice); setForm({ invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date || '', customer_name: invoice.customer_name || '', total_amount: invoice.total_amount, payment_mode: invoice.payment_mode || '', remarks: invoice.remarks || '' }); };
  const save = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await invoicesApi.updateInvoice(editing.id, { ...form, invoice_number: form.invoice_number.trim(), customer_name: form.customer_name.trim(), total_amount: Number(form.total_amount), payment_mode: form.payment_mode || null, remarks: form.remarks.trim() || null }); setEditing(null); setNotice('Invoice updated.'); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); setError(''); try { await invoicesApi.deleteInvoice(deleting.id); setDeleting(null); setNotice('Invoice and its collection history were deleted.'); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };

  return <Stack gap="md"><div><Title order={1}>Invoices</Title><Text c="dimmed">Latest invoice dates appear first.</Text></div>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}{notice && <Alert color="green" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    <Paper withBorder p="md"><Stack gap="sm"><SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm" verticalSpacing="sm"><Select label="MR" clearable searchable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={filters.mrId || null} onChange={(value) => setFilters({ ...filters, mrId: value || '' })} /><Select label="Status" clearable data={['PAID', 'PARTIAL', 'UNPAID']} value={filters.status || null} onChange={(value) => setFilters({ ...filters, status: value || '' })} /><TextInput type="date" label="From invoice date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.currentTarget.value })} /><TextInput type="date" label="To invoice date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.currentTarget.value })} /><Group align="end" grow><Button onClick={apply}>Apply filters</Button><Button variant="subtle" onClick={clear}>Clear</Button></Group></SimpleGrid><TextInput leftSection={<IconSearch size={16} />} placeholder="Search invoice, customer, MR" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} /></Stack></Paper>
    <Paper withBorder p="md">{loading ? <Group justify="center" p="xl"><Loader /></Group> : !invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <Table.ScrollContainer minWidth={1000}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.invoice_date || '—'}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td><Table.Td>{invoice.mr_name || '—'}</Table.Td><Table.Td>{money(invoice.total_amount)}</Table.Td><Table.Td c={invoice.pending_amount ? 'red' : undefined}>{money(invoice.pending_amount)}</Table.Td><Table.Td>{invoice.payment_mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td><Table.Td><Group gap="xs" wrap="nowrap"><Button size="xs" variant="default" onClick={() => openEdit(invoice)}>Edit</Button><Button size="xs" variant="light" color="red" onClick={() => setDeleting(invoice)}>Delete</Button></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="invoices" />
    </Paper>
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit invoice ${editing?.invoice_number || ''}`} centered><form onSubmit={save}><Stack><TextInput required label="Invoice number" value={form?.invoice_number || ''} onChange={(event) => setForm({ ...form, invoice_number: event.currentTarget.value })} /><TextInput required type="date" label="Invoice date" value={form?.invoice_date || ''} onChange={(event) => setForm({ ...form, invoice_date: event.currentTarget.value })} /><TextInput required label="Customer" value={form?.customer_name || ''} onChange={(event) => setForm({ ...form, customer_name: event.currentTarget.value })} /><NumberInput required min={0.01} decimalScale={2} label="Bill amount (₹)" value={form?.total_amount || ''} onChange={(value) => setForm({ ...form, total_amount: value })} /><Select label="Payment mode" clearable data={modes} value={form?.payment_mode || null} onChange={(value) => setForm({ ...form, payment_mode: value || '' })} /><TextInput label="Remarks" value={form?.remarks || ''} onChange={(event) => setForm({ ...form, remarks: event.currentTarget.value })} /><Button type="submit" loading={busy}>Save changes</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete invoice" centered><Stack><Alert color="red">Delete invoice {deleting?.invoice_number}? Its collection history will also be removed and balances will recalculate.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={remove}>Delete invoice</Button></Group></Stack></Modal>
  </Stack>;
}
