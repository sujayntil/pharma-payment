import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Drawer, Group, Loader, Modal, NumberInput, Stack, Text, UnstyledButton } from '@mantine/core';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../hooks/useAppStore';
import { useBackClose } from '../../hooks/useBackClose';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { autoFocusOnLaptop } from '../../utils/focus';
import { errorText, money, shortDate } from '../../utils/formatters';
import CollectionCelebration from './CollectionCelebration';
import InvoiceAge from './InvoiceAge';
import PaymentModeField from './PaymentModeField';
import { pickHeadline } from './celebrationText';
import { lastPaymentMode, referenceFor, rememberPaymentMode } from './paymentModes';
import { showUndoBar } from './undoBar';

/**
 * "Bulk collect": one amount the customer hands over, split
 * across their pending invoices oldest first.
 *
 *   Amount received [₹ 8,400]       (starts with the full pending total)
 *   (Cash) (UPI) (Cheque) (More ▾)
 *   Goes to (oldest first)               2 of 3 selected
 *   ☑ INV-1032 · 47 days   ₹5,400   ₹5,400 → cleared
 *   ☐ INV-1060 · 19 days   ₹4,800   Skipped
 *   ☑ INV-1081 · 1 day     ₹3,000   ₹3,000 → cleared
 *   ₹8,400 collected · 2 invoices cleared · ₹4,800 still pending
 *                                         [Save ₹8,400]
 *
 * All invoices start ticked; untick one the customer isn't paying (disputed,
 * not delivered, or they named which bills). Phone: bottom sheet; laptop:
 * centred window. For MRs and Admins alike.
 *
 * customer: { id, name } to open for, or null when closed.
 * onSaved(): reload the screen behind.
 */
export default function CustomerCollectModal({ customer, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const opened = Boolean(customer);
  useBackClose(opened, onClose);
  useSwipeDownToClose(opened && isMobile, onClose);
  const [celebration, setCelebration] = useState(null);
  const endCelebration = useCallback(() => {
    if (celebration?.undo) showUndoBar(celebration.undo);
    setCelebration(null);
  }, [celebration]);

  const body = customer && <CollectForm key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} onCelebrate={setCelebration} />;
  const title = <Text fw={700} style={{ overflowWrap: 'anywhere' }}>Bulk collect · {customer?.name}</Text>;
  return (
    <>
      {isMobile ? (
        <Drawer opened={opened} onClose={onClose} position="bottom" radius="lg" size="auto" zIndex={250} title={title}
          classNames={{ content: SWIPE_SHEET_CLASS }} styles={{ content: { maxHeight: '92dvh' } }}>
          {body}
        </Drawer>
      ) : (
        <Modal opened={opened} onClose={onClose} title={title} centered size={520} zIndex={250}>{body}</Modal>
      )}
      <CollectionCelebration celebration={celebration} onDone={endCelebration} />
    </>
  );
}

