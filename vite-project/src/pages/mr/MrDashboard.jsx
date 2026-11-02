import { useEffect } from 'react';
import { Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchMrDashboard, fetchMrOutstanding } from '../../store/slices/mrSlice';
import { money } from '../../utils/formatters';

const Metric = ({ label, value, color }) => <Paper withBorder p="md"><Text size="sm" c="dimmed">{label}</Text><Title order={2} c={color}>{value}</Title></Paper>;

export default function MrDashboard({ onNavigateToUpload }) {
  const dispatch = useAppDispatch(); const { dashboard, totalOutstanding, loading } = useAppSelector((state) => state.mr);
  useEffect(() => { dispatch(fetchMrDashboard()); dispatch(fetchMrOutstanding({ limit: 1, offset: 0 })); }, [dispatch]);
  return <Stack gap="md"><Group justify="space-between"><div><Title order={1}>Hello, {dashboard?.name || 'there'}</Title><Text c="dimmed">Your invoices and collection position.</Text></div><Button leftSection={<IconUpload size={16} />} onClick={onNavigateToUpload}>Upload invoice</Button></Group>
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}><Metric label="Invoices" value={dashboard?.total_invoices || 0} /><Metric label="Paid" value={dashboard?.paid || 0} color="green" /><Metric label="Need collection" value={(dashboard?.partial || 0) + (dashboard?.unpaid || 0)} color="orange" /><Metric label="Outstanding" value={money(totalOutstanding)} color="red" /></SimpleGrid>
    <Paper withBorder p="md"><Title order={3} mb="sm">Recent invoices</Title>{loading ? <Group justify="center" p="lg"><Loader /></Group> : !dashboard?.recent?.length ? <Text c="dimmed" py="md">No invoices assigned to you yet.</Text> : <Table.ScrollContainer minWidth={540}><Table striped><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{dashboard.recent.map((invoice, index) => <Table.Tr key={`${invoice.invoice_number}-${index}`}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.customer || '—'}</Table.Td><Table.Td>{money(invoice.total_amount)}</Table.Td><Table.Td>{invoice.status}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}</Paper>
  </Stack>;
}
