import { useCallback, useState } from 'react';
import { Alert, Button, Drawer, Group, Modal, NumberInput, Paper, Stack, Text } from '@mantine/core';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../hooks/useAppStore';
import { useBackClose } from '../../hooks/useBackClose';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SWIPE_SHEET_CLASS, useSwipeDownToClose } from '../../hooks/useSwipeDownToClose';
import { errorText, money } from '../../utils/formatters';
import CollectionCelebration from './CollectionCelebration';
import PaymentModeField from './PaymentModeField';
import { pickHeadline } from './celebrationText';
import { lastPaymentMode, referenceFor, rememberPaymentMode } from './paymentModes';
import { showUndoBar } from './undoBar';

const round = (number) => Math.round(number * 100) / 100;

/**
 * Collect from several customers at once (invoices ticked on the Invoices tab).
 * groups: [{ customerId, customer, invoices: [{ invoice_id, invoice_number, pending_amount }] }]
 * One row per customer: amount (pre-filled, editable; blank skips them) and
 * their own payment mode. Saved together: all or nothing.
 */
export default function MultiCollectModal({ groups, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const opened = Boolean(groups?.length);
  useBackClose(opened, onClose);
  useSwipeDownToClose(opened && isMobile, onClose);
  const [celebration, setCelebration] = useState(null);
  const endCelebration = useCallback(() => {
    if (celebration?.undo) showUndoBar(celebration.undo);
    setCelebration(null);
  }, [celebration]);
  const title = <Text fw={700}>Collect · {groups?.length || 0} customers</Text>;
  const key = (groups || []).map((group) => `${group.customerId}:${group.invoices.map((item) => item.invoice_id).join('.')}`).join(',');
  const body = opened && <MultiForm key={key} groups={groups} onClose={onClose} onSaved={onSaved} onCelebrate={setCelebration} />;
  return (
    <>
      {isMobile ? (
        <Drawer opened={opened} onClose={onClose} position="bottom" radius="lg" size="auto" zIndex={250} title={title}
          classNames={{ content: SWIPE_SHEET_CLASS }} styles={{ content: { maxHeight: '92dvh' }, body: { paddingBottom: 0 } }}>
          {body}
        </Drawer>
      ) : (
        <Modal opened={opened} onClose={onClose} title={title} centered size={520} zIndex={250} styles={{ body: { paddingBottom: 0 } }}>{body}</Modal>
      )}
      <CollectionCelebration celebration={celebration} onDone={endCelebration} />
    </>
  );
}

function MultiForm({ groups, onClose, onSaved, onCelebrate }) {
  const { role } = useAuth();
  const [rows, setRows] = useState(() => groups.map((group) => {
    const pending = round(group.invoices.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0));
    return { ...group, pending, amount: pending, mode: lastPaymentMode(), reference: '' };
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (index, patch) => { setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row))); setError(''); };

  const valueOf = (row) => { const value = Number(row.amount); return row.amount !== '' && Number.isFinite(value) && value > 0 ? value : 0; };
  const paying = rows.filter((row) => valueOf(row) > 0);
  const total = round(paying.reduce((sum, row) => sum + valueOf(row), 0));
  const over = rows.find((row) => valueOf(row) > row.pending + 0.01);
  const problem = over ? `${over.customer}: max ${money(over.pending)}` : !paying.length ? 'Enter an amount.' : '';

  const submit = async (event) => {
    event.preventDefault();
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const saved = await paymentsApi.createBatches(paying.map((row) => ({
        customer_id: row.customerId,
        amount: valueOf(row),
        invoice_ids: row.invoices.map((item) => item.invoice_id),
        mode: row.mode,
        transaction_reference: referenceFor(row.mode, row.reference),
      })));
      rememberPaymentMode(paying[paying.length - 1].mode);
      const left = round(paying.reduce((sum, row) => sum + row.pending - valueOf(row), 0));
      const cleared = left <= 0.01;
      // Undo removes every customer's part (one payment id per customer's split).
      const undo = {
        paymentIds: saved.results.map((result) => result.items[0]?.payment_id).filter(Boolean),
        message: `${money(total)} · ${paying.length === 1 ? paying[0].customer : `${paying.length} customers`}`,
      };
      if (role !== 'MR') showUndoBar(undo);
      if (role === 'MR') {
        onCelebrate({
          amount: total,
          left,
          cleared,
          customer: paying.length === 1 ? paying[0].customer : `${paying.length} customers`,
          headline: pickHeadline(cleared),
          detail: null,
          undo,
        });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not record the collection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        {rows.map((row, index) => {
          const value = valueOf(row);
          const left = round(row.pending - value);
          return (
            <Paper key={row.customerId} withBorder radius="md" p="sm">
              <Stack gap={8}>
                <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} style={{ overflowWrap: 'anywhere' }}>{row.customer}</Text>
                    <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{row.invoices.map((item) => item.invoice_number).join(' · ')}</Text>
                  </div>
                  <NumberInput
                    aria-label={`Amount from ${row.customer}`}
                    w={120}
                    min={0}
                    decimalScale={2}
                    thousandSeparator=","
                    hideControls
                    inputMode="decimal"
                    leftSection="₹"
                    value={row.amount}
                    onChange={(next) => update(index, { amount: next })}
                    onFocus={(event) => event.currentTarget.select()}
                    error={value > row.pending + 0.01}
                    styles={{ input: { fontWeight: 700 } }}
                  />
                </Group>
                {value > 0 && left > 0.01 && <Text size="xs" c="orange.8" fw={600} ta="right" mt={-4}>{money(left)} left</Text>}
                {value > 0 && <PaymentModeField mode={row.mode} onMode={(mode) => update(index, { mode })} reference={row.reference} onReference={(reference) => update(index, { reference })} />}
              </Stack>
            </Paper>
          );
        })}
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group
          justify="flex-end"
          gap="xs"
          py="sm"
          style={{ position: 'sticky', bottom: 0, zIndex: 2, background: 'var(--mantine-color-body)', borderTop: '1px solid var(--mantine-color-gray-2)' }}
        >
          <Button variant="default" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={Boolean(problem)}>{total > 0 && !over ? `Save ${money(total)}` : 'Save'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
