import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Anchor, Badge, Button, Group, Loader, Menu, Paper, SimpleGrid, Stack, Table, Tabs, Text } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconCash, IconDots, IconEdit } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import TitleBar from '../../components/common/TitleBar';
import StatCard from '../../components/common/StatCard';
import TableScroll from '../../components/common/TableScroll';
import { CardList } from '../../components/common/RowCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import ContactActions from '../../components/customers/ContactActions';
import LedgerShareButton from '../../components/customers/LedgerShareButton';
import EditCustomerModal from '../../components/customers/EditCustomerModal';
import CustomerCollectModal from '../../components/collections/CustomerCollectModal';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { ReversedBadge, StatusCell } from '../../components/collections/CollectionBadges';
import { TrendChart } from '../../components/insights/charts';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { errorText, money, shortDate } from '../../utils/formatters';
import { rule } from '../../utils/marginCalc';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso) => { const [y, m] = String(iso).split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const swatch = (bg, extra) => <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: bg, margin: '0 5px -1px 0', ...extra }} />;
const legend = (
  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
    {swatch('var(--app-pending)', { border: '1px solid var(--app-pending-line)' })}Bought {swatch('#2f9e44', { marginLeft: 8 })}Paid so far {swatch('#1c7ed6', { width: 12, height: 3, marginLeft: 8, verticalAlign: 3 })}Collections
  </Text>
);

