import { useState } from 'react';
import { Alert, Button, Chip, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { money } from '../../utils/formatters';

const REASONS = ['Duplicate', 'Wrong entry', 'Cancelled by customer', 'Other'];

/**
 * Confirm deleting one or more invoices. When money was collected on them a
 * reason is required (that money drops out of the totals); otherwise it's a
 * plain confirm. onConfirm(reason) — reason is '' when none was needed.
 * Deleted invoices can be restored for 30 days from Audit log › Deleted.
 */
export default function DeleteInvoicesModal({ invoices, onClose, onConfirm }) {
  const list = invoices || [];
  return (
    <Modal opened={list.length > 0} onClose={onClose} title={list.length > 1 ? `Delete ${list.length} invoices` : 'Delete invoice'} centered zIndex={250}>
      {list.length > 0 && <DeleteForm key={list.map((i) => i.id).join(',')} list={list} onClose={onClose} onConfirm={onConfirm} />}
    </Modal>
  );
}

function DeleteForm({ list, onClose, onConfirm }) {
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const collected = list.reduce((sum, i) => sum + Math.max(Number(i.paid_amount ?? 0), 0), 0);
  const needsReason = collected > 0;
  const reason = pick === 'Other' ? note.trim() : pick;
  const ready = !needsReason || Boolean(reason);
  const names = list.slice(0, 3).map((i) => i.invoice_number).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
  return (
    <Stack>
      <Alert color="red">
        Delete {names}? {list.length > 1 ? 'Their' : 'Its'} collection history is removed too and balances recalculate.
        {needsReason && <Text size="sm" fw={700} mt={6}>{money(collected)} collected will be removed from the totals.</Text>}
      </Alert>
      {needsReason && (
        <div>
          <Text size="sm" fw={600} mb={6}>Why? <Text span c="dimmed" fw={400}>(needed because money was collected)</Text></Text>
          <Chip.Group value={pick} onChange={setPick}>
            <Group gap={6}>{REASONS.map((r) => <Chip key={r} value={r} size="sm" radius="xl" variant="outline">{r}</Chip>)}</Group>
          </Chip.Group>
          {pick === 'Other' && <TextInput mt="sm" placeholder="Write the reason" value={note} onChange={(e) => setNote(e.currentTarget.value)} maxLength={300} data-autofocus />}
        </div>
      )}
      <Text size="xs" c="dimmed">You can restore it within 30 days from Audit log › Deleted.</Text>
      <Group justify="end">
        <Button variant="default" onClick={onClose}>Cancel</Button>
        <Button color="red" disabled={!ready} onClick={() => onConfirm(needsReason ? reason : '')}>{list.length > 1 ? `Delete ${list.length} invoices` : 'Delete invoice'}</Button>
      </Group>
    </Stack>
  );
}
