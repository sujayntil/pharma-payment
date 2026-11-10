import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Loader, Menu, Paper, SimpleGrid, Stack, Text, ThemeIcon, Timeline } from '@mantine/core';
import { IconArrowBackUp, IconCash, IconDots, IconFileInvoice, IconFlag } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { useAuth } from '../../hooks/useAppStore';
import { dateTime, errorText, money, shortDate } from '../../utils/formatters';
import { ReversedBadge, StatusBadge } from './CollectionBadges';
import { useSidePanelWidth } from '../../hooks/useSidePanelSpace';
import { useActorLabel } from './collectionUtils';
import ReversePaymentModal from './ReversePaymentModal';

const EVENT_STYLE = {
  CREATED: { color: 'blue', icon: IconFileInvoice },
  COLLECTED: { color: 'green', icon: IconCash },
  REVERSED: { color: 'orange', icon: IconArrowBackUp },
};

function eventTitle(event) {
  if (event.type === 'CREATED') return 'Invoice created';
  if (event.type === 'REVERSED') return 'Payment reversed';
  if (event.type === 'COLLECTED') return event.after_reversal ? 'Collection recorded again' : 'Collection recorded';
  return event.type;
}

/**
 * The one invoice history view. Bottom sheet on phones, side panel on
 * desktop. Used by My Collections, MR Invoices, Admin Invoices, customer
 * ledgers and the Admin collections ledger. Read-only for MRs; an Admin gets
 * a "⋯ > Reverse payment" menu on each collection that can still be reversed.
 *
 * onChanged:  called after an Admin reversal so the list behind can reload.
 * onRecord:   (invoice) => void. When given, a "Record collection" button is
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
export default function InvoiceHistory({ invoiceId, onClose, onChanged, onRecord, refreshKey = 0, actions }) {
  const isMobile = useIsMobile();
  useBackClose(!!invoiceId, onClose);
  const panelWidth = useSidePanelWidth();
  return (
    <Drawer
      opened={!!invoiceId}
      onClose={onClose}
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? '88dvh' : `min(${panelWidth}px, 100%)`}
      radius={isMobile ? 'lg' : 0}
      title={<Text fw={700}>Invoice details</Text>}
      closeButtonProps={{ 'aria-label': 'Close invoice details' }}
      {...(!isMobile && { withOverlay: false, trapFocus: false, lockScroll: false, closeOnClickOutside: false, shadow: 'xl', styles: { inner: { top: 64, height: 'calc(100% - 64px)' } } })}
    >
      {invoiceId && <HistoryBody key={invoiceId} invoiceId={invoiceId} onChanged={onChanged} onRecord={onRecord} refreshKey={refreshKey} actions={actions} />}
    </Drawer>
  );
}

function Meta({ children }) {
  return <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{children}</Text>;
}

function HistoryBody({ invoiceId, onChanged, onRecord, refreshKey, actions }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [reversing, setReversing] = useState(null);
  const who = useActorLabel();
  const isAdmin = useAuth().role === 'ADMIN';

  useEffect(() => {
    let active = true;
    invoicesApi.getInvoiceHistory(invoiceId)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, [invoiceId, reload, refreshKey]);

  if (error) return <Alert color="red">{error}</Alert>;
  if (!data) return <Group justify="center" p="xl"><Loader /></Group>;
  const { invoice, events } = data;
  const onReversed = () => { setReload((value) => value + 1); onChanged?.(); };
  // Nothing can be reversed once the invoice holds no collected amount (e.g.
  // an older invoice-level "Mark unpaid"), so the option is hidden then too.
  const canReverse = (event) => isAdmin && event.type === 'COLLECTED' && event.payment_id && !event.fully_reversed && Number(invoice.paid_amount) > 0;

  return (
    <Stack gap="md">
      <Paper withBorder p="sm" radius="md" bg="gray.0">
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
        <Text size="sm" fw={600} mt={2} style={{ overflowWrap: 'anywhere' }}>{invoice.customer_name || '—'}</Text>
        {isAdmin && <Text size="sm" c="dimmed">MR: {invoice.mr_name || 'Unassigned'}</Text>}
        <Group gap={6} wrap="wrap" mt={6}><StatusBadge status={invoice.status} />{invoice.is_reversed && <ReversedBadge />}</Group>
        <SimpleGrid cols={3} spacing="xs" mt="xs">
          <div><Text size="xs" c="dimmed">Bill</Text><Text size="sm" fw={700}>{money(invoice.total_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Collected</Text><Text size="sm" fw={700} c="green.8">{money(invoice.paid_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Pending</Text><Text size="sm" fw={700} c={Number(invoice.pending_amount) > 0 ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Text></div>
        </SimpleGrid>
      </Paper>
      {onRecord && (Number(invoice.pending_amount) > 0
        ? <Button fullWidth size="md" leftSection={<IconCash size={18} />} onClick={() => onRecord(invoice)}>Record collection</Button>
        : <Text size="sm" c="dimmed" ta="center">Fully paid. Nothing to collect.</Text>)}
      <Text fw={700} size="sm">History</Text>

      <Timeline bulletSize={28} lineWidth={2} active={events.length} color="gray">
        {events.map((event) => {
          const style = EVENT_STYLE[event.type] || { color: 'gray', icon: IconFlag };
          const Icon = style.icon;
          const isReversal = event.type === 'REVERSED';
          const remarks = event.reason || event.reference;
          const reversedOut = event.type === 'COLLECTED' && event.fully_reversed;
          return (
            <Timeline.Item
              key={event.id}
              color={style.color}
              bullet={<ThemeIcon size={28} radius="xl" color={style.color} variant="filled"><Icon size={15} /></ThemeIcon>}
              title={
                <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
                  <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                    <Text fw={700} size="sm" c={isReversal ? 'orange.8' : undefined}>{eventTitle(event)}</Text>
                    {event.kind && <Badge size="xs" variant="light" color={event.kind === 'full' ? 'green' : 'yellow'}>{event.kind === 'full' ? 'Full' : 'Partial'}</Badge>}
                    {reversedOut && <Badge size="xs" variant="light" color="orange">Reversed</Badge>}
                  </Group>
                  {canReverse(event) && (
                    <Menu position="bottom-end" shadow="md" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" size="md" aria-label={`Payment actions for ${money(event.amount)}`}><IconDots size={16} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item color="red" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing({
                          payment_id: event.payment_id,
                          amount: event.amount,
                          mode: event.mode,
                          payment_date: event.at,
                          transaction_reference: event.reference,
                          invoice_number: invoice.invoice_number,
                          customer_name: invoice.customer_name,
                        })}>Reverse payment</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              }
            >
              <Meta>{event.type === 'CREATED' ? shortDate(event.invoice_date || event.at) : dateTime(event.at)}</Meta>
              {event.amount != null && (
                <Group gap={6} wrap="wrap" mt={2}>
                  <Text size="sm" fw={700} td={reversedOut ? 'line-through' : undefined} c={isReversal ? 'orange.8' : reversedOut ? 'dimmed' : event.type === 'COLLECTED' ? 'green.8' : undefined}>
                    {isReversal ? '−' : ''}{money(event.amount)}
                  </Text>
                  {event.mode && <Badge size="sm" variant="light" color={isReversal ? 'orange' : 'gray'}>{event.mode}</Badge>}
                </Group>
              )}
              {event.actor && <Meta>{who(event.actor)}</Meta>}
              {remarks && <Meta>{event.reason ? `Reason: ${event.reason}` : remarks}</Meta>}
            </Timeline.Item>
          );
        })}
        <Timeline.Item
          color="gray"
          bullet={<ThemeIcon size={28} radius="xl" color="gray" variant="light"><IconFlag size={15} /></ThemeIcon>}
          title={<Text fw={700} size="sm">Current status</Text>}
        >
          <Group gap={6} wrap="wrap" mt={2}><StatusBadge status={invoice.status} />{invoice.is_reversed && <ReversedBadge />}</Group>
          <Meta>Collected {money(invoice.paid_amount)} · Pending {money(invoice.pending_amount)}</Meta>
        </Timeline.Item>
      </Timeline>
      {isAdmin && <ReversePaymentModal payment={reversing} onClose={() => setReversing(null)} onSaved={onReversed} />}
    </Stack>
  );
}
