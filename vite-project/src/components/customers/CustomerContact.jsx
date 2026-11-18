import { Fragment, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { useBackClose } from '../../hooks/useBackClose';
import { displayPhone, errorText } from '../../utils/formatters';
import ContactActions from './ContactActions';
import PhoneFields from './PhoneFields';
import { phonePayload } from '../../utils/phone';

/**
 * Contact line at the top of a customer's screen (MR):
 *   98765 43210 / 080-12345678   (call) (whatsapp)  Edit
 * With no number yet it shows "+ Add phone". onEdit opens CustomerContactModal.
 * editable={false}: no "Edit" next to the numbers (Admin ledger edits them in "Edit details").
 */
export function CustomerContactRow({ name, phone, alternatePhone, whatsappOn, onEdit, editable = true }) {
  if (!phone && !alternatePhone) {
    return (
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={onEdit} style={{ alignSelf: 'flex-start' }}>
        Add phone
      </Button>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap" align="center" justify="space-between">
      <div style={{ minWidth: 0 }}>
        {/* "98765 43210 / 080-12345678"; wraps after the "/" on narrow screens. */}
        <Text size="sm" fw={600}>
          {[displayPhone(phone), displayPhone(alternatePhone)].filter(Boolean).map((number, index) => (
            <Fragment key={number}>{index > 0 && ' '}<span style={{ whiteSpace: 'nowrap' }}>{number}{index === 0 && phone && alternatePhone && ' /'}</span></Fragment>
          ))}
        </Text>
      </div>
      <Group gap={6} wrap="nowrap">
        <ContactActions name={name} phone={phone} alternatePhone={alternatePhone} whatsappOn={whatsappOn} />
        {editable && <Button variant="subtle" size="compact-sm" leftSection={<IconPencil size={14} />} onClick={onEdit}>Edit</Button>}
      </Group>
    </Group>
  );
}

/**
 * Add / change / clear a customer's phone numbers (MR, or Admin with admin).
 * customer: { id, name, phone, alternate_phone } or null when closed.
 * onSaved({ phone, alternate_phone }) runs after a successful save.
 */
export function CustomerContactModal({ customer, onClose, onSaved, admin = false }) {
  const opened = !!customer;
  useBackClose(opened, onClose);
  return (
    // zIndex 250: above the ledger drawer (200), like the collection form.
    <Modal opened={opened} onClose={onClose} title={customer?.phone ? `Phone numbers · ${customer.name}` : `Add phone · ${customer?.name || ''}`} centered zIndex={250}>
      {customer && <ContactForm key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} admin={admin} />}
    </Modal>
  );
}

function ContactForm({ customer, onClose, onSaved, admin }) {
  // New numbers start with the main number marked as on WhatsApp (mobiles
  // usually are); the user can switch it off or move it to the alternate.
  const [numbers, setNumbers] = useState({
    // Shown as '98765 43210'; the server accepts spaces and stores digits.
    phone: displayPhone(customer.phone),
    alternate_phone: displayPhone(customer.alternate_phone),
    whatsapp_on: customer.whatsapp_on ?? (customer.phone ? '' : 'main'),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hadPhone = Boolean(customer.phone);

  const submit = async (event) => {
    event.preventDefault();
    const body = phonePayload(numbers);
    if (hadPhone && !body.phone) { setError('The main phone number can be changed but not removed.'); return; }
    if (body.alternate_phone && !body.phone) { setError('Add the main phone number first.'); return; }
    setBusy(true); setError('');
    try {
      // Admins save through the customer update (any customer); MRs through
      // their own contact endpoint (their customers only).
      const saved = admin
        ? await customersApi.updateCustomer(customer.id, { ...body, phone: body.phone || null })
        : await customersApi.updateMyCustomerContact(customer.id, body);
      notifications.show({ color: 'green', title: 'Phone numbers saved', message: customer.name });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the phone numbers.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <PhoneFields value={numbers} onChange={(next) => { setNumbers(next); setError(''); }} requiredMain={hadPhone} autoFocus />
        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </Group>
      </Stack>
    </form>
  );
}
