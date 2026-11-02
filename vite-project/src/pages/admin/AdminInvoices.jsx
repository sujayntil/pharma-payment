import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, ScrollArea, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { adminApi } from '../../api/adminApi';
import { money } from '../../utils/formatters';

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]); const [mrs, setMrs] = useState([]); const [search, setSearch] = useState(''); const [mrId, setMrId] = useState(''); const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async (params = {}, initial = false) => { if (!initial) { setLoading(true); setError(''); } try { const [rows, users] = await Promise.all([invoicesApi.getInvoices(params), adminApi.getUsers()]); setInvoices(rows); setMrs(users.filter((user) => user.role === 'MR')); } catch (err) { setError(err.detail || err.message); } finally { setLoading(false); } };
  useEffect(() => {
    let active = true;
    Promise.all([invoicesApi.getInvoices(), adminApi.getUsers()])
      .then(([rows, users]) => {
        if (!active) return;
        setInvoices(rows);
        setMrs(users.filter((user) => user.role === 'MR'));
      })
      .catch((err) => { if (active) setError(err.detail || err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const apply = () => load({ ...(mrId && { mr_id: mrId }), ...(status && { status }), ...(from && { date_from: from }), ...(to && { date_to: to }) });
  const visible = useMemo(() => invoices.filter((invoice) => `${invoice.invoice_number} ${invoice.customer_name || ''} ${invoice.mr_name || ''} ${invoice.payment_mode || ''}`.toLowerCase().includes(search.toLowerCase())), [invoices, search]);
  return <Stack gap="md"><div><Title order={1}>Invoices</Title><Text c="dimmed">Search and filter all invoice records.</Text></div><Paper withBorder p="md"><Group align="end"><Select label="MR" clearable data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={mrId || null} onChange={(value) => setMrId(value || '')} /><Select label="Status" clearable data={['PAID', 'PARTIAL', 'UNPAID']} value={status || null} onChange={(value) => setStatus(value || '')} /><TextInput type="date" label="From invoice date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /><TextInput type="date" label="To invoice date" value={to} onChange={(e) => setTo(e.currentTarget.value)} /><Button onClick={apply}>Apply filters</Button><Button variant="subtle" onClick={() => { setMrId(''); setStatus(''); setFrom(''); setTo(''); load(); }}>Clear</Button></Group><TextInput mt="md" leftSection={<IconSearch size={16} />} placeholder="Search invoice, customer, MR" value={search} onChange={(e) => setSearch(e.currentTarget.value)} /></Paper>
    <Paper withBorder p="md">{error && <Alert color="red" mb="md">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : !visible.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : <ScrollArea><Table miw={880} striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{visible.map((invoice) => <Table.Tr key={invoice.id}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.invoice_date || '—'}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td><Table.Td>{invoice.mr_name || '—'}</Table.Td><Table.Td>{money(invoice.total_amount)}</Table.Td><Table.Td c={invoice.pending_amount ? 'red' : undefined}>{money(invoice.pending_amount)}</Table.Td><Table.Td>{invoice.payment_mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}</Paper></Stack>;
}
