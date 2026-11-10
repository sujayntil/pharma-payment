import { useEffect, useState } from 'react';
import { Alert, Badge, Group, Loader, Paper, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconCategory } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchAdminDashboard, fetchOutstandingAlerts, setDashFilters } from '../../store/slices/adminSlice';
import PaymentAlerts from '../../components/common/PaymentAlerts';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import { RecordedBy } from '../../components/collections/CollectionBadges';
import OverdueCustomersPanel from '../../components/collections/OverdueCustomersPanel';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import { dateTime, money } from '../../utils/formatters';

// loading: grey placeholder bar until the figure arrives (never a misleading "₹0").
// quiet: secondary counts (no border, soft background, smaller number) so the
// money figures above them carry the weight.
const Stat = ({ label, value, accent = false, loading = false, quiet = false }) => (quiet ? (
  <Paper p="sm" radius="md" bg="gray.1">
    <Text size="xs" c="dimmed">{label}</Text>
    {loading ? <Skeleton height={20} width={60} mt={6} mb={2} radius="sm" /> : <Text fw={700} fz={20}>{value}</Text>}
  </Paper>
) : (
  <Paper withBorder p="md" bg={accent ? 'green.0' : undefined}>
    <Text size="sm" c="dimmed">{label}</Text>
    {loading ? <Skeleton height={28} width={130} mt={8} mb={4} radius="sm" /> : <Title order={2} mt={4}>{value}</Title>}
  </Paper>
));

const CUSTOMER_TYPES = [
  { value: 'distributor', label: 'Distributor' },
  { value: 'chemist', label: 'Chemist' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'other', label: 'Other' },
];

