import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { adminApi } from '../../api/adminApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const blankFilters = { mrId: '', status: '', from: '', to: '' };

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]); const [total, setTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [filters, setFilters] = useState(blankFilters); const [applied, setApplied] = useState(blankFilters);
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState('');

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
        const result = await invoicesApi.getInvoices({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(search.trim() && { search: search.trim() }),
          ...(applied.mrId && { mr_id: applied.mrId }),
          ...(applied.status && { status: applied.status }),
          ...(applied.from && { date_from: applied.from }),
          ...(applied.to && { date_to: applied.to }),
        });
        if (active) { setInvoices(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [applied, page, search]);

  const apply = () => { setPage(1); setApplied(filters); };
  const clear = () => { setFilters(blankFilters); setApplied(blankFilters); setSearch(''); setPage(1); };
  return <Stack gap="md"><div><Title order={1}>Invoices</Title><Text c="dimmed">Search and filter all invoice records.</Text></div>
    <Paper withBorder p="md"><Group align="end"><Select label="MR" clearable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={filters.mrId || null} onChange={(value) => setFilters({ ...filters, mrId: value || '' })} /><Select label="Status" clearable data={['PAID', 'PARTIAL', 'UNPAID']} value={filters.status || null} onChange={(value) => setFilters({ ...filters, status: value || '' })} /><TextInput type="date" label="From invoice date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.currentTarget.value })} /><TextInput type="date" label="To invoice date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.currentTarget.value })} /><Button onClick={apply}>Apply filters</Button><Button variant="subtle" onClick={clear}>Clear</Button></Group><TextInput mt="md" leftSection={<IconSearch size={16} />} placeholder="Search invoice, customer, MR" value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} /></Paper>
    <Paper withBorder p="md">{error && <Alert color="red" mb="md">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : !invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <Table.ScrollContainer minWidth={880}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.invoice_date || '—'}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td><Table.Td>{invoice.mr_name || '—'}</Table.Td><Table.Td>{money(invoice.total_amount)}</Table.Td><Table.Td c={invoice.pending_amount ? 'red' : undefined}>{money(invoice.pending_amount)}</Table.Td><Table.Td>{invoice.payment_mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="invoices" />
    </Paper></Stack>;
}
