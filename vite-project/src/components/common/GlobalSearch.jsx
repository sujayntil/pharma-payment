import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Combobox, Group, Kbd, Loader, Modal, ScrollArea, Text, TextInput, UnstyledButton, useCombobox } from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconFileInvoice, IconSearch, IconUsers } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import InvoiceHistory from '../collections/InvoiceHistory';
import RecordCollectionModal from '../collections/RecordCollectionModal';
import { StatusBadge } from '../collections/CollectionBadges';
import { useIsMobile } from '../../hooks/useIsMobile';
import { money, shortDate } from '../../utils/formatters';
import classes from './GlobalSearch.module.css';

/** Results for the text (2+ letters), fetched 250 ms after typing stops. */
function useResults(value) {
  const [query] = useDebouncedValue(value.trim(), 250);
  const [state, setState] = useState({ q: '', data: null });
  useEffect(() => {
    if (query.length < 2) return undefined;
    let live = true;
    customersApi.search(query)
      .then((data) => live && setState({ q: query, data }))
      .catch(() => live && setState({ q: query, data: { customers: [], invoices: [] } }));
    return () => { live = false; };
  }, [query]);
  const ready = query.length >= 2 && state.q === query;
  return { query, data: ready ? state.data : null, loading: query.length >= 2 && !ready };
}

function CustomerLine({ c }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>{c.name}</Text>
        <Text size="xs" c="dimmed" truncate>{[c.type, c.area, c.mr ? `MR ${c.mr}` : null].filter(Boolean).join(' · ')}</Text>
      </div>
      {c.pending > 0 ? <Text size="sm" fw={700} c="red.7" style={{ whiteSpace: 'nowrap' }}>{money(c.pending)}</Text> : <Text size="xs" c="dimmed">Nothing due</Text>}
    </Group>
  );
}

function InvoiceLine({ i, badge }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>{i.invoice_number} <Text span size="xs" c="dimmed" fw={400}>· {shortDate(i.invoice_date)}</Text></Text>
        <Text size="xs" c="dimmed" truncate>{i.customer || '—'}</Text>
      </div>
      <Group gap={8} wrap="nowrap">
        <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>{money(i.total)}</Text>
        {badge && <StatusBadge status={i.status} />}
      </Group>
    </Group>
  );
}

const groupLabel = (Icon, text, count, shown) => <Group gap={6}><Icon size={13} />{text}{count > shown ? ` · ${count}` : ''}</Group>;

/**
 * Search in the top bar, on every page: customers (name or phone) and
 * invoice numbers. A customer opens their page; an invoice opens on its
 * customer's page. Ctrl+K (⌘K) jumps here. On a phone it is a search icon
 * that opens a full-screen search.
 */
