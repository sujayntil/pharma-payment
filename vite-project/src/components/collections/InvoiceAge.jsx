import { Text } from '@mantine/core';
import { daysSince } from '../../utils/formatters';
import { creditDaysFor } from '../../utils/credit';

/** Age colours: red once overdue (40 days; 60 for distributors), amber in the 10 days before. */
function ageColor(days, credit) {
  if (days >= credit) return 'red.7';
  if (days >= credit - 10) return 'orange.7';
  return 'dimmed';
}

/**
 * "19 days" since the invoice date, for invoices still to be collected.
 * Renders nothing for paid invoices or when the date is missing.
 * block: put it on its own line (table cells).
 */
export default function InvoiceAge({ date, pending, customerType, size = 'xs', prefix = ' · ', block = false }) {
  const days = daysSince(date);
  if (days == null || !(Number(pending) > 0)) return null;
  const color = ageColor(days, creditDaysFor(customerType));
  return (
    <Text span size={size} c={color} fw={color === 'dimmed' ? 400 : 600} style={{ whiteSpace: 'nowrap', ...(block && { display: 'block' }) }}>
      {prefix}{days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
    </Text>
  );
}
