import { useEffect, useState } from 'react';
import { Alert, Anchor, Badge, Button, CloseButton, Combobox, Divider, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { IconBrandWhatsapp, IconPhone, IconPlus, IconSearch } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { customersApi } from '../../api/customersApi';
import PhoneFields from '../../components/customers/PhoneFields';
import { useBackClose } from '../../hooks/useBackClose';
import { displayPhone, errorText } from '../../utils/formatters';
import { phonePayload } from '../../utils/phone';
import { CUSTOMER_TYPES } from '../../utils/customerTypes';
import { autoFocusOnLaptop } from '../../utils/focus';

const NEW = '__new__';
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Admin "Add invoice":
 *   Invoice number | Date
 *   Customer  [search…]  → matches, or "+ New customer 'X'"
 *     existing: grey line with MR and number (or "+ Add phone")
 *     new:      Type | Assigned MR, then the shared phone section
 *   Bill amount
 *                                   Cancel  Add invoice
 * onSaved(message) runs after the invoice is added.
 */
export default function ManualInvoiceModal({ opened, onClose, onSaved, mrOptions }) {
  useBackClose(opened, onClose);
  return (
    <Modal opened={opened} onClose={onClose} title="Add invoice" centered size={520}>
      {opened && <ManualInvoiceForm onClose={onClose} onSaved={onSaved} mrOptions={mrOptions} />}
    </Modal>
  );
}

function ManualInvoiceForm({ onClose, onSaved, mrOptions }) {
  const [invoice, setInvoice] = useState({ number: '', date: today(), amount: '' });
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  // picked: an existing customer, { isNew: true, name } or null.
  const [picked, setPicked] = useState(null);
  const [details, setDetails] = useState({ type: '', mr_id: '' });
  const [numbers, setNumbers] = useState({ phone: '', alternate_phone: '', whatsapp_on: 'main' });
  const [addPhone, setAddPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await customersApi.getCustomers({ limit: 8, ...(query.trim() && { search: query.trim() }) });
        if (active) setMatches(data.items);
      } catch { if (active) setMatches([]); }
      finally { if (active) setSearching(false); }
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const typed = query.trim();
  const exactMatch = matches.some((customer) => customer.name.trim().toLowerCase() === typed.toLowerCase());
  const pick = (value) => {
    if (value === NEW) {
      setPicked({ isNew: true, name: typed });
    } else {
      const customer = matches.find((item) => String(item.id) === value);
      setPicked(customer); setQuery(customer.name);
    }
    setAddPhone(false); setError('');
    combobox.closeDropdown();
  };
  const clearPick = () => { setPicked(null); setQuery(''); setAddPhone(false); combobox.openDropdown(); };

  const needsNumbers = picked?.isNew || addPhone;
  const submit = async (event) => {
    event.preventDefault();
    if (!picked) { setError('Choose a customer, or add a new one.'); return; }
    const phones = phonePayload(numbers);
    if (needsNumbers && phones.alternate_phone && !phones.phone) { setError('Add the main phone number first.'); return; }
    setBusy(true); setError('');
    try {
      const customer = picked.isNew
        ? { customer_name: picked.name, customer_type: details.type || null, mr_id: details.mr_id ? Number(details.mr_id) : null, ...phones }
        : { customer_id: picked.id, ...(addPhone && phones) };
      const saved = await adminApi.createManualInvoice({
        invoice_number: invoice.number.trim(), invoice_date: invoice.date, total_amount: Number(invoice.amount), ...customer,
      });
      onSaved?.(`Invoice ${saved.invoice_number} added for ${saved.customer_name}.`);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not add the invoice.'));
    } finally {
      setBusy(false);
    }
  };

  const options = matches.map((customer) => (
    <Combobox.Option value={String(customer.id)} key={customer.id}>
      <Text size="sm">{customer.name}</Text>
      <Text size="xs" c="dimmed">{[customer.mr_name || 'Not assigned', customer.type, displayPhone(customer.phone)].filter(Boolean).join(' · ')}</Text>
    </Combobox.Option>
  ));

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <TextInput label="Invoice number" required placeholder="INV-1090" value={invoice.number} onChange={(event) => setInvoice({ ...invoice, number: event.currentTarget.value })} data-autofocus={autoFocusOnLaptop()} />
          <TextInput label="Invoice date" required type="date" value={invoice.date} onChange={(event) => setInvoice({ ...invoice, date: event.currentTarget.value })} />
        </SimpleGrid>

        <Combobox store={combobox} onOptionSubmit={pick} withinPortal zIndex={300}>
          <Combobox.Target>
            <TextInput
              label="Customer"
              required
              placeholder="Search customers, or type a new name"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(event) => { setQuery(event.currentTarget.value); setPicked(null); setAddPhone(false); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
              onClick={() => combobox.openDropdown()}
              onFocus={() => { if (!picked) combobox.openDropdown(); }}
              onBlur={() => combobox.closeDropdown()}
              rightSectionWidth={picked?.isNew ? 84 : undefined}
              rightSection={picked
                ? (picked.isNew
                  ? <Group gap={2} wrap="nowrap"><Badge size="sm" variant="light" style={{ flexShrink: 0, overflow: 'visible' }}>New</Badge><CloseButton size="sm" onMouseDown={(event) => event.preventDefault()} onClick={clearPick} aria-label="Change customer" /></Group>
                  : <CloseButton size="sm" onMouseDown={(event) => event.preventDefault()} onClick={clearPick} aria-label="Change customer" />)
                : searching ? <Loader size={14} /> : null}
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options mah={260} style={{ overflowY: 'auto' }}>
              {options}
              {typed && !exactMatch && (
                <Combobox.Option value={NEW}>
                  <Group gap={6} wrap="nowrap"><IconPlus size={14} color="var(--mantine-color-green-7)" /><Text size="sm" c="green.8">New customer “{typed}”</Text></Group>
                </Combobox.Option>
              )}
              {!options.length && !typed && <Combobox.Empty>Type a customer name</Combobox.Empty>}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        {picked && !picked.isNew && <ExistingCustomerLine customer={picked} addPhone={addPhone} onAddPhone={() => setAddPhone(true)} />}
        {picked?.isNew && (
          <>
            <Divider label="New customer" labelPosition="left" mt={4} />
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <Select label="Type" placeholder="Choose type" clearable data={CUSTOMER_TYPES} value={details.type || null} onChange={(value) => setDetails({ ...details, type: value || '' })} comboboxProps={{ zIndex: 300 }} />
              <Select label="Assigned MR" placeholder="Not assigned" clearable searchable data={mrOptions} value={details.mr_id || null} onChange={(value) => setDetails({ ...details, mr_id: value || '' })} comboboxProps={{ zIndex: 300 }} />
            </SimpleGrid>
          </>
        )}
        {needsNumbers && <PhoneFields value={numbers} onChange={(next) => { setNumbers(next); setError(''); }} />}

        <Divider mt={4} />
        <NumberInput label="Bill amount" required placeholder="0" leftSection="₹" min={0.01} decimalScale={2} thousandSeparator="," hideControls value={invoice.amount} onChange={(value) => setInvoice({ ...invoice, amount: value })} />

        {error && <Alert color="red" variant="light">{error}</Alert>}
        <Group justify="flex-end" gap="xs" mt={4}>
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!invoice.number.trim() || !invoice.date || !invoice.amount || !picked}>Add invoice</Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Grey line under a picked customer: "MR Rahul · 98765 43210 · on WhatsApp", or "+ Add phone". */
function ExistingCustomerLine({ customer, addPhone, onAddPhone }) {
  const numbers = [displayPhone(customer.phone), displayPhone(customer.alternate_phone)].filter(Boolean);
  return (
    <Group gap={8} wrap="wrap" mt={-4}>
      <Text size="xs" c="dimmed">MR {customer.mr_name || 'not assigned'}</Text>
      {numbers.length > 0 ? (
        <Group gap={4} wrap="nowrap">
          <IconPhone size={13} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">{numbers.join(' / ')}</Text>
          {customer.whatsapp_on && <IconBrandWhatsapp size={14} color="#25D366" aria-label="On WhatsApp" />}
        </Group>
      ) : !addPhone && (
        <Anchor component="button" type="button" size="xs" c="green.7" onClick={onAddPhone}>+ Add phone</Anchor>
      )}
    </Group>
  );
}
