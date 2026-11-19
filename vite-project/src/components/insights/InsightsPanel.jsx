import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Loader, Menu, NumberInput, SegmentedControl, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconBook2, IconCash, IconDots, IconDownload, IconEdit } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { insightsApi } from '../../api/insightsApi';
import { customersApi } from '../../api/customersApi';
import { SearchInput } from '../filters/FilterBar';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../hooks/useAppStore';
import ContactActions from '../customers/ContactActions';
import EditCustomerModal from '../customers/EditCustomerModal';
import { PanelTop } from '../common/BackToTop';
import { errorText, money, shortDate } from '../../utils/formatters';
import InvoiceHistory from '../collections/InvoiceHistory';
import RecordCollectionModal from '../collections/RecordCollectionModal';
import CustomerCollectModal from '../collections/CustomerCollectModal';
import { StatusBadge } from '../collections/CollectionBadges';
import { lakh, TYPE_COLORS } from './insightsFormat';
import { MonthBars } from './charts';
import ModePayments from './ModePayments';
import css from '../../pages/admin/AdminInsights.module.css';

const RECORD_TITLES = { sales: 'Sales', collected: 'Collected', outstanding: 'Owed to you today', active: 'Invoices of active customers' };
// "12 days overdue" / "due in 8 days": days past the customer's credit period.
const dueText = (late) => (late === null || late === undefined ? '' : late > 0 ? `${late} days overdue` : late === 0 ? 'overdue from today' : `due in ${-late} days`);

/**
 * The drill-down side panel (bottom sheet on phones). A stack, so Back goes
 * one step up: list behind a number -> Customer insights -> invoice history.
 */
export default function InsightsPanel({ stack, filters, periodLabel, onPush, onBack, onClose, onChanged, onOpenLedger }) {
  const isMobile = useIsMobile();
  const current = stack[stack.length - 1] || null;
  const [openInvoice, setOpenInvoice] = useState(null);
  const [recording, setRecording] = useState(null);
  const [collecting, setCollecting] = useState(null);
  const [reload, setReload] = useState(0);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const closeEdit = useCallback(() => setEditingCustomer(null), []);
  const isAdmin = useAuth().role === 'ADMIN';
  const changed = () => { setReload((v) => v + 1); onChanged?.(); };

  return (
    <>
      <Drawer
        opened={Boolean(current)}
        onClose={onClose}
        // Esc closes only the window on top (invoice history / collect), not this panel too.
        closeOnEscape={!openInvoice && !recording && !collecting && !editingCustomer}
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? '92%' : 600}
        radius={isMobile ? 'lg' : 0}
        padding={0}
        withCloseButton
        title={stack.length > 1 ? <Button variant="subtle" size="compact-sm" color="green" leftSection={<IconArrowLeft size={14} />} onClick={onBack}>Back</Button> : null}
        styles={{ header: { paddingInline: 16, paddingBlock: 10, minHeight: 0, borderBottom: '1px solid var(--app-line)' }, body: { padding: 16 } }}
      >
        {current?.kind === 'records' && <Records key={JSON.stringify(current) + reload} item={current} filters={filters} periodLabel={periodLabel} isMobile={isMobile} onCustomer={(c) => onPush({ kind: 'customer', id: c.id, name: c.name })} onInvoice={setOpenInvoice} />}
        {current?.kind === 'change' && <CustomerChange key={JSON.stringify(current) + reload} item={current} filters={filters} periodLabel={periodLabel} isMobile={isMobile} onCustomer={(c) => onPush({ kind: 'customer', id: c.id, name: c.name })} />}
        {current?.kind === 'customer' && <CustomerInsights key={current.id + ':' + reload} id={current.id} isMobile={isMobile} onInvoice={setOpenInvoice} onCollect={setCollecting} onLedger={onOpenLedger} onEdit={isAdmin ? setEditingCustomer : null} />}
        {current?.kind === 'mode' && <ModePayments key={JSON.stringify(current) + reload} item={current} filters={filters} periodLabel={periodLabel} isMobile={isMobile} onCustomer={(c) => onPush({ kind: 'customer', id: c.id, name: c.name })} onInvoice={setOpenInvoice} onChanged={onChanged} />}
        {current?.kind === 'targets' && <Targets onSaved={() => { onChanged?.(); onClose(); }} />}
        <PanelTop />
      </Drawer>
      <InvoiceHistory invoiceId={openInvoice} onClose={() => setOpenInvoice(null)} onChanged={changed} onRecord={setRecording} refreshKey={reload} />
      <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={changed} />
      <CustomerCollectModal customer={collecting} onClose={() => setCollecting(null)} onSaved={changed} />
      {/* Saving can move the customer (new area or MR): Insights reloads behind. */}
      <EditCustomerModal customerId={editingCustomer} onClose={closeEdit} onSaved={changed} />
    </>
  );
}