/** onOpenCustomer: ({ id, name }) => open that customer's ledger (Customers tab). */
export default function AdminDashboard({ onOpenCustomer }) {
  const dispatch = useAppDispatch();
  const { dashboard, alerts, alertCount, alertsLoading, dashFilters, error: statsError } = useAppSelector((state) => state.admin);
  // Placeholders until the first real figures arrive (the store starts with
  // zeros that have no invoice count); later reloads keep the numbers on screen.
  const statsPending = dashboard?.total_invoices === undefined && !statsError;
  const isMobile = useIsMobile();
  const [alertPage, setAlertPage] = useState(1);
  const [appliedCustomerType, setAppliedCustomerType] = useState('');
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  // Rows open the invoice panel (summary, Record collection, history).
  const [openId, setOpenId] = useState(null); const [recording, setRecording] = useState(null); const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = {};
    if (dashFilters.dateFrom) params.date_from = dashFilters.dateFrom;
    if (dashFilters.dateTo) params.date_to = dashFilters.dateTo;
    if (appliedCustomerType) params.customer_type = appliedCustomerType;
    dispatch(fetchAdminDashboard(params));
    adminApi.getRecentPayments().then(setRecent).catch((err) => setError(err.detail || err.message));
  }, [dispatch, dashFilters.dateFrom, dashFilters.dateTo, appliedCustomerType, refreshKey]);


  useEffect(() => {
    dispatch(fetchOutstandingAlerts({ threshold: 50000, limit: PAGE_SIZE, offset: (alertPage - 1) * PAGE_SIZE }));
  }, [dispatch, alertPage, refreshKey]);

  const range = { from: dashFilters.dateFrom || '', to: dashFilters.dateTo || '' };
  const setRange = (next) => dispatch(setDashFilters({ dateFrom: next.from || null, dateTo: next.to || null }));
  const rangeLabel = describeRange(range);
  const chips = [
    rangeLabel && { key: 'range', label: `Dates: ${rangeLabel}`, onRemove: () => setRange(EMPTY_RANGE) },
    appliedCustomerType && { key: 'type', label: `Customer type: ${CUSTOMER_TYPES.find((t) => t.value === appliedCustomerType)?.label}`, onRemove: () => setAppliedCustomerType('') },
  ];
  const reset = () => { setRange(EMPTY_RANGE); setAppliedCustomerType(''); };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="end">
        <div><Title order={1}>Dashboard</Title><Text c="dimmed">Sales, collections, and balances at a glance.</Text></div>
        <Badge variant="light" size="lg">Admin view</Badge>
      </Group>

      <FilterBar chips={chips} onReset={reset} summary={rangeLabel ? null : 'Showing all time'}>
        <DateRangeFilter label="Dates" value={range} onChange={setRange} allLabel="All time" />
        <FilterSelect placeholder="All customer types" icon={<IconCategory size={16} />} data={CUSTOMER_TYPES} value={appliedCustomerType} onChange={setAppliedCustomerType} />
      </FilterBar>

      {error && <Alert color="red">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Stat loading={statsPending} label="Tally sales" value={money(dashboard?.total_sales)} accent />
        <Stat loading={statsPending} label="Collected in selected dates" value={money(dashboard?.collected)} />
        <Stat loading={statsPending} label="Outstanding on selected invoices" value={money(dashboard?.outstanding)} />
      </SimpleGrid>
      <SimpleGrid cols={3} spacing="sm">
        <Stat quiet loading={statsPending} label="Paid invoices" value={dashboard?.paid ?? 0} />
        <Stat quiet loading={statsPending} label="Partially paid" value={dashboard?.partial ?? 0} />
        <Stat quiet loading={statsPending} label="Unpaid invoices" value={dashboard?.unpaid ?? 0} />
      </SimpleGrid>

      <Paper withBorder p="md"><PaymentAlerts /></Paper>

      {/* Wide screens: the two follow-up lists sit side by side to cut scrolling. */}
      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md" style={{ alignItems: 'start' }}>
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <div><Title order={3}>Outstanding above ₹50,000</Title><Text size="sm" c="dimmed">Invoices that may need follow up.</Text></div>
          <Badge>{alertCount}</Badge>
        </Group>
        {alertsLoading ? <Group justify="center" p="lg"><Loader /></Group> : !alerts.length ? <Text c="dimmed" py="md">No high outstanding balances.</Text> : (
          isMobile ? <Stack gap={0}>{alerts.map((item, index) => (
            <Group key={`${item.invoice_number}-${index}`} justify="space-between" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', cursor: item.invoice_id ? 'pointer' : undefined }} onClick={item.invoice_id ? () => setOpenId(item.invoice_id) : undefined}>
              <div style={{ minWidth: 0 }}><Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{item.customer || '—'}</Text><Text size="xs" c="dimmed">{item.invoice_number} · {item.mr || 'Unassigned'}</Text></div>
              <Text fw={700} c="red" style={{ whiteSpace: 'nowrap' }}>{money(item.pending_amount)}</Text>
            </Group>
          ))}</Stack> :           <Table.ScrollContainer minWidth={480}>
            <Table striped>
              <Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>MR</Table.Th><Table.Th>Outstanding</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{alerts.map((item, index) => (
                <Table.Tr key={`${item.invoice_number}-${index}`} onClick={item.invoice_id ? () => setOpenId(item.invoice_id) : undefined} style={item.invoice_id ? { cursor: 'pointer' } : undefined}>
                  <Table.Td>{item.customer || '—'}</Table.Td><Table.Td fw={600}>{item.invoice_number}</Table.Td><Table.Td>{item.mr || '—'}</Table.Td><Table.Td fw={700} c="red">{money(item.pending_amount)}</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <ListPagination total={alertCount} page={alertPage} onChange={setAlertPage} label="invoices" />
      </Paper>

      <OverdueCustomersPanel load={adminApi.getOverdueAlerts} showMr description="From invoice date; reminders repeat every two days while the balance remains unpaid." onSelect={onOpenCustomer ? (row) => onOpenCustomer({ id: row.customer_id, name: row.customer }) : undefined} tableMinWidth={540} />
      </SimpleGrid>

      <Paper withBorder p="md">
        <Title order={3} mb="sm">Recent collections</Title>
        {recent.length && isMobile ? (
          <Stack gap={0}>{recent.map((item) => (
            <Group key={item.payment_id} justify="space-between" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', cursor: 'pointer' }} onClick={() => setOpenId(item.invoice_id)}>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>{item.invoice_number} · {item.customer_name || '—'}</Text>
                <Group gap={6} c="dimmed" fz="xs" wrap="nowrap"><RecordedBy row={item} /></Group>
                <Text size="xs" c="dimmed">{dateTime(item.payment_date)}</Text>
              </div>
              <Text fw={700} c={item.is_reversal ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{item.is_reversal ? '−' : ''}{money(Math.abs(item.amount))}</Text>
            </Group>
          ))}</Stack>
        ) : recent.length ? (
          <Table.ScrollContainer minWidth={600}>
            <Table striped>
              <Table.Thead><Table.Tr><Table.Th>When</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th>Amount</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{recent.map((item) => (
                <Table.Tr key={item.payment_id} onClick={() => setOpenId(item.invoice_id)} style={{ cursor: 'pointer' }}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{dateTime(item.payment_date)}</Table.Td>
                  <Table.Td>{item.customer_name || '—'}</Table.Td><Table.Td fw={600}>{item.invoice_number}</Table.Td><Table.Td><RecordedBy row={item} /></Table.Td><Table.Td fw={700} c={item.is_reversal ? 'orange.8' : undefined}>{item.is_reversal ? '−' : ''}{money(Math.abs(item.amount))}</Table.Td>
                </Table.Tr>
              ))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : <Text c="dimmed" py="md">No collections recorded yet.</Text>}
      </Paper>
      <InvoiceHistory invoiceId={openId} onClose={() => setOpenId(null)} onChanged={() => setRefreshKey((v) => v + 1)} onRecord={setRecording} refreshKey={refreshKey} />
      <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={() => setRefreshKey((v) => v + 1)} />
    </Stack>
  );
}
