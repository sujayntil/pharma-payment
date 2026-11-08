import { Text } from '@mantine/core';
import RowCard from '../common/RowCard';
import { money, shortDate } from '../../utils/formatters';
import { StatusCell } from './CollectionBadges';
import { recorderOf, useActorLabel } from './collectionUtils';

/**
 * The one short phone card for an invoice, three lines:
 *   invoice number            pending amount
 *   customer · date           pending / settled
 *   status badges             Recorded by <who>
 * Tapping it opens the invoice sheet (summary, Record collection, history).
 *
 * invoice: any invoice-shaped row (invoice list, outstanding list, ledger).
 */
export default function InvoiceCard({ invoice, showCustomer = true, onOpen }) {
  const label = useActorLabel();
  const pending = Number(invoice.pending_amount || 0);
  const customer = invoice.customer_name ?? invoice.customer;
  const date = invoice.invoice_date ?? invoice.date;
  const recorder = recorderOf(invoice);
  return (
    <RowCard
      onClick={onOpen}
      title={invoice.invoice_number}
      subtitle={[showCustomer && (customer || '—'), shortDate(date)].filter(Boolean).join(' · ')}
      amount={money(pending)}
      amountLabel={pending > 0 ? 'pending' : 'settled'}
      amountColor={pending > 0 ? 'red' : 'green'}
      badges={<>
        <StatusCell row={invoice} />
        <Text size="xs" c="dimmed" ta="right" ml="auto" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {recorder ? <>Recorded by <Text span size="xs" fw={600} c="var(--mantine-color-text)">{label(recorder)}</Text></> : 'No collection yet'}
        </Text>
      </>}
    />
  );
}
