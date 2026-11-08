import { useEffect, useState } from 'react';
import { Alert, Badge, Group, Loader, Modal, Paper, SimpleGrid, Stack, Text, Timeline } from '@mantine/core';
import { IconArrowBackUp, IconCash } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { dateTime, errorText, money } from '../../utils/formatters';
import { RecordedBy, StatusBadge } from './CollectionBadges';

/** Timeline of every collection entry on one invoice. */
export default function PaymentHistoryModal({ invoiceId, onClose }) {
  return (
    <Modal opened={!!invoiceId} onClose={onClose} title="Collection history" centered size="lg">
      {invoiceId && <History key={invoiceId} invoiceId={invoiceId} />}
    </Modal>
  );
}

function History({ invoiceId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    invoicesApi.getInvoicePayments(invoiceId)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, [invoiceId]);

  if (error) return <Alert color="red">{error}</Alert>;
  if (!data) return <Group justify="center" p="xl"><Loader /></Group>;
  const { invoice, payments } = data;

  return (
    <Stack>
      <Paper withBorder p="sm" bg="gray.0">
        <Group justify="space-between" mb="xs">
          <Text fw={700}>{invoice.invoice_number} · {invoice.customer_name || '—'}</Text>
          <StatusBadge status={invoice.status} />
        </Group>
        <SimpleGrid cols={3} spacing="xs">
          <div><Text size="xs" c="dimmed">Bill amount</Text><Text fw={600}>{money(invoice.total_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Collected</Text><Text fw={600} c="green">{money(invoice.paid_amount)}</Text></div>
          <div><Text size="xs" c="dimmed">Pending</Text><Text fw={600} c="red">{money(invoice.pending_amount)}</Text></div>
        </SimpleGrid>
      </Paper>
      {!payments.length ? <Text c="dimmed" ta="center" py="md">No collections recorded yet.</Text> : (
        <Timeline bulletSize={26} lineWidth={2} active={payments.length}>
          {payments.map((payment) => (
            <Timeline.Item
              key={payment.payment_id}
              color={payment.is_reversal ? 'orange' : 'green'}
              bullet={payment.is_reversal ? <IconArrowBackUp size={14} /> : <IconCash size={14} />}
              title={
                <Group gap="xs">
                  <Text fw={700} c={payment.is_reversal ? 'orange.8' : undefined}>{payment.is_reversal ? '−' : ''}{money(Math.abs(payment.amount))}</Text>
                  <Badge size="sm" variant="light" color={payment.is_reversal ? 'orange' : 'gray'}>{payment.mode || '—'}</Badge>
                </Group>
              }
            >
              <Group gap={6} c="dimmed" fz="sm"><RecordedBy row={payment} /><span>· {dateTime(payment.payment_date)}</span></Group>
              {payment.transaction_reference && <Text size="sm" c="dimmed">{payment.transaction_reference}</Text>}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Stack>
  );
}
