import { useEffect, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { paymentsApi } from '../../api/paymentsApi';
import { mrApi } from '../../api/mrApi';
import { useAuth } from '../../hooks/useAppStore';
import { errorText, money, shortDate } from '../../utils/formatters';
import { PAYMENT_MODES, toCollectionTarget } from './collectionUtils';

/**
 * The one "Record collection" form used by both MRs and Admins. When an
 * Admin records for a customer with an assigned MR, the collection is saved
 * under that MR and the Admin is stored as who recorded it.
 *
 * invoice:  record against this invoice (My Collections, lists, ledgers)
 * customer: { id, name } -- open from a customer's ledger with the customer
 *           pre-selected; the MR then picks one of its pending invoices.
 */
export default function RecordCollectionModal({ invoice, customer, onClose, onSaved }) {
  const target = toCollectionTarget(invoice);
  const opened = !!target || !!customer;
  const title = target ? `Record collection · ${target.invoiceNumber || ''}` : `Record collection · ${customer?.name || ''}`;
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      {/* Remounting per invoice resets the form without effects. */}
      {target
        ? <CollectionForm key={target.invoiceId} target={target} onClose={onClose} onSaved={onSaved} />
        : customer && <CustomerInvoicePicker key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

/** Customer is fixed; choose which pending / partly paid invoice to collect against. */
function CustomerInvoicePicker({ customer, onClose, onSaved }) {
  const [invoices, setInvoices] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    // Same MR-scoped endpoint as My Collections; only invoices with a balance.
    mrApi.getOutstanding({ customer_id: customer.id, sort_order: 'oldest', limit: 100, offset: 0 })
      .then((result) => {
        if (!active) return;
        const items = result.items || [];
        setInvoices(items);
        if (items.length === 1) setSelectedId(String(items[0].invoice_id));
      })
      .catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, [customer.id]);

  if (error) return <Alert color="red">{error}</Alert>;
  if (!invoices) return <Group justify="center" p="lg"><Loader size="sm" /></Group>;
  if (!invoices.length) {
    return (
      <Stack>
        <Text size="sm">{customer.name} has no pending or partly paid invoices.</Text>
        <Group justify="end"><Button variant="default" onClick={onClose}>Close</Button></Group>
      </Stack>
    );
  }
  const selected = invoices.find((item) => String(item.invoice_id) === selectedId);
  return (
    <Stack>
      <Select
        label="Invoice"
        placeholder="Choose a pending invoice"
        required
        searchable
        data={invoices.map((item) => ({ value: String(item.invoice_id), label: `${item.invoice_number} · ${shortDate(item.invoice_date)} · ${money(item.pending_amount)} pending` }))}
        value={selectedId}
        onChange={setSelectedId}
        allowDeselect={false}
        comboboxProps={{ middlewares: { flip: true, shift: { padding: 8 } } }}
      />
      {selected && <CollectionForm key={selected.invoice_id} target={toCollectionTarget({ ...selected, customer_name: customer.name })} onClose={onClose} onSaved={onSaved} />}
    </Stack>
  );
}

function CollectionForm({ target, onClose, onSaved }) {
  const { role, name } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [kind, setKind] = useState('full');
  const [amount, setAmount] = useState(target.pending);
  const [mode, setMode] = useState('UPI');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chooseKind = (value) => {
    setKind(value);
    setAmount(value === 'full' ? target.pending : '');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (target.pending <= 0) {
      setError('This invoice is already fully paid.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > target.pending + 0.01) {
      setError(`Enter an amount between ₹0.01 and ${money(target.pending)}.`);
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await paymentsApi.createPayment({
        invoice_id: target.invoiceId,
        amount: value,
        mode: mode || null,
        transaction_reference: reference.trim() || null,
      });
      notifications.show({ color: 'green', title: 'Collection recorded', message: `${money(value)} received for ${target.invoiceNumber}.` });
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
        <SegmentedControl fullWidth value={kind} onChange={chooseKind} data={[{ value: 'full', label: 'Full balance' }, { value: 'part', label: 'Part payment' }]} />
        <NumberInput label="Amount received (₹)" min={0.01} max={target.pending} decimalScale={2} thousandSeparator="," required readOnly={kind === 'full'} value={amount} onChange={setAmount} data-autofocus={kind === 'part' || undefined} />
        <Select label="Payment mode" required data={PAYMENT_MODES} value={mode} onChange={(value) => setMode(value || 'UPI')} allowDeselect={false} />
        <TextInput label="Reference / UTR / cheque number" placeholder="Optional" value={reference} onChange={(e) => setReference(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="end">
          <Button variant="default" type="button" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save collection</Button>
        </Group>
      </Stack>
    </form>
  );
}
