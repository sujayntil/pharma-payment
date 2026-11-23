import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Loader, Menu, Modal, NumberInput, Paper, Progress, Select, SimpleGrid, Stack, Text, TextInput, Timeline } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconCash, IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { useAuth } from '../../hooks/useAppStore';
import { errorText, money, shortDate } from '../../utils/formatters';
import { ReversedBadge, StatusBadge } from './CollectionBadges';
import { useSidePanelWidth } from '../../hooks/useSidePanelSpace';
import { PAYMENT_MODES, useActorLabel } from './collectionUtils';
import { deleteWithUndo } from './deleteWithUndo';
import DeleteInvoicesModal from './DeleteInvoicesModal';
import SidePanel from '../common/SidePanel';
import ReversePaymentModal from './ReversePaymentModal';
import ChangeModeModal from './ChangeModeModal';
import ContactActions from '../customers/ContactActions';
import css from './InvoiceHistory.module.css';
import { useAppRefresh } from '../../hooks/useAppRefresh';

/**
 * The one invoice history view. Bottom sheet on phones, side panel on
 * desktop. Used by My Collections, MR Invoices, Admin Invoices, customer
 * ledgers and the Admin collections ledger. Read-only for MRs; an Admin gets
 * a "⋯ > Reverse payment" menu on each collection that can still be reversed.
 *
 * onChanged:  called after an Admin reversal so the list behind can reload.
 * onRecord:   (invoice) => void. When given, a "Collect" button is
 *             shown for invoices that still have a balance (same form, API and
 *             permissions as everywhere else).
 * refreshKey: change it to reload the sheet (e.g. after a collection is saved).
 * actions:    optional [{ label, icon, color, onClick(invoice) }] shown in a
 *             "⋯" menu on the summary (Admin: Edit / Delete invoice).
 *
 * Desktop: a side panel that does not block the list behind it, so clicking
 * another row switches the panel to that invoice (no need to close first).
 * Phones: a bottom sheet over the page.
 */
const IST = 'Asia/Kolkata';
/** "21 Nov, 5:53 pm" this year, "21 Nov 2025, 5:53 pm" otherwise. */
function when(value) {
  if (!value) return '';
  const d = new Date(value);
  const sameYear = d.toLocaleDateString('en-IN', { year: 'numeric', timeZone: IST }) === new Date().toLocaleDateString('en-IN', { year: 'numeric', timeZone: IST });
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: IST });
  return `${day}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST })}`;
}

/** "21 Nov" this year, "21 Nov 2025" otherwise (YYYY-MM-DD or a timestamp). */
function day(value) {
  if (!value) return '';
  const d = String(value).length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: IST });
}

/** Due line under the bill: "Due 28 Oct · 26 days overdue" / "Due in 12 days" / "Paid in full". */
function dueText(invoice) {
  if (Number(invoice.pending_amount) <= 0.009) return { text: 'Paid in full', tone: 'green' };
  if (!invoice.due_date) return null;
  const [y, m, d] = invoice.due_date.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - due) / 86400000);
  const on = `Due ${day(invoice.due_date)}`;
  if (days > 0) return { text: `${on} · ${days} ${days === 1 ? 'day' : 'days'} overdue`, tone: 'red' };
  if (days === 0) return { text: `${on} · due today`, tone: 'orange' };
  return { text: `${on} · in ${-days} ${days === -1 ? 'day' : 'days'}`, tone: 'dimmed' };
}

