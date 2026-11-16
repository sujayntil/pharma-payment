import { useCallback, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../hooks/useAppStore';
import { useBackClose } from '../../hooks/useBackClose';
import { errorText, money } from '../../utils/formatters';
import { toCollectionTarget } from './collectionUtils';
import PaymentModeField from './PaymentModeField';
import { lastPaymentMode, referenceFor, rememberPaymentMode } from './paymentModes';
import { showUndoBar } from './undoBar';
import CollectionCelebration from './CollectionCelebration';
import { pickHeadline } from './celebrationText';
import { autoFocusOnLaptop } from '../../utils/focus';

/**
 * The one "Collect" form used by both MRs and Admins. When an
 * Admin records for a customer with an assigned MR, the collection is saved
 * under that MR and the Admin is stored as who recorded it.
 *
 * invoice: record against this invoice (My Collections, lists, ledgers)
 */
export default function RecordCollectionModal({ invoice, onClose, onSaved }) {
  const target = toCollectionTarget(invoice);
  const opened = !!target;
  useBackClose(opened, onClose);
  const title = `Collect · ${target?.invoiceNumber || ''}`;
  // MRs get a short celebration after saving (Admins keep the plain toast).
  const [celebration, setCelebration] = useState(null);
  // When the celebration ends, the Undo bar takes over for 10 seconds.
  const endCelebration = useCallback(() => {
    if (celebration?.undo) showUndoBar(celebration.undo);
    setCelebration(null);
  }, [celebration]);
  return (
    <>
    {/* zIndex 250: above the invoice panel and ledger drawers (200) so it never
        opens behind them, and below dropdown lists (300) so Payment mode still works. */}
    <Modal opened={opened} onClose={onClose} title={title} centered zIndex={250}>
      {/* Remounting per invoice resets the form without effects. */}
      {target && <CollectionForm key={target.invoiceId} target={target} onClose={onClose} onSaved={onSaved} onCelebrate={setCelebration} />}
    </Modal>
    <CollectionCelebration celebration={celebration} onDone={endCelebration} />
    </>
  );
}

function CollectionForm({ target, onClose, onSaved, onCelebrate }) {
  const { role, name } = useAuth();
  const isAdmin = role === 'ADMIN';
  // One amount box: it opens with the full pending amount selected, so Save
  // collects in full and typing a number replaces it for a part payment.
  const [amount, setAmount] = useState(target.pending);
  const [mode, setMode] = useState(lastPaymentMode);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const value = Number(amount);
  const entered = amount !== '' && Number.isFinite(value) && value > 0;
  const tooMuch = entered && value > target.pending + 0.01;
  const clears = entered && !tooMuch && Math.abs(target.pending - value) < 0.01;

  const submit = async (event) => {
    event.preventDefault();
    if (target.pending <= 0) {
      setError('This invoice is already fully paid.');
      return;
    }
    if (!entered || tooMuch) {
      setError(`Enter an amount between ₹0.01 and ${money(target.pending)}.`);
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await paymentsApi.createPayment({
        invoice_id: target.invoiceId,
        amount: value,
        mode: mode || null,
        transaction_reference: referenceFor(mode, reference),
      });
      rememberPaymentMode(mode);
      const undo = { paymentId: result.payment_id, message: `${money(value)} collected · ${target.invoiceNumber}` };
      if (role === 'MR' && onCelebrate) {
        onCelebrate({ amount: value, left: Math.max(target.pending - value, 0), cleared: clears, customer: target.customer, headline: pickHeadline(clears), undo });
      } else {
        showUndoBar(undo);
      }
      onSaved?.(result, value);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not record collection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack>
        <Paper withBorder p="sm" bg="gray.0">
          <SimpleGrid cols={2} spacing="xs">
            <div style={{ minWidth: 0 }}><Text size="xs" c="dimmed">Customer</Text><Text fw={600} style={{ overflowWrap: 'anywhere' }}>{target.customer || '—'}</Text></div>
            <div><Text size="xs" c="dimmed">Pending balance</Text><Text fw={700} c="red">{money(target.pending)}</Text></div>
            {isAdmin && <div style={{ minWidth: 0 }}><Text size="xs" c="dimmed">Assigned MR</Text><Text fw={600} style={{ overflowWrap: 'anywhere' }}>{target.mrName || 'Unassigned'}</Text></div>}
            {target.paid > 0 && <div><Text size="xs" c="dimmed">Already collected</Text><Text fw={600}>{money(target.paid)}</Text></div>}
          </SimpleGrid>
        </Paper>
        {isAdmin && target.mrName && (
          <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
            This collection is saved under {target.mrName} and counts in their totals. Recorded by shows “Admin - {name || 'Admin'}”.
          </Alert>
        )}
        <div>
          <NumberInput
            label="Amount received (₹)"
            min={0.01}
            decimalScale={2}
            thousandSeparator=","
            hideControls
            inputMode="decimal"
            required
            value={amount}
            onChange={setAmount}
            onFocus={(event) => event.currentTarget.select()}
            data-autofocus={autoFocusOnLaptop()}
          />
          {/* Nothing under the box for the full amount; a balance or a warning otherwise. */}
          {!clears && (
            <Text size="sm" mt={6} fw={entered ? 600 : 400} c={tooMuch ? 'red' : entered ? undefined : 'dimmed'} aria-live="polite">
              {tooMuch
                ? `More than pending (${money(target.pending)})`
                : entered
                  ? `Balance: ${money(target.pending - value)}`
                  : 'Enter the amount received'}
            </Text>
          )}
        </div>
        <PaymentModeField mode={mode} onMode={setMode} reference={reference} onReference={setReference} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="end">
          <Button variant="default" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{entered && !tooMuch ? `Save ${money(value)}` : 'Save'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
