import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { adminApi } from '../../api/adminApi';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchAdminDashboard, fetchOutstandingAlerts, setDashFilters } from '../../store/slices/adminSlice';
import PaymentAlerts from '../../components/common/PaymentAlerts';
import { money } from '../../utils/formatters';

const Stat = ({ label, value, accent = false }) => (
  <Paper withBorder p="md" bg={accent ? 'green.0' : undefined}>
    <Text size="sm" c="dimmed">{label}</Text>
    <Title order={2} mt={4}>{value}</Title>
  </Paper>
);

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function AdminDashboard() {
  const dispatch = useAppDispatch();
  const { dashboard, alerts, loading, dashFilters } = useAppSelector((state) => state.admin);
  const [from, setFrom] = useState(dashFilters.dateFrom || '');
  const [to, setTo] = useState(dashFilters.dateTo || '');
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  const load = (dateFrom = from, dateTo = to) => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    dispatch(fetchAdminDashboard(params));
    dispatch(fetchOutstandingAlerts(50000));
    adminApi.getRecentPayments().then(setRecent).catch((err) => setError(err.detail || err.message));
  };

  useEffect(() => {
    const params = {};
    if (dashFilters.dateFrom) params.date_from = dashFilters.dateFrom;
    if (dashFilters.dateTo) params.date_to = dashFilters.dateTo;
    dispatch(fetchAdminDashboard(params));
    dispatch(fetchOutstandingAlerts(50000));
    adminApi.getRecentPayments().then(setRecent).catch((err) => setError(err.detail || err.message));
  }, [dispatch, dashFilters.dateFrom, dashFilters.dateTo]);

  const applyRange = (dateFrom = from, dateTo = to) => {
    setFrom(dateFrom);
    setTo(dateTo);
    dispatch(setDashFilters({ dateFrom: dateFrom || null, dateTo: dateTo || null }));
    load(dateFrom, dateTo);
  };

  const preset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    applyRange(localDate(start), localDate(end));
  };

  const clearRange = () => applyRange('', '');

  return (
    <Stack gap="md">
      <Group justify="space-between" align="end">
        <div><Title order={1}>Dashboard</Title><Text c="dimmed">Sales, collections, and balances at a glance.</Text></div>
        <Badge variant="light" size="lg">Admin view</Badge>
      </Group>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Group>
            <Button variant="default" onClick={clearRange}>All time</Button>
            <Button variant="default" onClick={() => preset(1)}>Today</Button>
            <Button variant="default" onClick={() => preset(30)}>Last 30 days</Button>
          </Group>
          <Group align="end">
            <TextInput type="date" label="From" value={from} onChange={(event) => setFrom(event.currentTarget.value)} />
            <TextInput type="date" label="To" value={to} onChange={(event) => setTo(event.currentTarget.value)} />
            <Button onClick={() => applyRange()}>Apply dates</Button>
          </Group>
        </Stack>
      </Paper>

      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Stat label="Tally sales" value={money(dashboard?.total_sales)} accent />
        <Stat label="Collected in selected dates" value={money(dashboard?.collected)} />
        <Stat label="Outstanding on selected invoices" value={money(dashboard?.outstanding)} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Stat label="Paid invoices" value={dashboard?.paid ?? 0} />
        <Stat label="Partially paid" value={dashboard?.partial ?? 0} />
        <Stat label="Unpaid invoices" value={dashboard?.unpaid ?? 0} />
      </SimpleGrid>

      <Paper withBorder p="md"><PaymentAlerts /></Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <div><Title order={3}>Outstanding above ₹50,000</Title><Text size="sm" c="dimmed">Invoices that may need follow up.</Text></div>
          <Badge>{alerts.length}</Badge>
        </Group>
        {loading && !alerts.length ? <Group justify="center" p="lg"><Loader /></Group> : !alerts.length ? <Text c="dimmed" py="md">No high outstanding balances.</Text> : (
          <Table.ScrollContainer minWidth={620}>
            <Table striped>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>MR</Table.Th><Table.Th>Outstanding</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{alerts.map((item, index) => (
                <Table.Tr key={`${item.invoice_number}-${index}`}>
                  <Table.Td>{item.customer || '—'}</Table.Td><Table.Td fw={600}>{item.invoice_number}</Table.Td><Table.Td>{item.mr || '—'}</Table.Td><Table.Td fw={700} c="red">{money(item.pending_amount)}</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Title order={3} mb="sm">Recent collections</Title>
        {recent.length ? (
          <Table.ScrollContainer minWidth={600}>
            <Table striped>
              <Table.Thead><Table.Tr><Table.Th>When</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th>Collected</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{recent.map((item) => (
                <Table.Tr key={item.payment_id}>
                  <Table.Td>{item.payment_date ? new Date(item.payment_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '—'}</Table.Td>
                  <Table.Td>{item.customer_name || '—'}</Table.Td><Table.Td fw={600}>{item.invoice_number}</Table.Td><Table.Td>{item.collected_by || '—'}</Table.Td><Table.Td fw={700}>{money(item.amount)}</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : <Text c="dimmed" py="md">No collections recorded yet.</Text>}
      </Paper>
    </Stack>
  );
}
