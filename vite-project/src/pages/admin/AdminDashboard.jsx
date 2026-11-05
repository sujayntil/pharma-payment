import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { adminApi } from '../../api/adminApi';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchAdminDashboard, fetchOutstandingAlerts, setDashFilters } from '../../store/slices/adminSlice';
import PaymentAlerts from '../../components/common/PaymentAlerts';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
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
  const { dashboard, alerts, alertCount, alertsLoading, dashFilters } = useAppSelector((state) => state.admin);
  const [alertPage, setAlertPage] = useState(1);
  const [from, setFrom] = useState(dashFilters.dateFrom || '');
  const [to, setTo] = useState(dashFilters.dateTo || '');
  const [customerType, setCustomerType] = useState('');
  const [appliedCustomerType, setAppliedCustomerType] = useState('');
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [overdue, setOverdue] = useState([]);
  const [overdueLoading, setOverdueLoading] = useState(true);
  const [overdueError, setOverdueError] = useState('');

  useEffect(() => {
    const params = {};
    if (dashFilters.dateFrom) params.date_from = dashFilters.dateFrom;
    if (dashFilters.dateTo) params.date_to = dashFilters.dateTo;
    if (appliedCustomerType) params.customer_type = appliedCustomerType;
    dispatch(fetchAdminDashboard(params));
    adminApi.getRecentPayments().then(setRecent).catch((err) => setError(err.detail || err.message));
  }, [dispatch, dashFilters.dateFrom, dashFilters.dateTo, appliedCustomerType]);

  useEffect(() => {
    let active = true;
    adminApi.getOverdueAlerts()
      .then((items) => { if (active) setOverdue(items); })
      .catch((err) => { if (active) setOverdueError(err.detail || err.message); })
      .finally(() => { if (active) setOverdueLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    dispatch(fetchOutstandingAlerts({ threshold: 50000, limit: PAGE_SIZE, offset: (alertPage - 1) * PAGE_SIZE }));
  }, [dispatch, alertPage]);

  const applyRange = (dateFrom = from, dateTo = to) => {
    setFrom(dateFrom);
    setTo(dateTo);
    dispatch(setDashFilters({ dateFrom: dateFrom || null, dateTo: dateTo || null }));
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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select label="Sales by customer type" data={[
              { value: 'distributor', label: 'Distributor' },
              { value: 'chemist', label: 'Chemist' },
              { value: 'doctor', label: 'Doctor' },
              { value: 'other', label: 'Other' },
            ]} placeholder="All customer types" clearable value={customerType || null} onChange={(value) => setCustomerType(value || '')} />
            <Group align="end" grow>
              <Button onClick={() => setAppliedCustomerType(customerType)}>Apply type</Button>
              <Button variant="subtle" onClick={() => { setCustomerType(''); setAppliedCustomerType(''); }}>Clear</Button>
            </Group>
          </SimpleGrid>
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
          <Badge>{alertCount}</Badge>
        </Group>
        {alertsLoading ? <Group justify="center" p="lg"><Loader /></Group> : !alerts.length ? <Text c="dimmed" py="md">No high outstanding balances.</Text> : (
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
        <ListPagination total={alertCount} page={alertPage} onChange={setAlertPage} label="invoices" />
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <div><Title order={3}>Outstanding for 40+ days</Title><Text size="sm" c="dimmed">From invoice date; reminders repeat every two days while the balance remains unpaid.</Text></div>
          <Badge color={overdue.length ? 'red' : 'gray'}>{overdue.length} customers</Badge>
        </Group>
        {overdueError && <Alert color="red" mb="sm">{overdueError}</Alert>}
        {overdueLoading ? <Group justify="center" p="lg"><Loader /></Group> : !overdue.length ? <Text c="dimmed" py="md">No customers have invoices outstanding for 40 days or more.</Text> : (
          <Table.ScrollContainer minWidth={760}>
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Oldest invoice</Table.Th><Table.Th>Days overdue</Table.Th><Table.Th>MR</Table.Th><Table.Th>Overdue invoices</Table.Th><Table.Th>40+ day balance</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{overdue.map((item) => (
                <Table.Tr key={item.customer_id}>
                  <Table.Td fw={600}>{item.customer}</Table.Td><Table.Td>{item.oldest_invoice_number}<Text size="xs" c="dimmed">{item.oldest_invoice_date}</Text></Table.Td><Table.Td>{item.days_overdue}</Table.Td><Table.Td>{item.mr || '—'}</Table.Td><Table.Td>{item.invoice_count}</Table.Td><Table.Td fw={700} c="red">{money(item.overdue_amount)}</Table.Td>
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
