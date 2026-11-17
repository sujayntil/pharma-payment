import { Text, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import classes from './InvoiceCard.module.css';
import RowCard from '../common/RowCard';
import { money, shortDate } from '../../utils/formatters';
import { StatusCell } from './CollectionBadges';
import { recorderOf, useActorLabel } from './collectionUtils';
import InvoiceAge from './InvoiceAge';
import { useLongPress } from '../../hooks/useLongPress';

/**
 * The one short phone card for an invoice, three lines:
 *   invoice number · date · 19 days   pending amount (red) / bill amount (grey)
 *   customer · MR                     pending / paid
 *   status badges                 Recorded by <who>
 * The age shows only while something is pending (amber 30+, red 40+ days).
 * A paid invoice with no collection in the app (e.g. older data) leaves the
 * "who" line blank rather than saying "No collection yet".
 * Tapping it opens the invoice sheet (summary, Collect, history).
 *
 * invoice: any invoice-shaped row (invoice list, outstanding list, ledger).
 * actions: optional buttons shown at the bottom of the card (tapping them
 *          does not open the invoice sheet).
 * afterStatus: optional small controls shown right after the status badge.
 * showMr: add the invoice's MR after the customer (Admin lists).
 * onSelect / selected / selecting: press and hold a pending invoice to start
 *   selecting (customer screen); while selecting, taps tick instead of opening.
 */
export default function InvoiceCard({ invoice, showCustomer = true, showMr = false, onOpen, actions, afterStatus, onSelect, selected = false, selecting = false }) {
  const label = useActorLabel();
  const pending = Number(invoice.pending_amount || 0);
  const customer = invoice.customer_name ?? invoice.customer;
  const date = invoice.invoice_date ?? invoice.date;
  const recorder = recorderOf(invoice);
  const bill = invoice.total_amount ?? invoice.amount;
  const settled = pending <= 0;
  const canSelect = Boolean(onSelect) && !settled;
  const tap = selecting ? (canSelect ? () => onSelect(invoice) : undefined) : onOpen;
  const press = useLongPress(() => onSelect?.(invoice), tap, { enabled: canSelect && !selecting });
  return (
    <RowCard
      onClick={press.onClick}
      press={canSelect && !selecting ? press : undefined}
      // Selecting: same layout; a ticked card turns green with a ✓ on its left edge.
      highlight={selecting && selected ? 'var(--mantine-color-green-0)' : undefined}
      borderColor={selecting && selected ? 'var(--mantine-color-green-5)' : undefined}
      marker={selecting && canSelect ? <SelectMark selected={selected} onToggle={() => onSelect(invoice)} label={invoice.invoice_number} /> : null}
      title={<>
        <span style={{ whiteSpace: 'nowrap' }}>{invoice.invoice_number}</span>
        {date && (
          // The date never splits across lines: it stays whole beside the number.
          <Text span size="xs" c="dimmed" fw={400} ml={8} style={{ whiteSpace: 'nowrap' }}>
            {shortDate(date)}<InvoiceAge date={date} pending={pending} />
          </Text>
        )}
      </>}
      subtitle={[showCustomer && (customer || '—'), showMr && (invoice.mr_name || 'Unassigned')].filter(Boolean).join(' · ') || null}
      amount={money(settled && bill != null ? bill : pending)}
      amountLabel={settled ? 'paid' : 'pending'}
      amountColor={settled ? 'dimmed' : 'red'}
      badges={<>
        <StatusCell row={invoice} />
        {afterStatus}
        {(recorder || !settled) && (
          <Text size="xs" c="dimmed" ta="right" ml="auto" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {recorder ? <>Recorded by <Text span size="xs" fw={600} c="var(--mantine-color-text)">{label(recorder)}</Text></> : 'No collection yet'}
          </Text>
        )}
      </>}
      // While selecting, Collect greys out in place (nothing moves); call / WhatsApp stay.
      actions={actions && <div data-selecting={selecting || undefined} className={classes.actionsWrap}>{actions}</div>}
    />
  );
}

/** Round ✓ on the card's edge: filled green when ticked, an empty ring otherwise. */
function SelectMark({ selected, onToggle, label }) {
  return (
    <UnstyledButton
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${label}`}
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      style={{
        width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: selected ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-body)',
        border: `2px solid ${selected ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-4)'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.15)',
      }}
    >
      {selected && <IconCheck size={14} stroke={3} color="white" />}
    </UnstyledButton>
  );
}
