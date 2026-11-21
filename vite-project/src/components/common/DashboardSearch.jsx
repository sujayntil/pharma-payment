import { useEffect, useRef, useState } from 'react';
import { Combobox, Group, Kbd, Loader, Text, TextInput, useCombobox } from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { IconFileInvoice, IconSearch, IconUsers } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { StatusBadge } from '../collections/CollectionBadges';
import { useIsMobile } from '../../hooks/useIsMobile';
import { money, shortDate } from '../../utils/formatters';
import classes from './DashboardSearch.module.css';

/**
 * Dashboard search: type a customer, phone or invoice number; matches show
 * in two groups. A customer opens their ledger, an invoice its details.
 * Ctrl+K (⌘K) jumps here. Arrow keys and Enter work.
 */
export default function DashboardSearch({ onCustomer, onInvoice }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const input = useRef(null);
  const [value, setValue] = useState('');
  const [query] = useDebouncedValue(value.trim(), 250);
  const [state, setState] = useState({ q: '', data: null });
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  useHotkeys([['mod+K', () => { input.current?.focus(); combobox.openDropdown(); }]]);

  useEffect(() => {
    if (query.length < 2) return undefined;
    let live = true;
    adminApi.quickSearch(query).then((data) => live && setState({ q: query, data })).catch(() => live && setState({ q: query, data: { customers: [], invoices: [] } }));
    return () => { live = false; };
  }, [query]);

  const ready = query.length >= 2 && state.q === query;
  const data = ready ? state.data : null;
  const loading = query.length >= 2 && !ready;
  const pick = (key) => {
    const [kind, id, extra] = key.split(':');
    combobox.closeDropdown();
    setValue('');
    input.current?.blur();
    if (kind === 'c') onCustomer({ id: Number(id), name: extra });
    else if (kind === 'i') onInvoice(Number(id));
    else if (kind === 'all-i') navigate('/admin/invoices', { state: { search: query } });
    else if (kind === 'all-c') navigate('/admin/customers', { state: { search: query } });
  };

  return (
    <Combobox store={combobox} onOptionSubmit={pick} withinPortal position="bottom-start" offset={6} shadow="md" width="target" zIndex={300}>
      <Combobox.Target>
        <TextInput
          ref={input}
          size={isMobile ? 'md' : 'md'}
          radius="md"
          placeholder="Search customer, phone or invoice"
          leftSection={<IconSearch size={18} />}
          rightSection={loading ? <Loader size={16} /> : (!isMobile && !value ? <Kbd size="xs">Ctrl K</Kbd> : null)}
          rightSectionWidth={isMobile ? 36 : 64}
          value={value}
          onChange={(e) => { setValue(e.currentTarget.value); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(e) => { if (e.key === 'Escape') { setValue(''); combobox.closeDropdown(); } }}
          aria-label="Search customers and invoices"
          className={classes.input}
          maw={isMobile ? undefined : 720}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={query.length < 2} className={classes.dropdown}>
        <Combobox.Options mah={isMobile ? 420 : 480} style={{ overflowY: 'auto' }}>
          {data && !data.customers.length && !data.invoices.length && <Combobox.Empty>Nothing matches “{query}”.</Combobox.Empty>}
          {data?.customers.length > 0 && (
            <Combobox.Group label={<Group gap={6}><IconUsers size={13} />Customers{data.customer_count > data.customers.length ? ` · ${data.customer_count}` : ''}</Group>}>
              {data.customers.map((c) => (
                <Combobox.Option key={`c${c.id}`} value={`c:${c.id}:${c.name}`} className={classes.option}>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{c.name}</Text>
                      <Text size="xs" c="dimmed" truncate>{[c.type, c.area, c.mr ? `MR ${c.mr}` : 'No MR'].filter(Boolean).join(' · ')}</Text>
                    </div>
                    {c.pending > 0 ? <Text size="sm" fw={700} c="red.7" style={{ whiteSpace: 'nowrap' }}>{money(c.pending)}</Text> : <Text size="xs" c="dimmed">Nothing due</Text>}
                  </Group>
                </Combobox.Option>
              ))}
              {data.customer_count > data.customers.length && <Combobox.Option value="all-c" className={classes.seeAll}>See all {data.customer_count} in Customers →</Combobox.Option>}
            </Combobox.Group>
          )}
          {data?.invoices.length > 0 && (
            <Combobox.Group label={<Group gap={6}><IconFileInvoice size={13} />Invoices{data.invoice_count > data.invoices.length ? ` · ${data.invoice_count}` : ''}</Group>}>
              {data.invoices.map((i) => (
                <Combobox.Option key={`i${i.id}`} value={`i:${i.id}`} className={classes.option}>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{i.invoice_number} <Text span size="xs" c="dimmed" fw={400}>· {shortDate(i.invoice_date)}</Text></Text>
                      <Text size="xs" c="dimmed" truncate>{i.customer || '—'}</Text>
                    </div>
                    <Group gap={8} wrap="nowrap">
                      <Text size="sm" fw={700} style={{ whiteSpace: 'nowrap' }}>{money(i.total)}</Text>
                      {!isMobile && <StatusBadge status={i.status} />}
                    </Group>
                  </Group>
                </Combobox.Option>
              ))}
              {data.invoice_count > data.invoices.length && <Combobox.Option value="all-i" className={classes.seeAll}>See all {data.invoice_count} in Invoices →</Combobox.Option>}
            </Combobox.Group>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
