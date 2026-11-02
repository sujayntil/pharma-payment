import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { money } from '../../utils/formatters';

const modes = ['Cash', 'UPI', 'Bank Transfer', 'NEFT', 'RTGS', 'Cheque', 'Other'];
const toInputDate = (date) => date.toISOString().slice(0, 10);

export default function AdminCollections() {
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [count, setCount] = useState(0);
  const [mrs, setMrs] = useState([]); const [filters, setFilters] = useState({ date_from: '', date_to: '', mr_id: '', mode: '', search: '' });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { const [data, users] = await Promise.all([adminApi.getCollections(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))), adminApi.getUsers()]); setRows(data.rows); setTotal(data.total_amount); setCount(data.total_count); setMrs(users.filter((user) => user.role === 'MR')); } catch (err) { setError(err.detail || err.message); } finally { setLoading(false); } };
  // Initial page load intentionally fetches the ledger once.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const preset = (days) => { const today = new Date(); const from = new Date(); from.setDate(today.getDate() - days + 1); const next = { ...filters, date_from: toInputDate(from), date_to: toInputDate(today) }; setFilters(next); };
  return <Stack gap="md">
    <div><Title order={1}>Collections</Title><Text c="dimmed">Every recorded payment, newest first.</Text></div>
    <Paper withBorder p="md"><Group align="end"><TextInput type="date" label="From" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.currentTarget.value })} /><TextInput type="date" label="To" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.currentTarget.value })} /><Select label="MR" clearable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={filters.mr_id || null} onChange={(value) => setFilters({ ...filters, mr_id: value || '' })} /><Select label="Mode" clearable data={modes} value={filters.mode || null} onChange={(value) => setFilters({ ...filters, mode: value || '' })} /><TextInput label="Search" leftSection={<IconSearch size={16} />} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.currentTarget.value })} /><Button onClick={load}>Apply</Button></Group><Group mt="sm"><Button size="xs" variant="subtle" onClick={() => preset(1)}>Today</Button><Button size="xs" variant="subtle" onClick={() => preset(30)}>Last 30 days</Button><Button size="xs" variant="subtle" onClick={() => { setFilters({ date_from: '', date_to: '', mr_id: '', mode: '', search: '' }); }}>Clear</Button></Group></Paper>
    <SimpleGrid cols={{ base: 1, sm: 2 }}><Paper withBorder p="md"><Text size="sm" c="dimmed">Collected in selected period</Text><Title order={2}>{money(total)}</Title></Paper><Paper withBorder p="md"><Text size="sm" c="dimmed">Payment entries</Text><Title order={2}>{count}</Title></Paper></SimpleGrid>
    <Paper withBorder p="md">{error && <Alert color="red" mb="md">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : <Table.ScrollContainer minWidth={760}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Collected at</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Reference</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows.map((payment) => <Table.Tr key={payment.payment_id}><Table.Td>{new Date(payment.payment_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</Table.Td><Table.Td fw={600}>{payment.invoice_number}</Table.Td><Table.Td>{payment.customer_name || '—'}</Table.Td><Table.Td>{payment.mr_name || '—'}</Table.Td><Table.Td fw={700}>{money(payment.amount)}</Table.Td><Table.Td><Badge variant="light">{payment.mode || '—'}</Badge></Table.Td><Table.Td>{payment.transaction_reference || '—'}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}{!loading && !rows.length && <Text ta="center" c="dimmed" py="xl">No collections match these filters.</Text>}</Paper>
  </Stack>;
}