export default function GlobalSearch({ base }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const admin = base === '/admin';
  const [value, setValue] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);
  const [recording, setRecording] = useState(null);
  const [changed, setChanged] = useState(0);
  const { query, data, loading } = useResults(value);
  const input = useRef(null);
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  // Enter opens the top match straight away.
  useEffect(() => { if (data && !isMobile) combobox.selectFirstOption(); }, [data, isMobile, combobox]);
  useHotkeys([['mod+K', () => { if (isMobile) setPhoneOpen(true); else { input.current?.focus(); combobox.openDropdown(); } }]]);

  const go = (kind, id, extra) => {
    setValue(''); setPhoneOpen(false); combobox.closeDropdown(); input.current?.blur();
    // Admin: a customer opens their ledger in Customers, an invoice its details
    // right here. MR: the customer's page (an invoice opens on it).
    if (kind === 'c') { if (admin) navigate(`${base}/customers`, { state: { openCustomer: { id: Number(id), name: extra } } }); else navigate(`${base}/customers/${id}`); }
    else if (kind === 'i') { if (admin) setInvoiceId(Number(id)); else navigate(`${base}/customers/${extra}`, { state: { openInvoice: Number(id) } }); }
    else if (kind === 'all-i') navigate(`${base}/invoices`, { state: { search: query } });
    else if (kind === 'all-c') navigate(`${base}/customers`, { state: { search: query } });
  };
  const empty = data && !data.customers.length && !data.invoices.length;

  const details = admin && (
    <>
      <InvoiceHistory invoiceId={invoiceId} onClose={() => setInvoiceId(null)} onChanged={() => setChanged((v) => v + 1)} onRecord={setRecording} refreshKey={changed} />
      <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={() => setChanged((v) => v + 1)} />
    </>
  );

  if (isMobile) {
    return (
      <>
        <ActionIcon variant="default" radius="xl" size={34} onClick={() => setPhoneOpen(true)} aria-label="Search">
          <IconSearch size={17} />
        </ActionIcon>
        <Modal opened={phoneOpen} onClose={() => { setPhoneOpen(false); setValue(''); }} fullScreen withCloseButton={false} padding={0} transitionProps={{ transition: 'fade', duration: 120 }}>
          <div className={classes.phoneHead}>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => { setPhoneOpen(false); setValue(''); }} aria-label="Close search"><IconArrowLeft size={20} /></ActionIcon>
            <TextInput
              data-autofocus
              style={{ flex: 1 }}
              size="md"
              radius="md"
              placeholder={admin ? 'Customer, phone or invoice' : 'Your customer or invoice'}
              leftSection={<IconSearch size={17} />}
              rightSection={loading ? <Loader size={16} /> : null}
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              aria-label="Search customers and invoices"
            />
          </div>
          <ScrollArea h="calc(100dvh - 68px)" px="sm">
            {query.length < 2 && <Text size="sm" c="dimmed" ta="center" py="xl">Type 2 or more letters.</Text>}
            {empty && <Text size="sm" c="dimmed" ta="center" py="xl">Nothing matches “{query}”.</Text>}
            {data?.customers.length > 0 && <Text className={classes.phoneGroup}>{groupLabel(IconUsers, 'Customers', data.customer_count, data.customers.length)}</Text>}
            {data?.customers.map((c) => <UnstyledButton key={`c${c.id}`} className={classes.phoneRow} onClick={() => go('c', c.id, c.name)}><CustomerLine c={c} /></UnstyledButton>)}
            {admin && data?.customer_count > data?.customers.length && <UnstyledButton className={classes.seeAll} onClick={() => go('all-c')}>See all {data.customer_count} in Customers →</UnstyledButton>}
            {data?.invoices.length > 0 && <Text className={classes.phoneGroup}>{groupLabel(IconFileInvoice, 'Invoices', data.invoice_count, data.invoices.length)}</Text>}
            {data?.invoices.map((i) => <UnstyledButton key={`i${i.id}`} className={classes.phoneRow} onClick={() => go('i', i.id, i.customer_id)}><InvoiceLine i={i} /></UnstyledButton>)}
            {admin && data?.invoice_count > data?.invoices.length && <UnstyledButton className={classes.seeAll} onClick={() => go('all-i')}>See all {data.invoice_count} in Invoices →</UnstyledButton>}
          </ScrollArea>
        </Modal>
        {details}
      </>
    );
  }

  return (
    <>
    <Combobox store={combobox} onOptionSubmit={(key) => { const [k, id, ...rest] = key.split(':'); go(k, id, rest.join(':')); }} withinPortal position="bottom-start" offset={6} shadow="md" width={460} zIndex={300}>
      <Combobox.Target>
        <TextInput
          ref={input}
          radius="md"
          w={340}
          placeholder={admin ? 'Search customer, phone or invoice' : 'Search your customers or invoices'}
          leftSection={<IconSearch size={16} />}
          rightSection={loading ? <Loader size={14} /> : (!value ? <Kbd size="xs">Ctrl K</Kbd> : null)}
          rightSectionWidth={64}
          value={value}
          onChange={(e) => { setValue(e.currentTarget.value); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(e) => { if (e.key === 'Escape') { setValue(''); combobox.closeDropdown(); input.current?.blur(); } }}
          aria-label="Search customers and invoices"
          className={classes.input}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={query.length < 2} className={classes.dropdown}>
        <Combobox.Options mah={480} style={{ overflowY: 'auto' }}>
          {empty && <Combobox.Empty>Nothing matches “{query}”.</Combobox.Empty>}
          {data?.customers.length > 0 && (
            <Combobox.Group label={groupLabel(IconUsers, 'Customers', data.customer_count, data.customers.length)}>
              {data.customers.map((c) => <Combobox.Option key={`c${c.id}`} value={`c:${c.id}:${c.name}`} className={classes.option}><CustomerLine c={c} /></Combobox.Option>)}
              {admin && data.customer_count > data.customers.length && <Combobox.Option value="all-c" className={classes.seeAll}>See all {data.customer_count} in Customers →</Combobox.Option>}
            </Combobox.Group>
          )}
          {data?.invoices.length > 0 && (
            <Combobox.Group label={groupLabel(IconFileInvoice, 'Invoices', data.invoice_count, data.invoices.length)}>
              {data.invoices.map((i) => <Combobox.Option key={`i${i.id}`} value={`i:${i.id}:${i.customer_id}`} className={classes.option}><InvoiceLine i={i} badge /></Combobox.Option>)}
              {admin && data.invoice_count > data.invoices.length && <Combobox.Option value="all-i" className={classes.seeAll}>See all {data.invoice_count} in Invoices →</Combobox.Option>}
            </Combobox.Group>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
    {details}
    </>
  );
}
