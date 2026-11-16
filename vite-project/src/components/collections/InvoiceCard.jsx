import { Text } from '@mantine/core';
import RowCard from '../common/RowCard';
import { money, shortDate } from '../../utils/formatters';
import { StatusCell } from './CollectionBadges';
import { recorderOf, useActorLabel } from './collectionUtils';
import InvoiceAge from './InvoiceAge';

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
 */
export default function InvoiceCard({ invoice, showCustomer = true, showMr = false, onOpen, actions, afterStatus }) {
  const label = useActorLabel();
  const pending = Number(invoice.pending_amount || 0);
  const customer = invoice.customer_name ?? invoice.customer;
  const date = invoice.invoice_date ?? invoice.date;
  const recorder = recorderOf(invoice);
  const bill = invoice.total_amount ?? invoice.amount;
  const settled = pending <= 0;
  return (
    <RowCard
      onClick={onOpen}
      title={<>
        {invoice.invoice_number}
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
      actions={actions}
    />
  );
}
