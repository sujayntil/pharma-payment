import { useState } from 'react';
import { Alert, Anchor, Button, Collapse, Divider, Group, Modal, Select, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { useBackClose } from '../../hooks/useBackClose';
import { displayPhone, errorText } from '../../utils/formatters';
import { phonePayload } from '../../utils/phone';
import { typeOptions } from '../../utils/customerTypes';
import PhoneFields from './PhoneFields';

/**
 * Admin "Add customer" / "Edit customer", one short card:
 *   Name
 *   Type | Assigned MR
 *   ── Phone numbers ──  (shared PhoneFields)
 *   More details ▾       (Address, GSTIN; open when already filled)
 *                                  Cancel  Save
 *
 * customer: the customer to edit, {} for a new one, or null when closed.
 * mrOptions: [{ value, label }] for the Assigned MR select.
 * onSaved(saved) runs after a successful save.
 */
export default function CustomerFormModal({ customer, mrOptions, onClose, onSaved }) {
  const opened = Boolean(customer);
  useBackClose(opened, onClose);
  const isNew = opened && !customer.id;
  return (
    <Modal opened={opened} onClose={onClose} title={isNew ? 'Add customer' : 'Edit customer'} centered size={480} zIndex={250}>
      {customer && <CustomerForm key={customer.id || 'new'} customer={customer} mrOptions={mrOptions} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function CustomerForm({ customer, mrOptions, onClose, onSaved }) {
  const isNew = !customer.id;
  const [form, setForm] = useState({
    name: customer.name || '',
    type: customer.type || '',
    mr_id: customer.mr_id ? String(customer.mr_id) : '',
    address: customer.address || '',
    gstin: customer.gstin || '',
  });
  const [numbers, setNumbers] = useState({
    // Shown as '98765 43210'; the server accepts spaces and stores digits.
    phone: displayPhone(customer.phone),
    alternate_phone: displayPhone(customer.alternate_phone),
    whatsapp_on: customer.whatsapp_on ?? (isNew ? 'main' : ''),
  });
  const [moreOpen, setMoreOpen] = useState(Boolean(customer.address || customer.gstin));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => { setForm((current) => ({ ...current, ...patch })); setError(''); };

  const submit = async (event) => {
    event.preventDefault();
    const phones = phonePayload(numbers);
    if (phones.alternate_phone && !phones.phone) { setError('Add the main phone number first.'); return; }
    setBusy(true); setError('');
    try {
      const body = {
        name: form.name.trim(),
        type: form.type || null,
        mr_id: form.mr_id ? Number(form.mr_id) : null,
        address: form.address.trim() || null,
        gstin: form.gstin.trim() || null,
        ...phones,
        phone: phones.phone || null,
      };
      const saved = isNew ? await customersApi.createCustomer(body) : await customersApi.updateCustomer(customer.id, body);
      onSaved?.(saved, isNew);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the customer.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <TextInput label="Name" required placeholder="Sri Balaji Medicals" value={form.name} onChange={(event) => set({ name: event.currentTarget.value })} data-autofocus={isNew || undefined} />
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <Select label="Type" placeholder="Choose type" clearable data={typeOptions(form.type)} value={form.type || null} onChange={(value) => set({ type: value || '' })} comboboxProps={{ zIndex: 300 }} />
          <Select label="Assigned MR" placeholder="Not assigned" clearable searchable data={mrOptions} value={form.mr_id || null} onChange={(value) => set({ mr_id: value || '' })} comboboxProps={{ zIndex: 300 }} />
        </SimpleGrid>

        <Divider label="Phone numbers" labelPosition="left" mt={6} />
        <PhoneFields value={numbers} onChange={(next) => { setNumbers(next); setError(''); }} />

        <Divider mt={6} />
        <Anchor component="button" type="button" size="sm" c="dimmed" onClick={() => setMoreOpen((open) => !open)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }} aria-expanded={moreOpen}>
          More details
          <IconChevronDown size={14} style={{ transform: moreOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
        </Anchor>
        <Collapse expanded={moreOpen}>
          <Stack gap="sm">
            <TextInput label="Address" placeholder="Shop no., street, area" value={form.address} onChange={(event) => set({ address: event.currentTarget.value })} />
            <TextInput label="GSTIN" placeholder="29ABCDE1234F1Z5" value={form.gstin} onChange={(event) => set({ gstin: event.currentTarget.value.toUpperCase() })} />
          </Stack>
        </Collapse>

        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!form.name.trim()}>{isNew ? 'Add customer' : 'Save'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
