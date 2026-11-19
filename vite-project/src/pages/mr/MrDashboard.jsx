import { useEffect, useState } from 'react';
import { Button, Grid, Group, Loader, Paper, Stack, Table, Text } from '@mantine/core';
// Disabled: Add Invoice button. Re-enable if needed.
// import { IconUpload } from '@tabler/icons-react';
import { IconAlertTriangle, IconArrowRight, IconChartBar, IconReceipt } from '@tabler/icons-react';
import { CollectionBar, ZoneHeading } from '../../components/common/DashboardParts';
import SectionNav from '../../components/common/SectionNav';
import partsCss from '../../components/common/DashboardParts.module.css';
import tableCss from '../admin/AdminDashboard.module.css';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchMrDashboard, fetchMrOutstanding } from '../../store/slices/mrSlice';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import OverdueCustomersPanel from '../../components/collections/OverdueCustomersPanel';
import InvoiceCard from '../../components/collections/InvoiceCard';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import { CardList } from '../../components/common/RowCard';
import GreetingBanner from '../../components/common/GreetingBanner';
import { mrApi } from '../../api/mrApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { money, shortDate } from '../../utils/formatters';
import { useAppRefresh } from '../../hooks/useAppRefresh';

// Secondary counts: quiet tiles (no border, soft background, smaller number)
// so the Outstanding figure and its action stand out.
const Metric = ({ label, value, color }) => <Paper p="sm" h="100%" bg="var(--app-soft-2)" radius="md"><Text size="xs" c="dimmed">{label}</Text><Text fw={700} c={color} fz={{ base: 20, sm: 22 }} style={{ whiteSpace: 'nowrap' }}>{value}</Text></Paper>;

/**
 * MR Home. Same figures and data as before; recent invoices and overdue
 * customers now open straight to the invoice / the customer's ledger.
 *
 * onOpenPending:  go to Invoices on the Pending tab
 * onOpenCustomer: ({ id, name }) => open that customer's ledger
 */
// "Jump to section": chips on phone, dots on laptop.
const MR_HOME_SECTIONS = [
  { id: 'mr-overview', label: 'Overview' },
  { id: 'mr-attention', label: 'Needs attention' },
  { id: 'mr-activity', label: 'Activity' },
];

