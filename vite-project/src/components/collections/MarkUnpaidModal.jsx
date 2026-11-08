import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { adminApi } from '../../api/adminApi';
import { errorText, money } from '../../utils/formatters';
import { toCollectionTarget } from './collectionUtils';

/**
 * Admin-only. Marks an invoice unpaid by adding a reversal entry to the
 * payments ledger, so collection totals drop by the reversed amount.
 */
export default function MarkUnpaidModal({ invoice, onClose, onSaved }) {
  const target = toCollectionTarget(invoice);
  return (
    <Modal opened={!!target} onClose={onClose} title={`Mark unpaid · ${target?.invoiceNumber || ''}`} centered>
      {target && <UnpaidForm key={target.invoiceId} target={target} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function UnpaidForm({ target, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    // A reversal always needs a reason.
    if (!reason.trim()) { setError('Enter a reason for the reversal.'); return; }
    setBusy(true); setError('');
    try {
      const result = await adminApi.overrideCollectionStatus(target.invoiceId, 'UNPAID', { reason: reason.trim() || null });
      const reversed = Math.abs(Number(result.ledger_amount || 0));
      notifications.show({
        color: 'orange',
        title: 'Invoice marked unpaid',
        message: reversed ? `${money(reversed)} reversed on ${target.invoiceNumber}.` : `${target.invoiceNumber} is now unpaid.`,
      });
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not mark the invoice unpaid.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <Text size="sm">
        {target.customer ? <><b>{target.customer}</b> · </> : null}Collected so far: <b>{money(target.paid)}</b>
      </Text>
      <Alert color="orange" variant="light">
        A reversal entry for the collected amount is added to the collections ledger, so collection totals go down. Original payment entries stay in the history.
        {target.mrName ? ` ${target.mrName} will see the invoice as “Reversed”.` : ''}
      </Alert>
      <TextInput label="Reason" required placeholder="e.g. Cheque bounced, entered by mistake" maxLength={200} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="end">
        <Button variant="default" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button color="red" loading={busy} disabled={!reason.trim()} onClick={confirm}>Mark unpaid</Button>
      </Group>
    </Stack>
  );
}
