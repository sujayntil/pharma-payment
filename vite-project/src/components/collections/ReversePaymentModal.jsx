import { useState } from 'react';
import { Alert, Badge, Button, Chip, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { adminApi } from '../../api/adminApi';
import { dateTime, errorText, money } from '../../utils/formatters';

const REASONS = ['Cheque bounced', 'Wrong amount', 'Wrong invoice', 'Duplicate entry', 'Other'];

/**
 * Admin-only. Reverses one whole collection (a payments-ledger row) with a
 * mandatory reason. The original entry stays; a linked reversal entry is
 * added, totals drop by that amount and the invoice returns to pending.
 * To correct a wrong amount: reverse it, then record the right amount.
 *
 * payment: { payment_id, amount, mode, payment_date, transaction_reference,
 *            invoice_number, customer_name }
 */
export default function ReversePaymentModal({ payment, onClose, onSaved }) {
  return (
    <Modal opened={!!payment} onClose={onClose} title={`Reverse payment · ${payment?.invoice_number || ''}`} centered zIndex={250}>
      {payment && <ReverseForm key={payment.payment_id} payment={payment} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ReverseForm({ payment, onClose, onSaved }) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reason = choice === 'Other' ? other.trim() : choice;

  const confirm = async () => {
    if (!reason) { setError('Choose or enter a reason.'); return; }
    setBusy(true); setError('');
    try {
      const result = await adminApi.reversePayment(payment.payment_id, { reason });
      notifications.show({ color: 'orange', title: 'Payment reversed', message: `${money(result.reversed_amount)} reversed on ${payment.invoice_number}.` });
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not reverse this payment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <Paper withBorder p="sm" bg="gray.0">
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text fw={700} size="lg">{money(payment.amount)}</Text>
          {payment.mode && <Badge variant="light" color="gray">{payment.mode}</Badge>}
        </Group>
        {payment.customer_name && <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{payment.customer_name}</Text>}
        <Text size="sm" c="dimmed">{dateTime(payment.payment_date)}</Text>
        {payment.transaction_reference && <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>Ref: {payment.transaction_reference}</Text>}
      </Paper>
      <Text size="sm" c="dimmed">The full payment is reversed. The invoice goes back to pending, and the original entry stays in the history.</Text>
      <div>
        <Text size="sm" fw={500} mb={6}>Reason <Text span c="red">*</Text></Text>
        <Chip.Group multiple={false} value={choice} onChange={(value) => { setChoice(value); setError(''); }}>
          <Group gap={8} wrap="wrap">
            {REASONS.map((item) => <Chip key={item} value={item} size="sm" variant="outline" color="orange">{item}</Chip>)}
          </Group>
        </Chip.Group>
      </div>
      {choice === 'Other' && (
        <Textarea placeholder="Describe the reason" maxLength={200} autosize minRows={2} value={other} onChange={(e) => setOther(e.currentTarget.value)} data-autofocus />
      )}
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="end">
        <Button variant="default" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button color="red" loading={busy} disabled={!reason} onClick={confirm}>Reverse payment</Button>
      </Group>
    </Stack>
  );
}
