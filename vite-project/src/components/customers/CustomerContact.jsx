import { Fragment, useState } from 'react';
import { Alert, Anchor, Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconPencil, IconPlus } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { useBackClose } from '../../hooks/useBackClose';
import { displayPhone, errorText } from '../../utils/formatters';
import ContactActions from './ContactActions';

/**
 * Contact line at the top of a customer's screen (MR):
 *   98765 43210 / 080-12345678   (call) (whatsapp)  Edit
 * With no number yet it shows "+ Add phone". onEdit opens CustomerContactModal.
 */
export function CustomerContactRow({ name, phone, alternatePhone, whatsappOn, onEdit }) {
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
        <Button variant="subtle" size="compact-sm" leftSection={<IconPencil size={14} />} onClick={onEdit}>Edit</Button>
      </Group>
    </Group>
  );
}

const HELP = '10-digit mobile, or landline with area code';

/**
 * Add / change / clear a customer's phone numbers (MR only).
 * customer: { id, name, phone, alternate_phone } or null when closed.
 * onSaved({ phone, alternate_phone }) runs after a successful save.
 */
export function CustomerContactModal({ customer, onClose, onSaved }) {
  const opened = !!customer;
  useBackClose(opened, onClose);
  return (
    // zIndex 250: above the ledger drawer (200), like the collection form.
    <Modal opened={opened} onClose={onClose} title={customer?.phone ? `Phone numbers · ${customer.name}` : `Add phone · ${customer?.name || ''}`} centered zIndex={250}>
      {customer && <ContactForm key={customer.id} customer={customer} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ContactForm({ customer, onClose, onSaved }) {
  const [phone, setPhone] = useState(customer.phone || '');
  const [alternate, setAlternate] = useState(customer.alternate_phone || '');
  // Which number is on WhatsApp. New customers start with the main number
  // ticked (mobiles usually are); the MR can move or remove the tick.
  const [whatsappOn, setWhatsappOn] = useState(customer.whatsapp_on ?? (customer.phone ? '' : 'main'));
  const toggleWhatsapp = (which) => (event) => setWhatsappOn(event.currentTarget.checked ? which : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hadPhone = Boolean(customer.phone);

  const submit = async (event) => {
    event.preventDefault();
    if (hadPhone && !phone.trim()) { setError('The main phone number can be changed but not removed.'); return; }
    if (alternate.trim() && !phone.trim()) { setError('Add the main phone number first.'); return; }
    setBusy(true); setError('');
    try {
      // A tick on a number that was left blank is dropped rather than refused.
      const filled = { main: phone.trim(), alternate: alternate.trim() };
      const whatsapp = whatsappOn && filled[whatsappOn] ? whatsappOn : '';
      const saved = await customersApi.updateMyCustomerContact(customer.id, { phone: filled.main, alternate_phone: filled.alternate, whatsapp_on: whatsapp });
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
      <Stack>
        <TextInput
          label="Phone"
          placeholder="98765 43210 or 080-12345678"
          description={HELP}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          required={hadPhone}
          value={phone}
          onChange={(event) => setPhone(event.currentTarget.value)}
          data-autofocus
        />
        <WhatsappTick checked={whatsappOn === 'main'} onChange={toggleWhatsapp('main')} />
        <TextInput
          label="Alternate phone"
          placeholder="Optional"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={alternate}
          onChange={(event) => setAlternate(event.currentTarget.value)}
          rightSection={alternate ? <Anchor component="button" type="button" size="xs" onClick={() => setAlternate('')} aria-label="Clear alternate phone">Clear</Anchor> : null}
          rightSectionWidth={alternate ? 52 : undefined}
        />
        <WhatsappTick checked={whatsappOn === 'alternate'} onChange={toggleWhatsapp('alternate')} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </Group>
      </Stack>
    </form>
  );
}

/** WhatsApp tick (tick + logo) under a number. Ticking one unticks the other. */
function WhatsappTick({ checked, onChange }) {
  return (
    <Checkbox
      mt={-6}
      size="sm"
      color="#25D366"
      checked={checked}
      onChange={onChange}
      aria-label="On WhatsApp"
      label={<IconBrandWhatsapp size={20} color="#25D366" aria-hidden style={{ display: 'block' }} />}
    />
  );
}