/** Loads once per key; keeps no state updates inside the effect body. */
function useLoad(load, key) {
  const [state, setState] = useState({ key: null, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    load().then((data) => alive && setState({ key, data, error: '' }))
      .catch((err) => alive && setState({ key, data: null, error: errorText(err) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { loading: state.key !== key, data: state.data, error: state.error };
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortSpan = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number); const [ty, tm, td] = to.split('-').map(Number);
  const whole = fd === 1 && td === new Date(ty, tm, 0).getDate();
  if (whole && fy === ty && fm === tm) return `${SHORT_MONTHS[fm - 1]} ${fy}`;
  if (whole) return `${SHORT_MONTHS[fm - 1]}–${SHORT_MONTHS[tm - 1]} ${ty}`;
  return fm === tm && fy === ty ? `${fd}–${td} ${SHORT_MONTHS[fm - 1]}` : `${fd} ${SHORT_MONTHS[fm - 1]} – ${td} ${SHORT_MONTHS[tm - 1]}`;
};

/**
 * Behind "Active customers": three tabs.
 *   Active  · bought in the period
 *   Started · bought now, not in the compared period (new or came back)
 *   Stopped · bought in the compared period, nothing now; flagged
 *             "Overdue to order" when past their own usual gap, else "Normal gap".
 */
function CustomerChange({ item, filters, periodLabel, isMobile, onCustomer }) {
  const [tab, setTab] = useState(item.tab || 'active');
  const params = { ...filters };
  const { loading, data, error } = useLoad(() => insightsApi.customerChange(params), JSON.stringify(params));
  const compared = data ? shortSpan(data.range.previous_from, data.range.previous_to) : '';
  const rows = data ? data[tab] : [];
  const tabs = [
    { value: 'active', label: `Active ${data ? data.active.length : ''}` },
    ...(data?.range.previous_from ? [
      { value: 'started', label: `Started ${data.started.length}` },
      { value: 'stopped', label: `Stopped ${data.stopped.length}` },
    ] : []),
  ];
  const sub = tab === 'active' ? `Bought in ${periodLabel}` : tab === 'started' ? `Bought in ${periodLabel}, not in ${compared}` : `Bought in ${compared}, nothing in ${periodLabel}`;
  const habit = (r) => (r.gap_low === null ? null : r.gap_low === r.gap_high ? `usually every ${r.gap_low} days` : `usually every ${r.gap_low}–${r.gap_high} days`);
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700} fz={18}>Active customers</Text>
        <Text size="sm" c="dimmed">{sub}</Text>
      </div>
      {tabs.length > 1 && <SegmentedControl fullWidth size="sm" value={tab} onChange={setTab} data={tabs} />}
      {error && <Alert color="red">{error}</Alert>}
      {loading && !data ? <Group justify="center" p="lg"><Loader size="sm" /></Group> : (
        <Stack gap={0}>
          {!rows.length && <Text c="dimmed" size="sm" py="sm">{tab === 'stopped' ? 'No one stopped buying. 👍' : 'Nobody here.'}</Text>}
          {rows.map((r) => {
            const amount = tab === 'stopped' ? r.previous_sales : r.sales;
            const last = r.last_order ? new Date(`${r.last_order}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
            return (
              <UnstyledButton key={r.customer_id} onClick={() => onCustomer({ id: r.customer_id, name: r.name })} py={10} style={{ borderTop: '1px solid var(--app-line)', display: 'block', width: '100%' }}>
                <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{r.name}</Text>
                    <Text size="xs" c="dimmed" truncate>{[r.type, r.mr || 'No MR'].join(' · ')}</Text>
                    {tab === 'stopped' && (
                      <Group gap={6} mt={4} wrap="nowrap">
                        <Badge size="sm" variant="light" color={r.back ? 'green' : r.late ? 'red' : 'gray'} style={{ flexShrink: 0 }}>{r.back ? 'Ordered again' : r.late ? 'Overdue to order' : 'Normal gap'}</Badge>
                        <Text size="xs" c="dimmed" truncate>{r.back ? `on ${last}` : `Last order ${last}${r.days_since !== null ? ` (${r.days_since} days ago)` : ''}${habit(r) ? ` · ${habit(r)}` : ''}`}</Text>
                      </Group>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <Text fw={700} size="sm" className={css.num}>{money(amount)}</Text>
                    <Text size="xs" c="dimmed">{tab === 'stopped' ? `in ${compared}` : tab === 'started' ? 'new / back' : (isMobile ? '' : periodLabel)}</Text>
                  </div>
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function Records({ item, filters, periodLabel, isMobile, onCustomer, onInvoice }) {
  const params = { ...filters, kind: item.records, ...(item.bucket && { bucket: item.bucket }) };
  const { loading, data, error } = useLoad(() => insightsApi.records(params), JSON.stringify(params));
  const collected = item.records === 'collected';
  const age = item.records === 'age' || item.records === 'outstanding';
  const title = item.title || RECORD_TITLES[item.records];
  const items = data?.items || [];

  const exportCsv = () => {
    const head = collected ? ['Payment date', 'Invoice', 'Customer', 'MR', 'Mode', 'Amount'] : ['Invoice', 'Invoice date', 'Customer', 'MR', 'Total', 'Paid', 'Pending', 'Status'];
    const rows = items.map((r) => (collected
      ? [r.payment_date, r.invoice_number, r.customer, r.mr || '', r.mode, r.amount]
      : [r.invoice_number, r.invoice_date, r.customer, r.mr || '', r.total, r.paid, r.pending, r.status]));
    const text = [head, ...rows].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${title} - ${periodLabel || 'insights'}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Stack gap="sm">
      <div>
        <Text fw={700} fz={18}>{title}</Text>
        <Text size="sm" c="dimmed">{age ? 'As of today, oldest first' : periodLabel}{data ? ` · ${data.count} ${collected ? 'payments' : 'invoices'} · ${money(data.total)}` : ''}</Text>
      </div>
      {error && <Alert color="red">{error}</Alert>}
      {loading && !data ? <Group justify="center" p="lg"><Loader size="sm" /></Group> : data && (
        <>
          <Group justify="flex-end"><Button size="xs" variant="default" leftSection={<IconDownload size={14} />} disabled={!items.length} onClick={exportCsv}>Export</Button></Group>
          {!items.length && <Text c="dimmed" size="sm">Nothing here.</Text>}
          {isMobile ? (
            <Stack gap={0}>
              {items.map((r, index) => (
                <Group key={`${r.invoice_id}-${index}`} justify="space-between" wrap="nowrap" py="xs" style={{ borderTop: '1px solid var(--app-line)', cursor: 'pointer' }} onClick={() => onInvoice(r.invoice_id)}>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate onClick={(e) => { e.stopPropagation(); onCustomer({ id: r.customer_id, name: r.customer }); }} c="green.8">{r.customer}</Text>
                    <Text size="xs" c="dimmed">{r.invoice_number} · {shortDate(collected ? r.payment_date : r.invoice_date)}{collected ? ` · ${r.mode}` : ''}</Text>
                    {age && <Text size="xs" fw={600} c={r.days_late >= 0 ? 'red.7' : 'dimmed'}>{dueText(r.days_late)}</Text>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text fw={700} className={css.num} c={collected && r.amount < 0 ? 'orange.8' : undefined}>{money(collected ? r.amount : (item.records === 'outstanding' || age ? r.pending : r.total))}</Text>
                    {!collected && <StatusBadge status={r.status} />}
                  </div>
                </Group>
              ))}
            </Stack>
          ) : (
            <Table highlightOnHover verticalSpacing="xs" fz="sm">
              <Table.Thead><Table.Tr>
                <Table.Th>{collected ? 'Paid on' : 'Invoice'}</Table.Th><Table.Th>{collected ? 'Invoice' : 'Date'}</Table.Th><Table.Th>Customer</Table.Th>
                <Table.Th ta="right">{collected ? 'Amount' : (item.records === 'outstanding' || age ? 'Pending' : 'Amount')}</Table.Th><Table.Th>{collected ? 'Mode' : 'Status'}</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {items.map((r, index) => (
                  <Table.Tr key={`${r.invoice_id}-${index}`} style={{ cursor: 'pointer' }} onClick={() => onInvoice(r.invoice_id)}>
                    <Table.Td fw={600}>{collected ? shortDate(r.payment_date) : r.invoice_number}</Table.Td>
                    <Table.Td c="dimmed">{collected ? r.invoice_number : shortDate(r.invoice_date)}{age && <Text size="xs" fw={600} c={r.days_late >= 0 ? 'red.7' : 'dimmed'}>{dueText(r.days_late)}</Text>}</Table.Td>
                    <Table.Td><Text size="sm" c="green.8" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onCustomer({ id: r.customer_id, name: r.customer }); }}>{r.customer}</Text></Table.Td>
                    <Table.Td ta="right" fw={700} className={css.num} c={collected && r.amount < 0 ? 'orange.8' : undefined}>{money(collected ? r.amount : (item.records === 'outstanding' || age ? r.pending : r.total))}</Table.Td>
                    <Table.Td>{collected ? r.mode : <StatusBadge status={r.status} />}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {data?.truncated && <Text size="xs" c="dimmed">Showing the first {items.length}. Export has the same rows; narrow the dates to see more.</Text>}
        </>
      )}
    </Stack>
  );
}

function CustomerInsights({ id, isMobile, onInvoice, onCollect, onLedger, onEdit }) {
  const { loading, data: c, error } = useLoad(() => insightsApi.customer(id), String(id));
  if (loading && !c) return <Group justify="center" p="lg"><Loader size="sm" /></Group>;
  if (error) return <Alert color="red">{error}</Alert>;
  if (!c) return null;
  const color = TYPE_COLORS[c.type] || '#868e96';
  const ini = c.name.replace(/^Dr\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const lines = [];
  const paidBefore = c.avg_days_to_pay !== null;
  if (c.overdue > 0) lines.push(<b style={{ color: '#e03131' }}>{money(c.overdue)} overdue, oldest bill {c.oldest_overdue_late > 0 ? `${c.oldest_overdue_late} days` : 'just'} past its {c.credit_days}-day credit</b>);
  if (!paidBefore && c.invoice_count) lines.push(lines.length ? <>no payments recorded yet</> : <>No payments recorded yet</>);
  const buying = lines.length ? 'buying' : 'Buying';
  if (c.growth_3m !== null) lines.push(c.growth_3m >= 0 ? <>{buying} <b>{c.growth_3m}% more</b> than the 3 months before</> : <>{buying} <b>{Math.abs(c.growth_3m)}% less</b> than the 3 months before</>);
  if (c.avg_days_to_pay !== null) lines.push(lines.length ? <>pays in about <b>{c.avg_days_to_pay} days</b></> : <>Pays in about <b>{c.avg_days_to_pay} days</b></>);
  if (c.reversals) lines.push(<b style={{ color: '#e03131' }}>{c.reversals} reversed payment{c.reversals > 1 ? 's' : ''}</b>);
  const habit = c.gap_low === null ? null : c.gap_low === c.gap_high ? `every ${c.gap_low} days` : `every ${c.gap_low}–${c.gap_high} days`;
  if (c.not_ordering) lines.push(<b style={{ color: '#e03131' }}>no order for {c.days_since_last_order} days{habit ? ` (usually ${habit})` : ''}</b>);
  if (c.buying_less) lines.push(<b style={{ color: '#d9480f' }}>buying {money(c.recent_month)} a month lately, usually {money(c.usual_month)}</b>);
  if (c.buying_more) lines.push(<b style={{ color: '#2b8a3e' }}>buying {money(c.recent_month)} a month lately, more than the usual {money(c.usual_month)}</b>);
  const stat = (label, value, tone) => <div className={css.st}><div className={css.l}>{label}</div><div className={css.v} style={tone ? { color: tone } : undefined}>{value}</div></div>;

  return (
    <Stack gap={0}>
      <Group gap={12} wrap="nowrap" mb="md" align="flex-start">
        <span className={css.ini} style={{ width: 44, height: 44, fontSize: 14, background: `${color}22`, color }}>{ini}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fw={700} fz={18} lh={1.25}>{c.name}</Text>
          <Text size="sm" c="dimmed">Customer insights · {c.type}{c.mr ? ` · MR ${c.mr}` : ' · No MR'} · {c.area || 'Area not set'}</Text>
        </div>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <ContactActions size={isMobile ? 'md' : 'sm'} name={c.name} phone={c.phone} alternatePhone={c.alternate_phone} whatsappOn={c.whatsapp_on} />
          {onEdit && (
            <Menu position="bottom-end" shadow="md" withinPortal>
              <Menu.Target><ActionIcon variant="subtle" color="gray" size={isMobile ? 'lg' : 'md'} aria-label={`More actions for ${c.name}`}><IconDots size={18} /></ActionIcon></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => onEdit(c.customer_id)}>Edit details</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
      {lines.length > 0 && <div className={css.insight}>💡 <span>{lines.map((line, i) => <span key={i}>{i === 0 ? '' : '; '}{line}</span>)}.</span></div>}
      <div className={css.stats}>
        {stat('Last 12 months', lakh(c.last_12_months))}
        {stat('Growth (3 months)', c.growth_3m === null ? '—' : `${c.growth_3m >= 0 ? '↑' : '↓'} ${Math.abs(c.growth_3m)}%`, c.growth_3m === null ? null : c.growth_3m >= 0 ? '#2b8a3e' : '#e03131')}
        {stat('Outstanding', money(c.outstanding), c.outstanding > 0 ? '#e03131' : null)}
        {stat('Overdue', money(c.overdue), c.overdue > 0 ? '#e03131' : null)}
        {paidBefore && stat('Avg days to pay', `${c.avg_days_to_pay} d`)}
        {paidBefore && stat(`Paid on time (${c.credit_days} d)`, `${c.paid_on_time}%`)}
        {habit ? stat('Usually orders', habit) : stat('Usually orders', 'Not enough history yet')}
        {c.next_expected && !c.not_ordering && stat('Next order expected', `~${new Date(`${c.next_expected}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)}
        {c.usual_month ? stat('Usual month', lakh(c.usual_month)) : null}
        {c.usual_mode && stat('Usually pays by', c.usual_mode)}
        {stat('Reversed payments', c.reversals, c.reversals ? '#e03131' : null)}
        {stat('Customer since', c.customer_since ? new Date(c.customer_since).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—')}
      </div>
      <div className={css.card} style={{ padding: '12px 14px', marginBottom: 14 }}>
        <Text fw={700} fz={13.5} mb={8}>Monthly sales</Text>
        <MonthBars months={c.months} />
      </div>
      <Group justify="space-between" mb={8}>
        <Text fw={700} fz={13.5}>Invoices <Text span c="dimmed" fw={400}>({c.invoice_count})</Text></Text>
        <Group gap={8}>
          {onLedger && <Button size="xs" variant="default" leftSection={<IconBook2 size={14} />} onClick={() => onLedger({ id: c.customer_id, name: c.name })}>Ledger</Button>}
          {c.outstanding > 0 && <Button size="xs" color="green" leftSection={<IconCash size={14} />} onClick={() => onCollect({ id: c.customer_id, name: c.name })}>Collect</Button>}
        </Group>
      </Group>
      <CustomerInvoices c={c} onInvoice={onInvoice} />
      {isMobile && <div style={{ height: 24 }} />}
    </Stack>
  );
}

/** The customer's latest invoices, with a search over all of them (same
 * search as the ledger: invoice number, mode, status, MR). */
function CustomerInvoices({ c, onInvoice }) {
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search.trim(), 300);
  const [found, setFound] = useState(null); // { q, rows, total } | { q, error }
  useEffect(() => {
    if (!query) return undefined;
    let live = true;
    customersApi.getCustomerLedger(c.customer_id, { search: query, limit: 30 })
      .then((r) => live && setFound({ q: query, total: r.invoice_count, rows: r.invoices.map((i) => ({ invoice_id: i.invoice_id, invoice_number: i.invoice_number, invoice_date: i.date, total: i.amount, paid: i.paid_amount, pending: i.pending_amount, status: i.status })) }))
      .catch((err) => live && setFound({ q: query, error: errorText(err) }));
    return () => { live = false; };
  }, [query, c.customer_id]);
  const searching = Boolean(query);
  const result = searching && found?.q === query ? found : null;
  const rows = searching ? (result?.rows || []) : c.invoices;
  return (
    <>
      {c.invoice_count > 0 && <SearchInput className="" value={search} onChange={setSearch} placeholder="Search this customer's invoices" mb={8} />}
      {searching && !result && <Group justify="center" p="md"><Loader size="sm" /></Group>}
      {result?.error && <Alert color="red">{result.error}</Alert>}
      {result && !result.error && !rows.length && <Text size="sm" c="dimmed" py="sm">No invoices match “{query}”.</Text>}
      <Stack gap={0}>
        {rows.map((i) => (
          <Group key={i.invoice_id} justify="space-between" wrap="nowrap" py={8} style={{ borderTop: '1px solid var(--app-line)', cursor: 'pointer' }} onClick={() => onInvoice(i.invoice_id)}>
            <div><Text size="sm" fw={600}>{i.invoice_number}</Text><Text size="xs" c="dimmed">{shortDate(i.invoice_date)}{i.pending > 0 && i.paid > 0 ? ` · ${money(i.pending)} pending` : ''}</Text></div>
            <Group gap={8} wrap="nowrap"><Text fw={700} size="sm" className={css.num}>{money(i.total)}</Text><StatusBadge status={i.status} /></Group>
          </Group>
        ))}
        {!searching && c.invoice_count > c.invoices.length && <Text size="xs" c="dimmed" pt={6}>Latest {c.invoices.length} shown — search or open the Ledger for all.</Text>}
        {result && result.total > rows.length && <Text size="xs" c="dimmed" pt={6}>First {rows.length} of {result.total} — open the Ledger for all.</Text>}
      </Stack>
    </>
  );
}

function Targets({ onSaved }) {
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const { loading, data, error } = useLoad(() => insightsApi.targets(month), month);
  const [edited, setEdited] = useState(null); // null until the first change
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const rows = edited || data?.mrs || null;
  const set = (index, key, value) => setEdited((rows || []).map((r, i) => (i === index ? { ...r, [key]: value === '' ? null : value } : r)));
  const save = async () => {
    setSaving(true); setSaveError('');
    try {
      await insightsApi.saveTargets(month, rows.map((r) => ({ mr_id: r.mr_id, sales_target: r.sales_target ?? null, collection_target: r.collection_target ?? null })));
      notifications.show({ color: 'green', message: 'Targets saved.' });
      onSaved();
    } catch (err) { setSaveError(errorText(err)); } finally { setSaving(false); }
  };
  const label = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <Stack gap="sm">
      <div><Text fw={700} fz={18}>Set targets</Text><Text size="sm" c="dimmed">{label} · next months keep these until you change them</Text></div>
      {error && <Alert color="red">{error}</Alert>}
      {saveError && <Alert color="red">{saveError}</Alert>}
      {loading || !rows ? <Group justify="center" p="lg"><Loader size="sm" /></Group> : (
        <>
          {!rows.length && <Text c="dimmed" size="sm">Add MRs in Users first.</Text>}
          {rows.map((r, index) => (
            <Group key={r.mr_id} align="flex-end" wrap="nowrap" gap="sm">
              <Text fw={600} w={90} truncate pb={8}>{r.name}</Text>
              <NumberInput label={index === 0 ? 'Sales target' : undefined} aria-label={`${r.name} sales target`} prefix="₹" thousandSeparator="," thousandsGroupStyle="lakh" min={0} allowNegative={false} decimalScale={0} value={r.sales_target ?? ''} onChange={(v) => set(index, 'sales_target', v)} style={{ flex: 1 }} />
              <NumberInput label={index === 0 ? 'Collection target' : undefined} aria-label={`${r.name} collection target`} prefix="₹" thousandSeparator="," thousandsGroupStyle="lakh" min={0} allowNegative={false} decimalScale={0} value={r.collection_target ?? ''} onChange={(v) => set(index, 'collection_target', v)} style={{ flex: 1 }} />
            </Group>
          ))}
          {rows.some((r) => r.carried) && <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>Some targets are carried over from an earlier month</Badge>}
          <Group justify="flex-end" mt="sm"><Button color="green" loading={saving} onClick={save} disabled={!rows.length}>Save targets</Button></Group>
        </>
      )}
    </Stack>
  );
}