/** Ledger: bills (debit) and payments (credit), newest first, with the balance after each. */
function LedgerTab({ rows: all, count, isMobile, onOpen }) {
  const [page, setPage] = useState(1);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (!all.length) return <Text ta="center" c="dimmed" py="xl">No bills or payments yet.</Text>;
  const what = (r) => (r.kind === 'bill' ? `Invoice ${r.ref}` : r.kind === 'reversal' ? `Payment reversed · ${r.ref || ''}` : `Payment${r.mode ? ` · ${r.mode}` : ''} · ${r.ref || ''}`);
  const more = <>
    <ListPagination total={all.length} page={page} onChange={setPage} label="entries" />
    {count > all.length && <Text size="xs" c="dimmed" ta="center" mt="sm">Showing the latest {all.length} of {count}. Download the ledger for the full statement.</Text>}
  </>;
  if (isMobile) {
    return (
      <>
        <CardList>{rows.map((r, idx) => (
          <Paper key={idx} withBorder p="sm" radius="md" onClick={() => r.invoice_id && onOpen(r.invoice_id)} style={{ cursor: 'pointer' }}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>{what(r)}</Text>
                <Text size="xs" c="dimmed">{shortDate(r.date)}</Text>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text size="sm" fw={700} c={r.credit ? 'green.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{r.credit ? `− ${money(r.credit)}` : `+ ${money(r.debit)}`}</Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>Balance {money(r.balance)}</Text>
              </div>
            </Group>
          </Paper>
        ))}</CardList>
        {more}
      </>
    );
  }
  return (
    <>
      <TableScroll minWidth={640}>
        <Table miw={640} verticalSpacing="xs" highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Particulars</Table.Th><Table.Th ta="right">Bill (Dr)</Table.Th><Table.Th ta="right">Paid (Cr)</Table.Th><Table.Th ta="right">Balance</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{rows.map((r, idx) => (
            <Table.Tr key={idx} onClick={() => r.invoice_id && onOpen(r.invoice_id)} style={{ cursor: 'pointer' }}>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(r.date)}</Table.Td>
              <Table.Td>{what(r)}{r.kind === 'reversal' && <> <ReversedBadge /></>}</Table.Td>
              <Table.Td ta="right">{r.debit ? money(r.debit) : ''}</Table.Td>
              <Table.Td ta="right" c="green.8">{r.credit ? money(r.credit) : ''}</Table.Td>
              <Table.Td ta="right" fw={600}>{money(r.balance)}</Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </TableScroll>
      {more}
    </>
  );
}

/** Invoices: pending first (oldest first), then paid; open one or collect. */
function InvoicesTab({ customerId, customerType, isMobile, refreshKey, onOpen, onCollect }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ key: '', data: null, error: '' });
  const key = `${customerId}:${page}:${refreshKey}`;
  useEffect(() => {
    let live = true;
    customersApi.getCustomerLedger(customerId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((data) => live && setState({ key, data, error: '' }))
      .catch((err) => live && setState({ key, data: null, error: errorText(err, 'Could not load invoices.') }));
    return () => { live = false; };
  }, [customerId, page, key]);
  const data = state.data;
  if (state.error) return <Alert color="red">{state.error}</Alert>;
  if (!data) return <Group justify="center" p="xl"><Loader size="sm" /></Group>;
  if (!data.invoices.length) return <Text ta="center" c="dimmed" py="xl">No invoices yet.</Text>;
  return (
    <>
      {isMobile ? (
        <CardList>{data.invoices.map((invoice) => (
          <InvoiceCard key={invoice.invoice_id} invoice={invoice} customerType={customerType} showCustomer={false} onOpen={() => onOpen(invoice.invoice_id)} onCollect={onCollect} />
        ))}</CardList>
      ) : (
        <TableScroll minWidth={640}>
          <Table miw={640} verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>{data.invoices.map((invoice) => (
              <Table.Tr key={invoice.invoice_id} onClick={() => onOpen(invoice.invoice_id)} style={{ cursor: 'pointer' }}>
                <Table.Td fw={600} style={{ whiteSpace: 'nowrap' }}>{invoice.invoice_number}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.date)}</Table.Td>
                <Table.Td ta="right">{money(invoice.amount)}</Table.Td>
                <Table.Td ta="right" c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td>
                <Table.Td><StatusCell row={invoice} /></Table.Td>
                <Table.Td ta="right" onClick={(e) => e.stopPropagation()}>
                  {invoice.pending_amount > 0 && <Button size="xs" variant="light" onClick={() => onCollect(invoice)}>Collect</Button>}
                </Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </TableScroll>
      )}
      <ListPagination total={data.invoice_count} page={page} onChange={setPage} label="invoices" />
    </>
  );
}

function CollectionsTab({ rows, isMobile, onOpen }) {
  if (!rows.length) return <Text ta="center" c="dimmed" py="xl">Nothing collected yet.</Text>;
  if (isMobile) {
    return <CardList>{rows.map((p) => (
      <Paper key={p.id} withBorder p="sm" radius="md" onClick={() => onOpen(p.invoice_id)} style={{ cursor: 'pointer' }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} truncate>{p.invoice_number} {p.reversal && <ReversedBadge />}</Text>
            <Text size="xs" c="dimmed" truncate>{[shortDate(p.date), p.mode, p.collected_by].filter(Boolean).join(' · ')}</Text>
          </div>
          <Text size="sm" fw={700} c={p.reversal ? 'red' : 'green.8'} style={{ whiteSpace: 'nowrap' }}>{money(p.amount)}</Text>
        </Group>
      </Paper>
    ))}</CardList>;
  }
  return (
    <TableScroll minWidth={700}>
      <Table miw={700} verticalSpacing="xs" highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Invoice</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Collected by</Table.Th><Table.Th>Reference / reason</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{rows.map((p) => (
          <Table.Tr key={p.id} onClick={() => onOpen(p.invoice_id)} style={{ cursor: 'pointer' }}>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(p.date)}</Table.Td>
            <Table.Td fw={600}>{p.invoice_number}{p.reversal && <> <ReversedBadge /></>}</Table.Td>
            <Table.Td ta="right" fw={600} c={p.reversal ? 'red' : 'green.8'}>{money(p.amount)}</Table.Td>
            <Table.Td>{p.mode || '—'}</Table.Td>
            <Table.Td>{p.collected_by || '—'}{p.recorded_by && p.recorded_by !== p.collected_by && <Text size="xs" c="dimmed">Entered by {p.recorded_by}</Text>}</Table.Td>
            <Table.Td c="dimmed" maw={220} style={{ overflowWrap: 'anywhere' }}>{p.reversal ? p.reason : p.reference || '—'}</Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </TableScroll>
  );
}

function SchemesTab({ rows, onOpenMargin }) {
  return (
    <Stack gap="sm">
      {!rows.length ? <Text ta="center" c="dimmed" py="lg">No scheme fixed for this customer yet.</Text> : (
        <TableScroll minWidth={480}>
          <Table miw={480} verticalSpacing="sm">
            <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Scheme</Table.Th><Table.Th>Rate</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{rows.map((s) => (
              <Table.Tr key={s.product_id}><Table.Td fw={600}>{s.product || 'Untitled product'}</Table.Td><Table.Td>{s.scheme || '—'}</Table.Td><Table.Td>{rule(s)}</Table.Td></Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </TableScroll>
      )}
      <Anchor size="sm" component="button" onClick={onOpenMargin} style={{ alignSelf: 'flex-start' }}>Change in Margin calculator →</Anchor>
    </Stack>
  );
}

function ActivityTab({ rows }) {
  if (!rows.length) return <Text ta="center" c="dimmed" py="xl">No activity yet.</Text>;
  const days = [];
  rows.forEach((a) => {
    const day = shortDate(a.day);
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, items: [] });
    days[days.length - 1].items.push(a);
  });
  const dot = { payment: 'var(--mantine-color-green-6)', reversal: 'var(--mantine-color-red-6)', bill: 'var(--mantine-color-gray-5)', change: 'var(--mantine-color-blue-5)' };
  return (
    <Stack gap="md">
      {days.map((d) => (
        <div key={d.day}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>{d.day}</Text>
          <Stack gap={8}>{d.items.map((a, idx) => (
            <Group key={idx} wrap="nowrap" gap="sm" align="flex-start">
              <span style={{ width: 8, height: 8, borderRadius: 8, background: dot[a.kind], marginTop: 7, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm">{a.text}{a.amount ? <Text span fw={700}> · {money(a.amount)}</Text> : null}</Text>
                <Text size="xs" c="dimmed">{[a.time, a.by, a.note].filter(Boolean).join(' · ')}</Text>
              </div>
            </Group>
          ))}</Stack>
        </div>
      ))}
    </Stack>
  );
}

/**
 * One customer on one page: who they are, what they owe, how they pay, and
 * every bill, payment, scheme and change. Admin sees everyone; an MR only
 * their own customers, without Schemes.
 */
export default function CustomerProfile({ customerId, base }) {
  const admin = base === '/admin';
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshKey: appRefresh } = useAppRefresh();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ key: '', data: null, error: '' });
  const [tab, setTab] = useState(location.state?.openInvoice ? 'invoices' : 'ledger');
  const [historyId, setHistoryId] = useState(location.state?.openInvoice ?? null);
  const [recording, setRecording] = useState(null);
  const [collecting, setCollecting] = useState(null);
  const [editing, setEditing] = useState(null);
  const key = `${customerId}:${reload}:${appRefresh}`;

  useEffect(() => {
    let live = true;
    customersApi.getProfile(customerId)
      .then((data) => live && setState({ key, data, error: '' }))
      .catch((err) => live && setState({ key, data: null, error: errorText(err, 'Could not open this customer.') }));
    return () => { live = false; };
  }, [customerId, key]);

  const data = state.data;
  const points = useMemo(() => (data?.monthly || []).map((m, idx, all) => {
    const last = new Date(new Date(m.month).getFullYear(), new Date(m.month).getMonth() + 1, 0);
    const label = MONTHS[Number(m.month.slice(5, 7)) - 1] + (idx === all.length - 1 ? ' (so far)' : '');
    return { from: m.month, to: last.toISOString().slice(0, 10), label, sales: m.billed, recovered: m.recovered, collected: m.collected };
  }), [data]);
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(`${base}/customers`));
  const changed = () => setReload((v) => v + 1);

  if (state.error) return <Stack><Anchor component="button" onClick={back}><Group gap={4}><IconArrowLeft size={15} />Back</Group></Anchor><Alert color="red">{state.error}</Alert></Stack>;
  if (!data) return <Group justify="center" p="xl"><Loader /></Group>;

  const c = data.customer;
  const s = data.summary;
  const late = s.avg_days_to_pay != null && s.avg_days_to_pay > s.credit_days;
  const tiles = [
    { label: 'Owed', value: money(s.owed), color: s.owed > 0 ? 'red' : undefined, hint: s.open_bills ? plural(s.open_bills, 'open bill') : 'All paid' },
    { label: 'Overdue', value: money(s.overdue), color: s.overdue > 0 ? 'red' : undefined, hint: s.overdue_bills ? `${plural(s.overdue_bills, 'bill')} · oldest ${plural(s.oldest_overdue_days, 'day')} late` : 'Nothing overdue', hintShort: s.overdue_bills ? `Oldest ${s.oldest_overdue_days} days late` : 'Nothing overdue' },
    { label: 'Bought · last 12 months', short: 'Bought · 12 months', value: money(s.billed_12m), hint: `This financial year ${money(s.billed_fy)}`, hintShort: `This FY ${money(s.billed_fy)}` },
    { label: 'Usually pays in', value: s.avg_days_to_pay != null ? plural(s.avg_days_to_pay, 'day') : '—', color: late ? 'orange.8' : s.avg_days_to_pay != null ? 'green.8' : undefined, hint: s.last_paid ? `Last paid ${money(s.last_paid.amount)} on ${shortDate(s.last_paid.date)}` : 'No payments yet', hintShort: s.last_paid ? `Last paid ${shortDate(s.last_paid.date)}` : 'No payments yet' },
  ];
  const actions = (
    <>
      <ContactActions phone={c.phone} alternatePhone={c.alternate_phone} whatsappOn={c.whatsapp_on} name={c.name} size={isMobile ? 'md' : 'sm'} />
      <LedgerShareButton customerId={c.id} customerName={c.name} params={{}} disabled={!s.bills} excel={admin} />
      {admin && (
        <Menu position="bottom-end" shadow="md" withinPortal>
          <Menu.Target><ActionIcon variant="default" size={36} radius="md" aria-label={`More actions for ${c.name}`}><IconDots size={17} /></ActionIcon></Menu.Target>
          <Menu.Dropdown><Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditing(c.id)}>Edit details</Menu.Item></Menu.Dropdown>
        </Menu>
      )}
      {s.owed > 0 && <Button leftSection={<IconCash size={16} />} onClick={() => setCollecting({ id: c.id, name: c.name })}>Collect</Button>}
    </>
  );

  return (
    <Stack gap="md">
      <Anchor component="button" size="sm" c="dimmed" onClick={back} style={{ alignSelf: 'flex-start' }}><Group gap={4}><IconArrowLeft size={15} />Customers</Group></Anchor>
      <div>
        <TitleBar title={c.name} left={c.type && <Badge variant="light" color="gray" size="lg" radius="sm">{c.type}</Badge>}>{!isMobile && actions}</TitleBar>
        <Text size="sm" c="dimmed" mt={4}>
          {[c.area, `MR ${c.mr_name || 'not assigned'}`, `Credit ${s.credit_days} days`, s.first_bill && `Customer since ${monthYear(s.first_bill)}`, admin && c.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(' · ')}
        </Text>
        {isMobile && <Group gap="xs" mt="sm" wrap="nowrap">{actions}</Group>}
      </div>

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        {tiles.map((t) => (isMobile ? (
          <Paper key={t.label} withBorder p="sm" radius="md">
            <Text size="xs" c="dimmed">{t.short || t.label}</Text>
            <Text fw={700} fz={18} c={t.color} style={{ whiteSpace: 'nowrap' }}>{t.value}</Text>
            <Text size="xs" c="dimmed" lineClamp={2}>{t.hintShort || t.hint}</Text>
          </Paper>
        ) : <StatCard key={t.label} size="md" label={t.label} value={t.value} color={t.color} hint={t.hint} />))}
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb={6} wrap="wrap" gap="xs">
          <div><Text fw={700}>Last 12 months</Text><Text size="xs" c="dimmed">{isMobile ? 'Tap' : 'Hover'} a month for its numbers</Text></div>
          {legend}
        </Group>
        <TrendChart points={points} wide={!isMobile} />
      </Paper>

      <Paper withBorder p={isMobile ? 'xs' : 'md'} radius="md">
        <Tabs value={tab} onChange={setTab} keepMounted={false} styles={isMobile ? { tab: { padding: '10px 7px', fontSize: 14 } } : undefined}>
          <Tabs.List mb="md" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            <Tabs.Tab value="ledger">Ledger</Tabs.Tab>
            <Tabs.Tab value="invoices">{isMobile ? 'Invoices' : `Invoices · ${s.bills}`}</Tabs.Tab>
            <Tabs.Tab value="collections">Payments</Tabs.Tab>
            {admin && <Tabs.Tab value="schemes">{isMobile ? 'Schemes' : `Schemes · ${data.schemes.length}`}</Tabs.Tab>}
            <Tabs.Tab value="activity">Activity</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="ledger"><LedgerTab rows={data.statement} count={data.statement_count} isMobile={isMobile} onOpen={setHistoryId} /></Tabs.Panel>
          <Tabs.Panel value="invoices"><InvoicesTab customerId={c.id} customerType={c.type} isMobile={isMobile} refreshKey={key} onOpen={setHistoryId} onCollect={setRecording} /></Tabs.Panel>
          <Tabs.Panel value="collections"><CollectionsTab rows={data.collections} isMobile={isMobile} onOpen={setHistoryId} /></Tabs.Panel>
          {admin && <Tabs.Panel value="schemes"><SchemesTab rows={data.schemes} onOpenMargin={() => navigate('/admin/margin')} /></Tabs.Panel>}
          <Tabs.Panel value="activity"><ActivityTab rows={data.activity} /></Tabs.Panel>
        </Tabs>
      </Paper>

      <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={changed} onRecord={setRecording} refreshKey={reload} />
      <RecordCollectionModal invoice={recording && { ...recording, customer_name: c.name }} onClose={() => setRecording(null)} onSaved={changed} />
      <CustomerCollectModal customer={collecting} onClose={() => setCollecting(null)} onSaved={changed} />
      {admin && <EditCustomerModal customerId={editing} onClose={() => setEditing(null)} onSaved={changed} />}
    </Stack>
  );
}
