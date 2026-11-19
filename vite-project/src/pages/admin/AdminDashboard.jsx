import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Avatar, Badge, Button, Group, Loader, Paper, Popover, SimpleGrid, Skeleton, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCategory, IconChartBar, IconDownload, IconInfoCircle, IconReceipt } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import GreetingBanner from '../../components/common/GreetingBanner';
import { fetchAdminDashboard, fetchOutstandingAlerts, setDashFilters } from '../../store/slices/adminSlice';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { datePresets, describeRange } from '../../components/filters/dateRanges';
import { recorderOf, useActorLabel } from '../../components/collections/collectionUtils';
import { useCountUp } from '../../hooks/useCountUp';
import css from './AdminDashboard.module.css';
import { ZoneHeading } from '../../components/common/DashboardParts';
import OverdueCustomersPanel from '../../components/collections/OverdueCustomersPanel';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import { dateTime, downloadErrorText, money, saveDownload } from '../../utils/formatters';
import { useAppRefresh } from '../../hooks/useAppRefresh';

/** ₹ smaller and lighter than the digits; counts up when the figure arrives. */
function Amount({ value, size = 26, color, animate = true }) {
  const end = Number(value || 0);
  const shown = useCountUp(animate ? end : 0);
  // Whole rupees while counting; the exact figure (with paise) once it lands.
  const n = !animate || shown === end ? end : Math.round(shown);
  return (
    <Text className={css.amount} fz={size} c={color}>
      <span className={css.rupee}>₹</span>{n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
    </Text>
  );
}

// Money cards: the same figure size on all three. Tally sales sits on a soft
// green card; Collected in green, Pending in red.
const SALES_CARD = { background: 'var(--app-sales-bg)', borderColor: 'var(--app-sales-line)' };
const Stat = ({ label, value, dot, color, sales = false, loading = false, note }) => (
  <Paper p="md" className={css.card} h="100%" style={sales ? SALES_CARD : undefined}>
    <div className={css.label} style={sales ? { color: 'var(--app-sales-label)', fontWeight: 500 } : undefined}>{dot && <span className={css.dot} style={{ background: dot }} />}{label}</div>
    {loading ? <Skeleton height={32} width={150} mt={8} mb={4} radius="sm" /> : <Amount value={value} size={30} color={color} />}
    {!loading && note}
  </Paper>
);

/** What customers owe today: not yet due vs overdue (past 40 days' credit; 60 for distributors). */
const owedSplit = (d) => (d && d.owed !== undefined ? (
  <div className={css.split}>
    <div><span>Not yet due</span><b>{money(d.owed_not_due)}</b></div>
    <div><span>Overdue</span><b className={css.overdue}>{money(d.owed_overdue)}</b></div>
  </div>
) : null);

/** One bar for what's owed today: green = not yet due, red = overdue. */
function OwedBar({ d, loading }) {
  const owed = Number(d?.owed || 0);
  const late = Number(d?.owed_overdue || 0);
  const pct = owed > 0 ? Math.round((late / owed) * 100) : 0;
  return (
    <Paper p="md" className={css.card}>
      <Text size="sm" c="dimmed" mb={8}>
        {loading ? '—' : owed > 0
          ? <><Text span fw={700} fz="md" c={late > 0 ? 'red.7' : 'green.8'} className={css.num}>{pct}%</Text> of what customers owe you is overdue</>
          : 'Nobody owes you anything right now'}
      </Text>
      <div className={css.owedBar} aria-label={`${pct}% of outstanding is overdue`}>
        {owed > 0 && <><i style={{ width: `${100 - pct}%`, background: 'var(--mantine-color-green-6)' }} /><i style={{ width: `${pct}%`, background: 'var(--mantine-color-red-6)' }} /></>}
      </div>
      {/* Key: which colour is which. */}
      {owed > 0 && (
        <Group gap={14} mt={8} wrap="wrap">
          <Text fz={12} c="dimmed"><span className={css.keyDot} style={{ background: 'var(--mantine-color-green-6)' }} />Not yet due <b className={css.num} style={{ color: 'var(--mantine-color-text)' }}>{money(owed - late)}</b></Text>
          <Group gap={4} wrap="nowrap">
            <Text fz={12} c="dimmed"><span className={css.keyDot} style={{ background: 'var(--mantine-color-red-6)' }} />Overdue <b className={css.num} style={{ color: 'var(--mantine-color-red-7)' }}>{money(late)}</b></Text>
            {/* The credit rule, on hover or tap. */}
            <Popover withArrow position="top" shadow="md" width={230}>
              <Popover.Target><ActionIcon variant="subtle" color="gray" size={18} radius="xl" aria-label="What counts as overdue"><IconInfoCircle size={14} /></ActionIcon></Popover.Target>
              <Popover.Dropdown><Text fz={12}>Overdue = unpaid after 40 days of credit (60 for distributors).</Text></Popover.Dropdown>
            </Popover>
          </Group>
        </Group>
      )}
    </Paper>
  );
}

/** Who recorded a collection, with an initials circle (faces/colours are read faster than names). */
function Recorder({ row }) {
  const label = useActorLabel()(recorderOf(row));
  return (
    <Group gap={8} wrap="nowrap">
      <Avatar size={24} radius="xl" name={label} color="initials" />
      <Text size="sm" truncate>{label}</Text>
    </Group>
  );
}

const CUSTOMER_TYPES = [
  { value: 'distributor', label: 'Distributor' },
  { value: 'chemist', label: 'Chemist' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'other', label: 'Other' },
];

/** onOpenCustomer: ({ id, name }) => open that customer's ledger (Customers tab). */
export default function AdminDashboard({ onOpenCustomer }) {
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const dispatch = useAppDispatch();
  const { dashboard, alerts, alertCount, alertsLoading, dashFilters, error: statsError } = useAppSelector((state) => state.admin);
  // Placeholders until the first real figures arrive (the store starts with
  // zeros that have no invoice count); later reloads keep the numbers on screen.
  const statsPending = dashboard?.total_invoices === undefined && !statsError;
  const isMobile = useIsMobile();
  const [alertPage, setAlertPage] = useState(1);
  const [appliedCustomerType, setAppliedCustomerType] = useState('');
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [error, setError] = useState('');
  // Rows open the invoice panel (summary, Collect, history).
  const [openId, setOpenId] = useState(null); const [recording, setRecording] = useState(null); const [refreshKey, setRefreshKey] = useState(0);

  const liveMonth = datePresets().find((p) => p.id === 'month');
  const rangeFrom = dashFilters.thisMonth ? liveMonth.from : (dashFilters.dateFrom || '');
  const rangeTo = dashFilters.thisMonth ? liveMonth.to : (dashFilters.dateTo || '');

  useEffect(() => {
    const params = {};
    if (rangeFrom) params.date_from = rangeFrom;
    if (rangeTo) params.date_to = rangeTo;
    if (appliedCustomerType) params.customer_type = appliedCustomerType;
    dispatch(fetchAdminDashboard(params));
    adminApi.getRecentPayments().then(setRecent).catch((err) => setError(err.detail || err.message)).finally(() => setRecentLoading(false));
  }, [dispatch, rangeFrom, rangeTo, appliedCustomerType, refreshKey, appRefresh]);


  useEffect(() => {
    dispatch(fetchOutstandingAlerts({ threshold: 50000, limit: PAGE_SIZE, offset: (alertPage - 1) * PAGE_SIZE }));
  }, [dispatch, alertPage, refreshKey, appRefresh]);

  // "This month" is worked out on every render, so a dashboard left open
  // past midnight (or into a new month) keeps showing the current month.
  const thisMonth = datePresets().find((p) => p.id === 'month');
  const range = dashFilters.thisMonth ? { from: thisMonth.from, to: thisMonth.to } : { from: dashFilters.dateFrom || '', to: dashFilters.dateTo || '' };
  const backToThisMonth = () => dispatch(setDashFilters({ dateFrom: null, dateTo: null, thisMonth: true }));
  // Picking "This month" in the list is the same as the default (stays current).
  const setRange = (next) => (next.from === thisMonth.from && next.to === thisMonth.to
    ? backToThisMonth()
    : dispatch(setDashFilters({ dateFrom: next.from || null, dateTo: next.to || null, thisMonth: false })));
  const rangeLabel = describeRange(range, { business: true });
  // Opens on "This month" (1st of the month till today); the chip and Reset
  // only show once something else is picked, and take it back to this month.
  const onDefault = range.from === thisMonth.from && range.to === thisMonth.to;
  const chips = [
    !onDefault && { key: 'range', label: `Dates: ${rangeLabel || 'All time'}`, onRemove: backToThisMonth },
    appliedCustomerType && { key: 'type', label: `Customer type: ${CUSTOMER_TYPES.find((t) => t.value === appliedCustomerType)?.label}`, onRemove: () => setAppliedCustomerType('') },
  ];
  const reset = () => { backToThisMonth(); setAppliedCustomerType(''); };
  // Excel: Summary by customer type + one sheet per type, for the dates and type picked above.
  const [exporting, setExporting] = useState(false);
  const exportByType = async () => {
    setExporting(true); setError('');
    try {
      saveDownload(await adminApi.exportByCustomerType({
        ...(range.from && { date_from: range.from }),
        ...(range.to && { date_to: range.to }),
        ...(appliedCustomerType && { customer_type: appliedCustomerType }),
      }), 'customers-by-type.xlsx');
    } catch (err) { setError(await downloadErrorText(err)); }
    finally { setExporting(false); }
  };

  const filtersOn = chips.some(Boolean);
  const showHigh = (alertsLoading && !alerts.length) || alertCount > 0;
  const zoneTitle = `${rangeLabel || 'All time'}${appliedCustomerType ? ` · ${CUSTOMER_TYPES.find((t) => t.value === appliedCustomerType)?.label}` : ''}`;
  const th = { className: css.th };
  const signed = (item) => (
    <Text span fw={700} className={css.num} c={item.is_reversal ? 'orange.8' : 'green.8'} style={{ whiteSpace: 'nowrap' }}>
      {item.is_reversal ? '−' : '+'}{money(Math.abs(item.amount))}
    </Text>
  );

  return (
    <Stack gap={28}>
      <GreetingBanner />

      {/* Flat filter row; Reset appears only once a filter is on. */}
      <FilterBar compact chips={chips} onReset={filtersOn ? reset : undefined}>
        <DateRangeFilter label="Dates" value={range} onChange={setRange} allLabel="All time" months firstDate={dashboard?.first_invoice_date} />
        <FilterSelect placeholder="All customer types" icon={<IconCategory size={16} />} data={CUSTOMER_TYPES} value={appliedCustomerType} onChange={setAppliedCustomerType} />
      </FilterBar>

      {error && <Alert color="red">{error}</Alert>}

      {/* Overview: Tally sales first (top-left, where the eye lands first), then Collected and what's owed today. */}
      <Stack gap={12}>
        <ZoneHeading icon={IconChartBar} tone="green" title="Overview" meta={zoneTitle}>
          {isMobile
            ? <Tooltip label="Export to Excel" withArrow><ActionIcon variant="default" size="lg" aria-label="Export to Excel" loading={exporting} onClick={exportByType}><IconDownload size={16} /></ActionIcon></Tooltip>
            : <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exporting} onClick={exportByType}>Export</Button>}
        </ZoneHeading>
        <SimpleGrid cols={{ base: 2, md: 3 }} spacing="sm">
          <div style={{ gridColumn: isMobile ? 'span 2' : undefined }}>
            <Stat sales loading={statsPending} label="Tally sales" color="var(--app-sales-value)" value={dashboard?.total_sales} />
          </div>
          <Stat loading={statsPending} label="Collected" dot="var(--mantine-color-green-7)" color="green.8" value={dashboard?.collected} />
          <Stat loading={statsPending} label="Outstanding today" dot="var(--mantine-color-red-6)" color="red.7" value={dashboard?.owed} note={owedSplit(dashboard)} />
        </SimpleGrid>
        <OwedBar loading={statsPending} d={dashboard} />
      </Stack>

      {/* Needs attention: red only here, where action is needed. */}
      <Stack gap={12}>
        <ZoneHeading icon={IconAlertTriangle} tone="red" title="Needs attention" />
        {/* One below the other at full width: two side by side left a big
            empty space under the shorter list. */}
        <SimpleGrid cols={1} spacing="sm">
          {showHigh && (
            <Paper p="md" className={css.card}>
              <Group justify="space-between" mb="sm" wrap="nowrap">
                <div><Text className={css.cardTitle}>Pending above ₹50,000</Text><Text size="sm" c="dimmed">May need follow up</Text></div>
                <Badge color="red" variant="light">{alertCount}</Badge>
              </Group>
              {/* Spinner only on the first load; the 20 s quiet refresh swaps rows in place. */}{alertsLoading && !alerts.length ? <Group justify="center" p="lg"><Loader size="sm" /></Group> : (
                isMobile ? <Stack gap={0}>{alerts.map((item, index) => (
                  <Group key={`${item.invoice_number}-${index}`} justify="space-between" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--app-line)', cursor: item.invoice_id ? 'pointer' : undefined }} onClick={item.invoice_id ? () => setOpenId(item.invoice_id) : undefined}>
                    <div style={{ minWidth: 0 }}><Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{item.customer || '—'}</Text><Text size="xs" c="dimmed">{item.invoice_number} · {item.mr || 'Unassigned'}</Text></div>
                    <Text fw={700} c="red.7" className={css.num} style={{ whiteSpace: 'nowrap' }}>{money(item.pending_amount)}</Text>
                  </Group>
                ))}</Stack> : <Table.ScrollContainer minWidth={480}>
                  <Table highlightOnHover verticalSpacing="xs">
                    <Table.Thead><Table.Tr><Table.Th {...th}>Customer</Table.Th><Table.Th {...th}>Invoice</Table.Th><Table.Th {...th}>MR</Table.Th><Table.Th {...th} ta="right">Pending</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>{alerts.map((item, index) => (
                      <Table.Tr key={`${item.invoice_number}-${index}`} onClick={item.invoice_id ? () => setOpenId(item.invoice_id) : undefined} style={item.invoice_id ? { cursor: 'pointer' } : undefined}>
                        <Table.Td fw={600}>{item.customer || '—'}</Table.Td><Table.Td c="dimmed">{item.invoice_number}</Table.Td><Table.Td>{item.mr || '—'}</Table.Td><Table.Td ta="right" fw={700} c="red.7" className={css.num}>{money(item.pending_amount)}</Table.Td>
                      </Table.Tr>
                    ))}</Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
              <ListPagination total={alertCount} page={alertPage} onChange={setAlertPage} label="invoices" />
            </Paper>
          )}
          <OverdueCustomersPanel refined cardClass={css.card} headerClass={css.th} load={adminApi.getOverdueAlerts} showMr onSelect={onOpenCustomer ? (row) => onOpenCustomer({ id: row.customer_id, name: row.customer }) : undefined} tableMinWidth={540} />
        </SimpleGrid>
      </Stack>

      {/* Activity: money coming in reads as "+₹", like a bank credit. */}
      <Stack gap={12}>
        <ZoneHeading icon={IconReceipt} tone="blue" title="Activity" />
        <Paper p="md" className={css.card}>
          <Text className={css.cardTitle} mb="sm">Recent collections</Text>
          {recentLoading && !recent.length ? (
            <Stack gap={10}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={22} radius="sm" />)}</Stack>
          ) : recent.length && isMobile ? (
            <Stack gap={0}>{recent.map((item) => (
              <Group key={item.payment_id} justify="space-between" wrap="nowrap" gap="sm" py="xs" style={{ borderTop: '1px solid var(--app-line)', cursor: 'pointer' }} onClick={() => setOpenId(item.invoice_id)}>
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Avatar size={30} radius="xl" name={item.customer_name || '?'} color="initials" />
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{item.customer_name || '—'}</Text>
                    <Text size="xs" c="dimmed" truncate>{item.invoice_number} · {dateTime(item.payment_date)}</Text>
                  </div>
                </Group>
                {signed(item)}
              </Group>
            ))}</Stack>
          ) : recent.length ? (
            <Table.ScrollContainer minWidth={600}>
              <Table highlightOnHover verticalSpacing="xs">
                <Table.Thead><Table.Tr><Table.Th {...th}>When</Table.Th><Table.Th {...th}>Customer</Table.Th><Table.Th {...th}>Invoice</Table.Th><Table.Th {...th}>Recorded by</Table.Th><Table.Th {...th} ta="right">Amount</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{recent.map((item) => (
                  <Table.Tr key={item.payment_id} onClick={() => setOpenId(item.invoice_id)} style={{ cursor: 'pointer' }}>
                    <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>{dateTime(item.payment_date)}</Table.Td>
                    <Table.Td>{item.customer_name || '—'}</Table.Td><Table.Td fw={600}>{item.invoice_number}</Table.Td><Table.Td><Recorder row={item} /></Table.Td><Table.Td ta="right">{signed(item)}</Table.Td>
                  </Table.Tr>
                ))}</Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : <Text c="dimmed" py="md">No collections recorded yet.</Text>}
        </Paper>
      </Stack>
      <InvoiceHistory invoiceId={openId} onClose={() => setOpenId(null)} onChanged={() => setRefreshKey((v) => v + 1)} onRecord={setRecording} refreshKey={refreshKey} />
      <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={() => setRefreshKey((v) => v + 1)} />
    </Stack>
  );
}