export default function InvoiceHistory({ invoiceId, onClose, onChanged, onRecord, refreshKey = 0, actions }) {
  const isMobile = useIsMobile();
  // Admin: Edit / Delete invoice in the ⋯ menu wherever the panel opens
  // (Insights, Dashboard, Collections, ledgers). A page can pass its own.
  const isAdmin = useAuth().role === 'ADMIN';
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [edits, setEdits] = useState(0);
  const menu = actions || (isAdmin ? [
    { label: 'Edit invoice', icon: <IconEdit size={15} />, onClick: setEditing },
    { label: 'Delete invoice', icon: <IconTrash size={15} />, color: 'red', onClick: setDeleting },
  ] : undefined);
  const remove = (reason) => {
    const invoice = deleting;
    setDeleting(null);
    onClose();
    deleteWithUndo({ path: `/invoices/${invoice.id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, message: `${invoice.invoice_number} deleted`, onHide: () => {}, onRestore: () => {}, onDone: () => onChanged?.() });
  };
  useBackClose(!!invoiceId, onClose);
  useSwipeDownToClose(!!invoiceId && isMobile, onClose);
  const panelWidth = useSidePanelWidth();
  return (
    <>
    {/* Laptop: a "peek" panel beside the list (page stays usable); phone: bottom sheet. */}
    <SidePanel
      opened={!!invoiceId}
      onClose={onClose}
      modal={false}
      width={`min(${panelWidth}px, 100%)`}
      title={<Text fw={700}>Invoice details</Text>}
      closeButtonProps={{ 'aria-label': 'Close invoice details' }}
      mobileProps={{ size: '88dvh', classNames: { content: SWIPE_SHEET_CLASS } }}
      styles={isMobile ? undefined : { inner: { top: 64, height: 'calc(100% - 64px)' } }}
    >
      {invoiceId && <HistoryBody key={invoiceId} invoiceId={invoiceId} onChanged={onChanged} onRecord={onRecord} refreshKey={`${refreshKey}-${edits}`} actions={menu} />}
    </SidePanel>
    {!actions && isAdmin && (
      <>
        <InvoiceEditModal invoice={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setEdits((value) => value + 1); onChanged?.(); }} />
        <DeleteInvoicesModal invoices={deleting ? [deleting] : null} onClose={() => setDeleting(null)} onConfirm={remove} />
      </>
    )}
    </>
  );
}

/** Admin "Edit invoice": same fields and checks as the Invoices page. */
function InvoiceEditModal({ invoice, onClose, onSaved }) {
  return (
    <Modal opened={!!invoice} onClose={onClose} title={`Edit invoice ${invoice?.invoice_number || ''}`} centered zIndex={250}>
      {invoice && <InvoiceEditForm key={invoice.id} invoice={invoice} onSaved={onSaved} />}
    </Modal>
  );
}

function InvoiceEditForm({ invoice, onSaved }) {
  const [form, setForm] = useState({
    invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date || '', customer_name: invoice.customer_name || '',
    total_amount: invoice.total_amount, payment_mode: invoice.payment_mode || '', remarks: invoice.remarks || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setError(''); };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await invoicesApi.updateInvoice(invoice.id, {
        ...form, invoice_number: form.invoice_number.trim(), customer_name: form.customer_name.trim(),
        total_amount: Number(form.total_amount), payment_mode: form.payment_mode || null, remarks: form.remarks.trim() || null,
      });
      notifications.show({ color: 'green', message: 'Invoice updated' });
      onSaved();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save}>
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput required label="Invoice number" value={form.invoice_number} onChange={(event) => set({ invoice_number: event.currentTarget.value })} />
        <TextInput required type="date" label="Invoice date" value={form.invoice_date} onChange={(event) => set({ invoice_date: event.currentTarget.value })} />
        <TextInput required label="Customer" value={form.customer_name} onChange={(event) => set({ customer_name: event.currentTarget.value })} />
        <NumberInput required min={0.01} decimalScale={2} label="Bill amount (₹)" value={form.total_amount} onChange={(value) => set({ total_amount: value })} />
        <Select label="Payment mode" clearable data={PAYMENT_MODES} value={form.payment_mode || null} onChange={(value) => set({ payment_mode: value || '' })} comboboxProps={{ zIndex: 300 }} />
        <TextInput label="Remarks" value={form.remarks} onChange={(event) => set({ remarks: event.currentTarget.value })} />
        <Button type="submit" loading={busy}>Save changes</Button>
      </Stack>
    </form>
  );
}

function HistoryBody({ invoiceId, onChanged, onRecord, refreshKey, actions }) {
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this in place
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [reversing, setReversing] = useState(null);
  const [changingMode, setChangingMode] = useState(null);
  const who = useActorLabel();
  // In sentences: "You" for yourself, otherwise just the name.
  const name = (actor) => { const label = who(actor); return label.startsWith('Admin - ') ? label.slice(8) : label; };
  const isAdmin = useAuth().role === 'ADMIN';
  const isMobile = useIsMobile();

  useEffect(() => {
    let active = true;
    invoicesApi.getInvoiceHistory(invoiceId)
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, [invoiceId, reload, refreshKey, appRefresh]);

  // A failed background refresh keeps the invoice on screen.
  if (error && !data) return <Alert color="red">{error}</Alert>;
  if (!data) return <Group justify="center" p="xl"><Loader /></Group>;
  const { invoice, events } = data;
  const due = dueText(invoice);
  const balance = Number(invoice.pending_amount);
  const onReversed = () => { setReload((value) => value + 1); onChanged?.(); };
  // Nothing can be reversed once the invoice holds no collected amount (e.g.
  // an older invoice-level "Mark unpaid"), so the option is hidden then too.
  const canReverse = (event) => isAdmin && event.type === 'COLLECTED' && event.payment_id && !event.fully_reversed && Number(invoice.paid_amount) > 0;
  // Admin can correct the mode of any collection still standing (not reversed out).
  const canChangeMode = (event) => isAdmin && event.type === 'COLLECTED' && event.payment_id && !event.fully_reversed;
  const paymentOf = (event) => ({
    payment_id: event.payment_id,
    amount: event.amount,
    mode: event.mode,
    payment_date: event.at,
    transaction_reference: event.reference,
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    collected_by: (event.collector || event.actor)?.name,
  });

  return (
    <Stack gap="md">
      <Paper withBorder p="sm" radius="md" bg="var(--app-soft)">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Text fw={700} size="lg" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{invoice.invoice_number}</Text>
          {actions?.length > 0 && (
            <Menu position="bottom-end" shadow="md" withinPortal>
              <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${invoice.invoice_number}`}><IconDots size={18} /></ActionIcon></Menu.Target>
              <Menu.Dropdown>
                {actions.map((action) => (
                  <Menu.Item key={action.label} color={action.color} leftSection={action.icon} onClick={() => action.onClick(invoice)}>{action.label}</Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
        <Text size="sm" c="dimmed">Invoice created on {shortDate(invoice.invoice_date || invoice.created_at)}</Text>
        {/* Customer, with call / WhatsApp icons on the right (MR and Admin). */}
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs" mt={2}>
          <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{invoice.customer_name || '—'}</Text>
          <ContactActions
            size={isMobile ? 'md' : 'sm'}
            name={invoice.customer_name || 'customer'}
            phone={invoice.customer_phone}
            alternatePhone={invoice.customer_alternate_phone}
            whatsappOn={invoice.customer_whatsapp_on}
          />
        </Group>
        {isAdmin && <Text size="sm" c="dimmed">MR: {invoice.mr_name || 'Unassigned'}</Text>}
        <Group gap={6} wrap="wrap" mt={6}><StatusBadge status={invoice.status} />{invoice.is_reversed && <ReversedBadge />}</Group>
        <SimpleGrid cols={3} spacing="xs" mt="xs">
          <div><Text size="xs" c="dimmed">Bill</Text><Text size="sm" fw={700}>{money(invoice.total_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Collected</Text><Text size="sm" fw={700} c="green.8">{money(invoice.paid_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Pending</Text><Text size="sm" fw={700} c={Number(invoice.pending_amount) > 0 ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Text></div>
        </SimpleGrid>
        <Progress value={Math.min(100, (Number(invoice.paid_amount) / Math.max(Number(invoice.total_amount), 1)) * 100)} color="green" size={6} radius="xl" mt={8} aria-label="Collected so far" />
        {due && <Text size="xs" mt={6} c={due.tone === 'dimmed' ? 'dimmed' : `${due.tone}.7`} fw={due.tone === 'dimmed' ? 400 : 600}>{due.text}</Text>}
      </Paper>
      {onRecord && (Number(invoice.pending_amount) > 0
        ? <Button fullWidth size="md" leftSection={<IconCash size={18} />} onClick={() => onRecord(invoice)}>Collect</Button>
        : <Text size="sm" c="dimmed" ta="center">Fully paid. Nothing to collect.</Text>)}
      <Text fw={700} size="sm">Activity</Text>

      {/* One plain sentence per step: who did what, then when and the details. */}
      <Timeline bulletSize={12} lineWidth={2} active={-1} className={css.feed}>
        {events.map((event) => {
          const actor = name(event.actor);
          const collector = name(event.collector || event.actor);
          const amount = money(event.amount);
          const reversedOut = event.type === 'COLLECTED' && event.fully_reversed;
          const struck = reversedOut || event.type === 'COLLECTED_UNDONE';
          let title; let details; let extra = null; let tone = 'gray';
          if (event.type === 'CREATED') {
            title = event.actor ? <><b>{actor}</b> created the invoice</> : 'Invoice created';
            details = [shortDate(event.invoice_date || event.at), money(event.amount)];
            tone = 'blue';
          } else if (event.type === 'COLLECTED' || event.type === 'COLLECTED_UNDONE') {
            title = <><b>{collector}</b> collected <span className={struck ? css.struck : css.green}>{amount}</span></>;
            details = [when(event.at), event.mode, event.reference && `Ref ${event.reference}`];
            const typedBy = event.collector && event.actor && event.collector.id !== event.actor.id ? `Entered by ${actor}` : null;
            const part = !reversedOut && Number(event.reversed_amount) > 0 ? <span className={css.orange}>{money(event.reversed_amount)} reversed</span> : null;
            const note = reversedOut ? <span className={css.orange}>Reversed</span>
              : part ? part
              : event.type === 'COLLECTED_UNDONE' ? 'Undone'
              : event.kind === 'full' ? <span className={css.green}>Paid in full</span> : null;
            extra = (typedBy || note) && <Text size="xs" c="dimmed">{typedBy}{typedBy && note ? ' · ' : ''}{note}</Text>;
            tone = struck ? 'gray' : 'green';
          } else if (event.type === 'REVERSED') {
            title = <><b>{actor}</b> reversed <span className={css.orange}>{amount}</span></>;
            details = [when(event.at), event.reverses && `of ${name(event.reverses.collector) === 'You' ? 'your' : `${name(event.reverses.collector)}'s`} ${money(event.reverses.amount)} from ${day(event.reverses.at)}`];
            extra = event.reason && <Text size="sm" className={css.reason}>“{event.reason}”</Text>;
            tone = 'orange';
          } else if (event.type === 'MODE_CHANGED') {
            title = <><b>{actor}</b> changed the payment mode</>;
            details = [when(event.at), `${event.old_mode || '—'} → ${event.mode || '—'}`];
          } else if (event.type === 'UNDONE') {
            title = <><b>{actor}</b> undid the collection</>;
            details = [when(event.at)];
          } else {
            title = event.type;
            details = [when(event.at)];
          }
          return (
            <Timeline.Item key={event.id} color={tone} bullet={<span className={css.dot} data-tone={tone} />}
              title={
                <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
                  <Text size="sm" className={css.title}>{title}</Text>
                  {(canReverse(event) || canChangeMode(event)) && (
                    <Menu position="bottom-end" shadow="md" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Payment actions for ${amount}`}><IconDots size={15} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {canChangeMode(event) && <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setChangingMode(paymentOf(event))}>Change payment mode</Menu.Item>}
                        {canReverse(event) && <Menu.Item color="red" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing(paymentOf(event))}>Reverse payment</Menu.Item>}
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              }
            >
              <Text size="xs" c="dimmed">{details.filter(Boolean).join(' · ')}</Text>
              {extra}
            </Timeline.Item>
          );
        })}
        {balance > 0.009 && (
          <Timeline.Item key="due" bullet={<span className={css.dot} data-tone="due" />}
            title={<Text size="sm" className={css.title}><b className={css.red}>{money(balance)}</b> still due</Text>}>
            <Text size="xs" c="dimmed">Waiting for payment</Text>
          </Timeline.Item>
        )}
      </Timeline>
      {isAdmin && <ReversePaymentModal payment={reversing} onClose={() => setReversing(null)} onSaved={onReversed} />}
      {isAdmin && <ChangeModeModal payment={changingMode} onClose={() => setChangingMode(null)} onSaved={onReversed} />}
    </Stack>
  );
}

