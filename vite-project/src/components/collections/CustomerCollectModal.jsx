import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Group, Loader, Modal, NumberInput, Stack, Text } from '@mantine/core';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../hooks/useAppStore';
import { useBackClose } from '../../hooks/useBackClose';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { autoFocusOnLaptop } from '../../utils/focus';
import { errorText, money } from '../../utils/formatters';
import CollectionCelebration from './CollectionCelebration';
import PaymentModeField from './PaymentModeField';
import { pickHeadline } from './celebrationText';
import { lastPaymentMode, referenceFor, rememberPaymentMode } from './paymentModes';
import { showUndoBar } from './undoBar';

/**
 * The one Collect sheet: amount (pre-filled), payment mode, Save.
 *
 * customer: { id, name }               Collect all (every pending invoice)
 *           { id, name, invoiceIds }   the invoices ticked on the customer screen
 * invoice:  { invoiceId, invoiceNumber, customer }   one invoice
 * A lower amount is split oldest first over the chosen invoices.
 * onSaved(): reload the screen behind.
 */
export default function CustomerCollectModal({ customer = null, invoice = null, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const opened = Boolean(customer || invoice);
  useBackClose(opened, onClose);
  useSwipeDownToClose(opened && isMobile, onClose);
  const [celebration, setCelebration] = useState(null);
  const endCelebration = useCallback(() => {
    if (celebration?.undo) showUndoBar(celebration.undo);
    setCelebration(null);
  }, [celebration]);

  const key = invoice ? `i${invoice.invoiceId}` : customer ? `c${customer.id}-${(customer.invoiceIds || []).join(',')}` : 'none';
  const title = (
    <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
      {invoice ? `Collect · ${invoice.invoiceNumber}` : customer?.invoiceIds ? `Collect · ${customer.name}` : `Collect all · ${customer?.name || ''}`}
    </Text>
  );
  const body = opened && <CollectForm key={key} customer={customer} invoice={invoice} onClose={onClose} onSaved={onSaved} onCelebrate={setCelebration} />;
  return (
    <>
      {isMobile ? (
        <Drawer opened={opened} onClose={onClose} position="bottom" radius="lg" size="auto" zIndex={250} title={title}
          classNames={{ content: SWIPE_SHEET_CLASS }} styles={{ content: { maxHeight: '92dvh' }, body: { paddingBottom: 0 } }}>
          {body}
        </Drawer>
      ) : (
        <Modal opened={opened} onClose={onClose} title={title} centered size={460} zIndex={250}
          styles={{ body: { paddingBottom: 0 } }}>{body}</Modal>
      )}
      <CollectionCelebration celebration={celebration} onDone={endCelebration} />
    </>
  );
}

function CollectForm({ customer, invoice, onClose, onSaved, onCelebrate }) {
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(lastPaymentMode);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invoiceId = invoice?.invoiceId;
  const customerId = customer?.id;
  const picked = customer?.invoiceIds;
  const pickedKey = picked ? picked.join(',') : '';
  useEffect(() => {
    let active = true;
    paymentsApi.pendingInvoices(invoiceId ? { invoiceId } : { customerId })
      .then((result) => {
        if (!active) return;
        // One invoice, the ticked ones, or (Collect all) every pending one; oldest first.
        const wanted = invoiceId ? [result.selected_invoice_id] : pickedKey ? pickedKey.split(',').map(Number) : null;
        const items = wanted ? result.items.filter((item) => wanted.includes(item.id)) : result.items;
        setData({ ...result, items });
        setAmount(round(items.reduce((sum, item) => sum + item.pending_amount, 0)));
      })
      .catch((err) => { if (active) setLoadError(errorText(err, "Couldn't load the pending invoices.")); });
    return () => { active = false; };
  }, [invoiceId, customerId, pickedKey]);

  const invoices = data?.items;
  const value = Number(amount);
  const entered = amount !== '' && Number.isFinite(value) && value > 0;
  const plan = useMemo(() => allocate(invoices || [], entered ? value : 0), [invoices, entered, value]);
  const selectedCount = (invoices || []).length;
  const tooMuch = entered && value > plan.selectedPending + 0.01;
  const leftOnSelected = Math.max(round(plan.selectedPending - (entered && !tooMuch ? value : 0)), 0);

  const problem = !selectedCount ? 'Nothing pending.'
    : !entered ? 'Enter the amount received.'
      : tooMuch ? `Max ${money(plan.selectedPending)}`
        : '';

  const submit = async (event) => {
    event.preventDefault();
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    const chosen = invoices;
    try {
      let items;
      let paymentId;
      if (data.customer) {
        const result = await paymentsApi.createBatch({
          customer_id: data.customer.id,
          amount: value,
          invoice_ids: chosen.map((item) => item.id),
          mode,
          transaction_reference: referenceFor(mode, reference),
        });
        items = result.items;
        paymentId = items[0].payment_id;
      } else {
        // An invoice with no customer on it: collect on that invoice alone.
        const result = await paymentsApi.createPayment({
          invoice_id: chosen[0].id, amount: value, mode, transaction_reference: referenceFor(mode, reference),
        });
        items = [{ invoice_number: chosen[0].invoice_number, pending_amount: result.pending_amount }];
        paymentId = result.payment_id;
      }
      rememberPaymentMode(mode);
      const count = items.length;
      const cleared = items.filter((item) => (item.pending_amount || 0) <= 0.009).length;
      const everyTickedCleared = leftOnSelected <= 0.01;
      const undo = { paymentId, message: `${money(value)} collected · ${count === 1 ? items[0].invoice_number : `${count} invoices`}` };
      if (role === 'MR') {
        onCelebrate({
          amount: value,
          left: leftOnSelected,
          cleared: everyTickedCleared,
          customer: data.customer?.name || invoice?.customer,
          headline: pickHeadline(everyTickedCleared),
          detail: cleared > 1 ? `${cleared} invoices cleared` : null,
          undo,
        });
      } else {
        showUndoBar(undo);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not record the collection.'));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Alert color="red" variant="light" mb="md">{loadError}</Alert>;
  if (!invoices) return <Group justify="center" p="lg"><Loader size="sm" /></Group>;
  if (!invoices.length) return <Text c="dimmed" ta="center" py="lg">Nothing pending.</Text>;

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <NumberInput
          label="Amount received (₹)"
          min={0.01}
          decimalScale={2}
          thousandSeparator="," thousandsGroupStyle="lakh"
          hideControls
          inputMode="decimal"
          value={amount}
          onChange={(next) => { setAmount(next); setError(''); }}
          onFocus={(event) => event.currentTarget.select()}
          data-autofocus={autoFocusOnLaptop()}
          styles={{ input: { fontSize: 18, fontWeight: 700 } }}
        />
        {/* Part payment: what stays pending on the chosen invoices. */}
        {entered && !tooMuch && leftOnSelected > 0 && (
          <Text size="sm" c="orange.8" fw={600} mt={-8}>{money(leftOnSelected)} left</Text>
        )}
        {tooMuch && <Text size="sm" c="red.7" fw={600} mt={-8}>{problem}</Text>}
        <PaymentModeField mode={mode} onMode={setMode} reference={reference} onReference={setReference} />
        {invoices.length > 1 && (
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{invoices.map((item) => item.invoice_number).join(' · ')}</Text>
        )}
        {error && <Alert color="red" variant="light">{error}</Alert>}

        {/* Save stays in view however long the list is. */}
        <Group
          justify="flex-end"
          gap="xs"
          py="sm"
          style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--mantine-color-body)', borderTop: '1px solid var(--mantine-color-gray-2)' }}
        >
          <Button variant="default" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={Boolean(problem)}>{entered && !tooMuch ? `Save ${money(value)}` : 'Save'}</Button>
        </Group>
      </Stack>
    </form>
  );
}

const round = (number) => Math.round(number * 100) / 100;

/** Oldest first over the chosen invoices, as the server does. */
function allocate(invoices, amount) {
  const shares = new Map();
  let remaining = round(amount);
  let selectedPending = 0;
  let cleared = 0;
  for (const item of invoices) {
    selectedPending += item.pending_amount;
    if (remaining <= 0.004) continue;
    const take = round(Math.min(remaining, item.pending_amount));
    shares.set(item.id, take);
    remaining = round(remaining - take);
    if (take >= item.pending_amount - 0.009) cleared += 1;
  }
  return { shares, selectedPending: round(selectedPending), cleared };
}