export default function MrDashboard({ onOpenPending, onOpenCustomer } /* Disabled: onNavigateToUpload */) {
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const dispatch = useAppDispatch(); const { dashboard, totalOutstanding, outstandingLoaded, loading } = useAppSelector((state) => state.mr);
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState(null); const [historyKey, setHistoryKey] = useState(0); const [recording, setRecording] = useState(null);
  useEffect(() => { dispatch(fetchMrDashboard()); dispatch(fetchMrOutstanding({ limit: 1, offset: 0 })); }, [dispatch, appRefresh]);
  const onSaved = () => { dispatch(fetchMrDashboard()); dispatch(fetchMrOutstanding({ limit: 1, offset: 0 })); setHistoryKey((v) => v + 1); };
  const recent = dashboard?.recent || [];

  const th = { className: tableCss.th };
  return <Stack gap={28}><SectionNav watch={Boolean(dashboard)} sections={MR_HOME_SECTIONS} /><Group justify="space-between"><div style={{ flex: 1, minWidth: 0 }}><GreetingBanner name={dashboard?.name} /></div>{/* Disabled: Add Invoice. Re-enable if needed. <Button leftSection={<IconUpload size={16} />} onClick={onNavigateToUpload}>Upload invoice</Button> */}</Group>
    <Stack gap={12} id="mr-overview" data-section>
    <ZoneHeading icon={IconChartBar} tone="green" title="Overview" meta="All time" />
    {/* Phones: the money figure gets its own full row (so it never wraps) and
        comes first; the three counts share one row. Desktop: four in a row. */}
    <Grid gutter="sm" align="stretch">
      {/* The main figure and the main action share one prominent block. */}
      <Grid.Col span={{ base: 12, lg: 6 }}>
        <Paper p="md" radius="md" bg="green.8" c="white" h="100%">
          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
            <div>
              <Text size="sm" c="green.1">Pending</Text>
              <Text fw={800} fz={{ base: 28, sm: 32 }} lh={1.15} style={{ whiteSpace: 'nowrap' }}>{money(totalOutstanding)}</Text>
            </div>
            {onOpenPending && <Button variant="white" color="green.9" size="md" fullWidth={isMobile} rightSection={<IconArrowRight size={16} />} onClick={onOpenPending}>See pending invoices</Button>}
          </Group>
        </Paper>
      </Grid.Col>
      <Grid.Col span={{ base: 4, lg: 2 }}><Metric label="Invoices" value={dashboard?.total_invoices || 0} /></Grid.Col>
      <Grid.Col span={{ base: 4, lg: 2 }}><Metric label="Paid" value={dashboard?.paid || 0} color="green.8" /></Grid.Col>
      <Grid.Col span={{ base: 4, lg: 2 }}><Metric label="Pending" value={(dashboard?.partial || 0) + (dashboard?.unpaid || 0)} color="orange.8" /></Grid.Col>
    </Grid>
    {/* Same bar as the Admin dashboard: share of this MR's invoice value collected. */}
    <CollectionBar loading={!dashboard || !outstandingLoaded} billed={dashboard?.total_amount} pending={totalOutstanding} paid={dashboard?.paid || 0} partial={dashboard?.partial || 0} unpaid={dashboard?.unpaid || 0} label="of your invoices collected" />
    </Stack>
    <Stack gap={12} id="mr-attention" data-section>
    <ZoneHeading icon={IconAlertTriangle} tone="red" title="Needs attention" />
    <OverdueCustomersPanel refined cardClass={partsCss.card} headerClass={tableCss.th} load={mrApi.getOverdueAlerts} emptyText="None of your customers have overdue bills (unpaid past 40 days; 60 for distributors)." onSelect={onOpenCustomer ? (row) => onOpenCustomer({ id: row.customer_id, name: row.customer }) : undefined} />
    </Stack>
    <Stack gap={12} id="mr-activity" data-section>
    <ZoneHeading icon={IconReceipt} tone="blue" title="Activity" />
    <Paper p="md" className={partsCss.card}><Text fw={600} fz={14} c="var(--app-text-2)" mb="sm">Recent invoices</Text>{loading && !dashboard ? <Group justify="center" p="lg"><Loader /></Group> : !recent.length ? <Text c="dimmed" py="md">No invoices assigned to you yet.</Text> : isMobile ? <CardList>{recent.map((invoice, index) => (
      <InvoiceCard key={invoice.invoice_id ?? `${invoice.invoice_number}-${index}`} invoice={invoice} onOpen={invoice.invoice_id ? () => setOpenId(invoice.invoice_id) : undefined} />
    ))}</CardList> : <Table.ScrollContainer minWidth={760}><Table highlightOnHover verticalSpacing="xs"><Table.Thead><Table.Tr><Table.Th {...th}>Invoice</Table.Th><Table.Th {...th}>Date</Table.Th><Table.Th {...th}>Customer</Table.Th><Table.Th {...th} ta="right">Amount</Table.Th><Table.Th {...th} ta="right">Pending</Table.Th><Table.Th {...th}>Status</Table.Th><Table.Th {...th}>Recorded by</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{recent.map((invoice, index) => <Table.Tr key={invoice.invoice_id ?? `${invoice.invoice_number}-${index}`} onClick={invoice.invoice_id ? () => setOpenId(invoice.invoice_id) : undefined} style={invoice.invoice_id ? { cursor: 'pointer' } : undefined}><Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.invoice_date)}</Table.Td><Table.Td>{invoice.customer || '—'}</Table.Td><Table.Td ta="right">{money(invoice.total_amount)}</Table.Td><Table.Td ta="right" fw={600} c={Number(invoice.pending_amount) > 0 ? 'red' : 'green'}>{money(invoice.pending_amount)}</Table.Td><Table.Td><StatusCell row={invoice} /></Table.Td><Table.Td maw={200}><RecordedBy row={invoice} /></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}</Paper>
    </Stack>
    <InvoiceHistory invoiceId={openId} onClose={() => setOpenId(null)} onRecord={(invoice) => setRecording(invoice)} refreshKey={historyKey} />
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={onSaved} />
  </Stack>;
}
