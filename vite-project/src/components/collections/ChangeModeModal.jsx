import { useState } from 'react';
import { Alert, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { adminApi } from '../../api/adminApi';
import { useBackClose } from '../../hooks/useBackClose';
import { dateTime, errorText, money } from '../../utils/formatters';
import PaymentModeField from './PaymentModeField';

/**
 * Admin only: correct how a collection was paid (Cash / UPI / Cheque... and
 * its UTR or cheque number). The amount, date and who collected stay; to
 * fix an amount, reverse it and record it again. Logged in the Audit log.
 *
 * payment: { payment_id, amount, mode, payment_date, transaction_reference,
 *            invoice_number, customer_name, collected_by }
 */
export default function ChangeModeModal({ payment, onClose, onSaved }) {
  useBackClose(!!payment, onClose);
  return (
    <Modal opened={!!payment} onClose={onClose} title={`Change payment mode · ${payment?.invoice_number || ''}`} centered zIndex={250}>
      {payment && <ChangeModeForm key={payment.payment_id} payment={payment} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ChangeModeForm({ payment, onClose, onSaved }) {
  const [mode, setMode] = useState(payment.mode || null);
  const [reference, setReference] = useState(payment.transaction_reference || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = mode && (mode !== (payment.mode || null) || reference.trim() !== (payment.transaction_reference || ''));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await adminApi.changePaymentMode(payment.payment_id, { mode, transaction_reference: mode === 'Cash' ? null : reference.trim() || null });
      notifications.show({ color: 'green', message: `Mode changed to ${mode}` });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      {/* What is being corrected: these stay the same. */}
      <Paper withBorder radius="md" p="sm" bg="var(--app-soft)">
        <Group justify="space-between" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} size="lg">{money(payment.amount)}</Text>
            <Text size="xs" c="dimmed" truncate>{[payment.customer_name, payment.payment_date && dateTime(payment.payment_date), payment.collected_by && `by ${payment.collected_by}`].filter(Boolean).join(' · ')}</Text>
          </div>
          <Text size="xs" c="dimmed" ta="right" style={{ flexShrink: 0 }}>Now: <b style={{ color: 'var(--mantine-color-text)' }}>{payment.mode || 'Not set'}</b></Text>
        </Group>
      </Paper>
      <PaymentModeField mode={mode} onMode={(next) => { setMode(next); setError(''); }} reference={reference} onReference={setReference} />
      <Text size="xs" c="dimmed">Only the mode changes. Amount and date stay; to fix an amount, reverse it and record again.</Text>
      {error && <Alert color="red" variant="light">{error}</Alert>}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={!changed}>Save</Button>
      </Group>
    </Stack>
  );
}