function CollectForm({ customer, onClose, onSaved, onCelebrate }) {
  const { role } = useAuth();
  const [invoices, setInvoices] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [skipped, setSkipped] = useState(() => new Set());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(lastPaymentMode);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    paymentsApi.pendingInvoices(customer.id)
      .then((data) => {
        if (!active) return;
        setInvoices(data.items);
        setAmount(round(data.items.reduce((sum, item) => sum + item.pending_amount, 0)));
      })
      .catch((err) => { if (active) setLoadError(errorText(err, "Couldn't load this customer's invoices.")); });
    return () => { active = false; };
  }, [customer.id]);

  const value = Number(amount);
  const entered = amount !== '' && Number.isFinite(value) && value > 0;
  const plan = useMemo(() => allocate(invoices || [], skipped, entered ? value : 0), [invoices, skipped, entered, value]);
  const selectedCount = (invoices || []).length - skipped.size;
  const tooMuch = entered && value > plan.selectedPending + 0.01;
  const totalPending = round((invoices || []).reduce((sum, item) => sum + item.pending_amount, 0));
  const stillPending = Math.max(round(totalPending - (entered && !tooMuch ? value : 0)), 0);

  const toggle = (id) => {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setError('');
  };

  const problem = !selectedCount ? 'Tick at least one invoice.'
    : !entered ? 'Enter the amount received.'
      : tooMuch ? `More than the selected invoices (${money(plan.selectedPending)}). Tick another invoice or lower the amount.`
        : '';

  const submit = async (event) => {
    event.preventDefault();
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const result = await paymentsApi.createBatch({
        customer_id: customer.id,
        amount: value,
        invoice_ids: invoices.filter((item) => !skipped.has(item.id)).map((item) => item.id),
        mode,
        transaction_reference: referenceFor(mode, reference),
      });
      rememberPaymentMode(mode);
      const count = result.items.length;
      const cleared = result.cleared;
      const undo = {
        paymentId: result.items[0].payment_id,
        message: `${money(value)} collected · ${count === 1 ? result.items[0].invoice_number : `${count} invoices`}`,
      };
      if (role === 'MR') {
        const everything = stillPending <= 0.01;
        onCelebrate({
          amount: value,
          left: stillPending,
          cleared: everything,
          customer: customer.name,
          headline: pickHeadline(everything),
          detail: cleared ? `${cleared} invoice${cleared === 1 ? '' : 's'} cleared` : null,
          undo,
        });
      } else {
        showUndoBar(undo);
      }
      onSaved?.(result);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not record the collection.'));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Alert color="red" variant="light">{loadError}</Alert>;
  if (!invoices) return <Group justify="center" p="lg"><Loader size="sm" /></Group>;
  if (!invoices.length) return <Text c="dimmed" ta="center" py="lg">Nothing pending for this customer.</Text>;

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <NumberInput
          label="Amount received (₹)"
          min={0.01}
          decimalScale={2}
          thousandSeparator=","
          hideControls
          inputMode="decimal"
          value={amount}
          onChange={(next) => { setAmount(next); setError(''); }}
          onFocus={(event) => event.currentTarget.select()}
          data-autofocus={autoFocusOnLaptop()}
          styles={{ input: { fontSize: 18, fontWeight: 700 } }}
        />
        <PaymentModeField mode={mode} onMode={setMode} reference={reference} onReference={setReference} />

        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={600}>Goes to (oldest first)</Text>
            <Text size="xs" c="dimmed">{selectedCount} of {invoices.length} selected</Text>
          </Group>
          <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 10, overflow: 'hidden' }}>
            {invoices.map((item, index) => {
              const share = plan.shares.get(item.id);
              const off = skipped.has(item.id);
              return (
                <UnstyledButton
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={!off}
                  aria-label={`${item.invoice_number}, ${off ? 'skipped' : 'selected'}`}
                  px="sm"
                  py={9}
                  style={{ display: 'block', width: '100%', borderTop: index ? '1px solid var(--mantine-color-gray-2)' : undefined, opacity: off ? 0.6 : 1 }}
                >
                  <Group gap={10} wrap="nowrap" align="flex-start">
                    <Checkbox checked={!off} readOnly tabIndex={-1} color="green" mt={2} aria-hidden style={{ pointerEvents: 'none' }} />
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        {/* Invoice number, then its date and age: "INV-1081 · 30 Sept 2026 · 47 days". */}
                        <Text size="sm" fw={600} style={{ minWidth: 0 }}>
                          {item.invoice_number}
                          <Text span size="xs" c="dimmed" fw={400} style={{ whiteSpace: 'nowrap' }}> · {shortDate(item.invoice_date)}<InvoiceAge date={item.invoice_date} pending={item.pending_amount} /></Text>
                        </Text>
                        <Text size="sm" style={{ whiteSpace: 'nowrap' }}>{money(item.pending_amount)}</Text>
                      </Group>
                      <ShareLine off={off} share={share} pending={item.pending_amount} />
                    </Box>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Box>
        </div>

        {entered && !tooMuch && selectedCount > 0 && (
          <Text size="sm" c="dimmed" aria-live="polite">
            {money(value)} collected · {plan.cleared} invoice{plan.cleared === 1 ? '' : 's'} cleared
            {stillPending > 0 ? ` · ${money(stillPending)} still pending` : ' · nothing left pending'}
          </Text>
        )}
        {(error || (problem && (tooMuch || !selectedCount))) && <Alert color="red" variant="light">{error || problem}</Alert>}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={Boolean(problem)}>{entered && !tooMuch ? `Save ${money(value)}` : 'Save'}</Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Line under each invoice: what this collection does to it. */
function ShareLine({ off, share, pending }) {
  if (off) return <Text size="xs" c="dimmed">Skipped</Text>;
  if (!share) return <Text size="xs" c="dimmed">Nothing (amount used up)</Text>;
  const left = round(pending - share);
  return left <= 0.009
    ? <Text size="xs" fw={600} c="green.8">{money(share)} → cleared</Text>
    : <Text size="xs" fw={600} c="orange.8">{money(share)} → {money(left)} left</Text>;
}

const round = (number) => Math.round(number * 100) / 100;

/** Oldest first over the ticked invoices, the same rule the server uses. */
function allocate(invoices, skipped, amount) {
  const shares = new Map();
  let remaining = round(amount);
  let selectedPending = 0;
  let cleared = 0;
  for (const item of invoices) {
    if (skipped.has(item.id)) continue;
    selectedPending += item.pending_amount;
    if (remaining <= 0.004) continue;
    const take = round(Math.min(remaining, item.pending_amount));
    shares.set(item.id, take);
    remaining = round(remaining - take);
    if (take >= item.pending_amount - 0.009) cleared += 1;
  }
  return { shares, selectedPending: round(selectedPending), cleared };
}
