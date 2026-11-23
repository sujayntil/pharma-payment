import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Tooltip, Alert, Badge, Button, Group, Loader, Menu, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowsSort, IconBook, IconBrandWhatsapp, IconCash, IconCategory, IconDots, IconEdit, IconTrash, IconUser } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import { adminApi } from '../../api/adminApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { CardList } from '../../components/common/RowCard';
import SelectableRowCard from '../../components/common/SelectableRowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { useInvoiceTicks } from '../../hooks/useInvoiceTicks';
import { deleteWithUndo } from '../../components/collections/deleteWithUndo';
import { TickAllCell, TickCell, TickedBar } from '../../components/collections/InvoiceTicks';
import FilterBar, { FilterChecks, FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
import CustomerCollectModal from '../../components/collections/CustomerCollectModal';
// Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
// import MarkUnpaidModal from '../../components/collections/MarkUnpaidModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import { PanelTop } from '../../components/common/BackToTop';
import SidePanel from '../../components/common/SidePanel';
import LedgerShareButton from '../../components/customers/LedgerShareButton';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { displayPhone, errorText, money, shortDate } from '../../utils/formatters';
import { CustomerContactRow } from '../../components/customers/CustomerContact';
import EditCustomerModal from '../../components/customers/EditCustomerModal';
import CustomerFormModal from '../../components/customers/CustomerFormModal';

import { TYPE_GROUPS, listLabel } from '../../utils/customerTypes';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import EmptyResults from '../../components/common/EmptyResults';
import { useFirstInvoiceDate } from '../../hooks/useFirstInvoiceDate';
import TableScroll from '../../components/common/TableScroll';
import StickyFilters from '../../components/common/StickyFilters';
import TitleBar, { MiniStat } from '../../components/common/TitleBar';
const BLANK_LEDGER = { range: EMPTY_RANGE, status: '' };

/** openCustomer: optional { id, name } to open straight into that ledger (from the Dashboard). */
// Sort choices (default: most pending first).
const SORTS = [
  { value: 'pending', label: 'Most pending first' },
  { value: 'invoices', label: 'Most invoices first' },
  { value: 'invoices_asc', label: 'Least invoices first' },
  { value: 'name', label: 'Name A–Z' },
];

// Only customers with no invoices can be deleted, so only they can be ticked.
const NO_INVOICES = (customer) => Number(customer.invoice_count) === 0;

export default function AdminCustomers({ openCustomer = null }) {
  const firstDate = useFirstInvoiceDate(); // month picker fades months before it
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(() => window.history.state?.usr?.search || ''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState({ mrId: '', type: '', sort: '' }); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(openCustomer); const [collectingCustomer, setCollectingCustomer] = useState(null); const [ledger, setLedger] = useState(null); const [ledgerSearch, setLedgerSearch] = useState(''); const [debouncedLedgerSearch] = useDebouncedValue(ledgerSearch, 300); const [ledgerFilters, setLedgerFilters] = useState(BLANK_LEDGER); const [ledgerPage, setLedgerPage] = useState(1); const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const isMobile = useIsMobile();
  // Back closes the open ledger instead of leaving the screen.
  useBackClose(!!selected, () => setSelected(null));
  const [recording, setRecording] = useState(null); /* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed: const [reversing, setReversing] = useState(null); */ const [historyId, setHistoryId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editingDetails, setEditingDetails] = useState(null); // ledger's "Edit details"
  const closeDetails = useCallback(() => setEditingDetails(null), []);
  const ticks = useInvoiceTicks(selected?.id);
  // Ticked customers on the list (to delete several at once).
  const customerTicks = useInvoiceTicks('customers', { selectable: NO_INVOICES });
  const collectAll = (customer) => (event) => { event.stopPropagation(); setCollectingCustomer({ id: customer.id, name: customer.name }); };
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch((err) => { if (active) setError(errorText(err)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }), ...(filters.mrId && { mr_id: filters.mrId }), sort: filters.sort || 'pending', ...(filters.type && { customer_type: filters.type }) });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, refresh, debouncedSearch, appRefresh]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLedgerLoading(true); setError('');
      try {
        const result = await customersApi.getCustomerLedger(selected.id, { limit: PAGE_SIZE, offset: (ledgerPage - 1) * PAGE_SIZE, ...(debouncedLedgerSearch.trim() && { search: debouncedLedgerSearch.trim() }), ...(ledgerFilters.range.from && { date_from: ledgerFilters.range.from }), ...(ledgerFilters.range.to && { date_to: ledgerFilters.range.to }), ...(ledgerFilters.status && { status: ledgerFilters.status }) });
        if (active) setLedger(result);
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLedgerLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ledgerFilters, ledgerPage, ledgerRefresh, debouncedLedgerSearch, selected, appRefresh]);

  const mrOptions = useMemo(() => mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), [mrs]);
  // The MR filter also offers "Unassigned" (sent as mr_id 0: no MR).
  const mrFilterOptions = useMemo(() => [...mrOptions, { value: '0', label: 'Unassigned' }], [mrOptions]);
  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setFilters({ mrId: '', type: '', sort: '' }); setSearch(''); setPage(1); };
  const chips = [
    // Default order is most pending first; a chip shows only for Name A–Z.
    filters.sort && { key: 'sort', label: SORTS.find((option) => option.value === filters.sort)?.label, onRemove: () => update({ sort: '' }) },
    filters.mrId && { key: 'mr', label: `MR: ${mrFilterOptions.find((o) => o.value === filters.mrId)?.label || '—'}`, onRemove: () => update({ mrId: '' }) },
    filters.type && { key: 'type', label: `Type: ${listLabel(filters.type)}`, onRemove: () => update({ type: '' }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const updateLedger = (patch) => { setLedgerFilters((current) => ({ ...current, ...patch })); setLedgerPage(1); };
  // The ledger's filters (no paging), for the PDF.
  const ledgerPdfParams = { ...(debouncedLedgerSearch.trim() && { search: debouncedLedgerSearch.trim() }), ...(ledgerFilters.range.from && { date_from: ledgerFilters.range.from }), ...(ledgerFilters.range.to && { date_to: ledgerFilters.range.to }), ...(ledgerFilters.status && { status: ledgerFilters.status }) };
  const onLedgerSearch = (value) => { setLedgerSearch(value); setLedgerPage(1); };
  const resetLedger = () => { setLedgerFilters(BLANK_LEDGER); setLedgerSearch(''); setLedgerPage(1); };
  const ledgerRange = describeRange(ledgerFilters.range);
  const ledgerChips = [
    ledgerFilters.status && { key: 'status', label: `Status: ${ledgerFilters.status.toLowerCase()}`, onRemove: () => updateLedger({ status: '' }) },
    ledgerRange && { key: 'range', label: `Invoice date: ${ledgerRange}`, onRemove: () => updateLedger({ range: EMPTY_RANGE }) },
    ledgerSearch.trim() && { key: 'q', label: `“${ledgerSearch.trim()}”`, onRemove: () => onLedgerSearch('') },
  ];
  const reloadLedger = () => setLedgerRefresh((value) => value + 1);
  // Clicking the row opens the ledger; Edit/Delete stop the click so they don't also open it.
  const customerActions = (customer) => <Group gap="xs" wrap="nowrap" justify="flex-end" onClick={(event) => event.stopPropagation()}>{/* Disabled: replaced by clicking the row. Re-enable if needed.
  <Button size="xs" variant="light" onClick={() => openLedger(customer)}>Ledger</Button> */}{/* Laptop rows: [Collect all] [⋯]; settled rows keep an empty slot so ⋯ lines up. */}{Number(customer.pending_amount) > 0 ? <Button size="xs" leftSection={<IconCash size={14} />} onClick={collectAll(customer)} aria-label={`Collect all from ${customer.name}`}>Collect all</Button> : <div style={{ width: 98 }} />}{customerMenu(customer)}</Group>;
  // Phones: Edit / Delete live in a ⋯ menu so Delete is not one slip away.
  const customerMenu = (customer) => (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <Menu position="bottom-end" shadow="md" withinPortal>
        <Menu.Target><ActionIcon variant="subtle" color="gray" size="lg" aria-label={`More actions for ${customer.name}`}><IconDots size={18} /></ActionIcon></Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBook size={15} />} onClick={() => openLedger(customer)}>View ledger</Menu.Item>
          <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => openEdit(customer)}>Edit customer</Menu.Item>
          <Menu.Divider />
          {/* Customers with invoices can't be deleted (their ledger stays): greyed, blocked cursor, short tip. */}
          {Number(customer.invoice_count) > 0 ? (
            <Tooltip label="Has invoices" position="left" withArrow withinPortal>
              <Menu.Item
                leftSection={<IconTrash size={15} />}
                closeMenuOnClick={false}
                aria-disabled
                c="dimmed"
                style={{ cursor: 'not-allowed', opacity: 0.6 }}
                onClick={(event) => event.preventDefault()}
              >
                Delete customer
              </Menu.Item>
            </Tooltip>
          ) : (
            <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => deleteCustomer(customer)}>Delete customer</Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
  // One visible action (Collect). Clicking the row opens the invoice panel.
  const ledgerActions = (invoice) => (
    <Group gap={4} wrap="nowrap" justify="flex-end" onClick={(event) => event.stopPropagation()}>
              {Number(invoice.pending_amount) > 0 && <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={() => setRecording(invoice)}>Collect</Button>}
              {/* Replaced by clicking the row (opens the invoice panel):
              <Menu position="bottom-end" shadow="md" withinPortal>
                <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${invoice.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconHistory size={15} />} onClick={() => setHistoryId(invoice.invoice_id)}>Invoice history</Menu.Item>
                  {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
                  {invoice.paid_amount > 0 && <Menu.Item color="orange" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing(invoice)}>Mark unpaid</Menu.Item>} * /}
                </Menu.Dropdown>
              </Menu> */}
            </Group>
  );

  const openLedger = (customer) => { setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerFilters(BLANK_LEDGER); setLedgerPage(1); };
  const openEdit = (customer) => setEditing(customer);
  // No confirm box for customers (only ones without invoices can be deleted): it leaves the list
  // at once and the server delete waits for the Undo bar.
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const setHidden = (id, hidden) => setHiddenIds((current) => { const next = new Set(current); if (hidden) next.add(id); else next.delete(id); return next; });
  const deleteCustomer = (customer) => deleteWithUndo({
    path: `/customers/${customer.id}`,
    message: `${customer.name} deleted`,
    onHide: () => setHidden(customer.id, true),
    onRestore: () => setHidden(customer.id, false),
    onDone: () => setRefresh((value) => value + 1),
  });
  // Several at once (up to 20, only customers with no invoices): Undo bar, no confirm box.
  const deleteManyCustomers = () => {
    const list = customerTicks.invoices();
    const ids = list.map((customer) => customer.id);
    customerTicks.clear();
    deleteWithUndo({
      path: '/customers/bulk-delete',
      method: 'POST',
      body: { ids },
      message: `${ids.length} customers deleted`,
      onHide: () => ids.forEach((id) => setHidden(id, true)),
      onRestore: () => ids.forEach((id) => setHidden(id, false)),
      onDone: () => setRefresh((value) => value + 1),
    });
  };

  const shownCustomers = customers.filter((customer) => !hiddenIds.has(customer.id));
  return <Stack gap="md">
    {isMobile && <><Group justify="space-between" align="center" wrap="nowrap"><Group gap="sm" align="center" wrap="nowrap"><Title order={1}>Customers</Title><Badge variant="light" size="lg">{total}</Badge></Group>{/* Add customer is hidden: new customers are added from Import & mapping (Add invoice). The form still supports it: onClick={() => setEditing({})} */}</Group></>}
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}{notice && <Alert color="green" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    {/* Laptop: title, count, search and filters stay pinned while the rows scroll. */}
    <StickyFilters enabled={!isMobile}><Stack gap="sm">
    {!isMobile && <TitleBar title="Customers"><MiniStat label="Customers" value={total} /></TitleBar>}
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Customer, phone" chips={chips} onReset={reset}>
      <FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} data={mrFilterOptions} value={filters.mrId} onChange={(mrId) => update({ mrId })} />
      <FilterChecks placeholder="All types" icon={<IconCategory size={16} />} data={TYPE_GROUPS} value={filters.type} onChange={(type) => update({ type })} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORTS} value={filters.sort || 'pending'} clearable={false} allowDeselect={false} onChange={(next) => update({ sort: next === 'pending' ? '' : next })} />
    </FilterBar>
    </Stack></StickyFilters>
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && customers.length > 0)}>{loading && !customers.length ? <Group justify="center" p="xl"><Loader /></Group> : !shownCustomers.length ? (chips.some(Boolean) ? <EmptyResults search={search} noun="customers" onClear={reset} /> : <Text ta="center" c="dimmed" py="xl">No customers yet.</Text>) : isMobile ? <CardList>{shownCustomers.map((customer) => (
      <SelectableRowCard
        key={customer.id}
        onOpen={() => openLedger(customer)}
        canSelect={NO_INVOICES(customer)}
        selecting={customerTicks.count > 0}
        selected={customerTicks.isTicked(customer)}
        onToggle={() => customerTicks.toggle(customer)}
        label={customer.name}
        title={customer.name}
        subtitle={[customer.type, displayPhone(customer.phone), displayPhone(customer.alternate_phone)].filter(Boolean).join(' · ') || undefined}
        amount={money(customer.pending_amount)}
        amountLabel={Number(customer.pending_amount) > 0 ? 'pending' : 'settled'}
        amountColor={Number(customer.pending_amount) > 0 ? 'red' : 'dimmed'}
        badges={(
          // "Rahul · 2 invoices" with Edit / Delete in a ⋯ menu on the right.
          <Group justify="space-between" align="center" wrap="nowrap" gap="xs" w="100%">
            <Text size="sm" c="dimmed">
              {customer.mr_name ? <Text span size="sm" fw={600} c="var(--mantine-color-text)">{customer.mr_name}</Text> : 'Unassigned'}
              {' · '}{customer.invoice_count} {Number(customer.invoice_count) === 1 ? 'invoice' : 'invoices'}
            </Text>
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              {Number(customer.pending_amount) > 0 && <Button size="sm" leftSection={<IconCash size={15} />} onClick={collectAll(customer)} onKeyDown={(event) => event.stopPropagation()} aria-label={`Collect all from ${customer.name}`}>Collect all</Button>}
              {customerMenu(customer)}
            </Group>
          </Group>
        )}
      />
    ))}</CardList> : <TableScroll minWidth={900}><Table miw={900} highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th w={36}><TickAllCell ticks={customerTicks} invoices={shownCustomers} /></Table.Th><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Phone</Table.Th><Table.Th>MR</Table.Th><Table.Th>Invoices</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Last invoice</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{shownCustomers.map((customer) => <Table.Tr key={customer.id} onClick={() => openLedger(customer)} style={{ cursor: 'pointer' }}><Table.Td onClick={(event) => event.stopPropagation()}><TickCell ticks={customerTicks} invoice={customer} label={customer.name} /></Table.Td><Table.Td fw={600}>{customer.name}</Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{displayPhone(customer.phone) || '—'}{customer.whatsapp_on === 'main' && <IconBrandWhatsapp size={14} color="#25D366" style={{ marginLeft: 4, verticalAlign: -2 }} aria-label="WhatsApp" />}{customer.alternate_phone && <Text size="xs" c="dimmed">Alt {displayPhone(customer.alternate_phone)}{customer.whatsapp_on === 'alternate' && <IconBrandWhatsapp size={13} color="#25D366" style={{ marginLeft: 4, verticalAlign: -2 }} aria-label="WhatsApp" />}</Text>}</Table.Td><Table.Td>{customer.mr_name || <Badge color="gray" variant="light">Unassigned</Badge>}</Table.Td><Table.Td>{customer.invoice_count}</Table.Td><Table.Td ta="right" fw={700} c={Number(customer.pending_amount) > 0 ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{money(customer.pending_amount)}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{customer.latest_invoice_date ? shortDate(customer.latest_invoice_date) : '—'}</Table.Td><Table.Td>{customerActions(customer)}</Table.Td></Table.Tr>)}</Table.Tbody></Table></TableScroll>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="customers" />
    </Paper>
    <TickedBar ticks={customerTicks} invoices={shownCustomers} showTotal={false} onDelete={deleteManyCustomers} deleteLabel="Delete customers" />
    <SidePanel opened={!!selected} onClose={() => setSelected(null)} width={840} mobileProps={{ position: 'right', size: '100%', radius: 0 }} styles={{ title: { flex: 1, minWidth: 0, marginRight: 8 } }} title={<Group gap="xs" wrap="nowrap" align="center" style={{ flex: 1 }}>
      <div style={{ minWidth: 0 }}>
        <Text fw={700} style={{ overflowWrap: 'anywhere' }}>{ledger?.customer?.name || selected?.name || ''}</Text>
        {/* "Chemist · Andheri West · MR: Neha": what to fix shows at a glance. */}
        <Text size="sm" c="dimmed">{[ledger?.customer?.type || selected?.type, ledger?.customer?.area, `MR: ${ledger?.customer?.mr_name || selected?.mr_name || 'Unassigned'}`].filter(Boolean).join(' · ')}</Text>
      </div>
      {/* Ledger as a PDF: Share on phones, Download on laptops. */}
      <div style={{ marginLeft: 'auto' }}>{selected && <LedgerShareButton customerId={selected.id} customerName={ledger?.customer?.name || selected.name} params={ledgerPdfParams} disabled={!ledger || !ledger.invoice_count} excel />}</div>
    </Group>}>
      <Stack gap="md">
        {/* Numbers with call / WhatsApp, Edit, or "+ Add phone" (same as the MR screen). */}
        {selected && (() => {
          const contact = {
            id: selected.id,
            name: selected.name,
            phone: ledger?.customer ? ledger.customer.phone : selected.phone,
            alternate_phone: ledger?.customer ? ledger.customer.alternate_phone : selected.alternate_phone,
            whatsapp_on: ledger?.customer ? ledger.customer.whatsapp_on : selected.whatsapp_on,
          };
          return (
            // Numbers with call / WhatsApp, then ⋯ > Edit details (same as Insights).
            <Group gap={6} wrap="nowrap" align="center">
              <div style={{ flex: 1, minWidth: 0 }}><CustomerContactRow name={contact.name} phone={contact.phone} alternatePhone={contact.alternate_phone} whatsappOn={contact.whatsapp_on} editable={false} onEdit={() => setEditingDetails(contact.id)} /></div>
              <Menu position="bottom-end" shadow="md" withinPortal>
                <Menu.Target><ActionIcon variant="subtle" color="gray" size="lg" aria-label={`More actions for ${contact.name}`}><IconDots size={18} /></ActionIcon></Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setEditingDetails(contact.id)}>Edit details</Menu.Item>
                  <Menu.Divider />
                  {/* Same rule as the list: a customer with invoices can't be deleted. */}
                  {Number(ledger?.invoice_count ?? selected.invoice_count) > 0 ? (
                    <Tooltip label="Has invoices" position="left" withArrow withinPortal>
                      <Menu.Item leftSection={<IconTrash size={15} />} closeMenuOnClick={false} aria-disabled c="dimmed" style={{ cursor: 'not-allowed', opacity: 0.6 }} onClick={(event) => event.preventDefault()}>Delete customer</Menu.Item>
                    </Tooltip>
                  ) : (
                    <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => { const customer = selected; setSelected(null); deleteCustomer(customer); }}>Delete customer</Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          );
        })()}
        {ledger && (isMobile
          ? (
            // Phones: one compact row instead of three stacked boxes.
            <Paper withBorder p="sm" radius="md">
              <SimpleGrid cols={3} spacing="xs">
                {[['Invoiced', ledger.total_invoiced, undefined], ['Collected', ledger.total_paid, 'green'], ['Pending', ledger.outstanding, 'red']].map(([label, value, color]) => (
                  <div key={label} style={{ minWidth: 0, textAlign: 'center', borderLeft: label === 'Invoiced' ? undefined : '1px solid var(--app-line)' }}><Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={700} c={color} style={{ overflowWrap: 'anywhere' }}>{money(value)}</Text></div>
                ))}
              </SimpleGrid>
            </Paper>
          )
          : <SimpleGrid cols={3} spacing="xs"><StatCard size="md" label="Invoiced" value={money(ledger.total_invoiced)} /><StatCard size="md" label="Collected" color="green" value={money(ledger.total_paid)} /><StatCard size="md" label="Pending" color="red" value={money(ledger.outstanding)} /></SimpleGrid>)}
        {/* Laptop: search and filters stay pinned while the rows scroll. */}
        <StickyFilters enabled={!isMobile}>
        <FilterBar compact search={ledgerSearch} onSearch={onLedgerSearch} searchPlaceholder="Search this customer's invoices" chips={ledgerChips} onReset={resetLedger}>
          <StatusTabs value={ledgerFilters.status} onChange={(status) => updateLedger({ status })} />
          <DateRangeFilter label="Invoice date" value={ledgerFilters.range} onChange={(range) => updateLedger({ range })} months firstDate={firstDate} quick={[]} />
        </FilterBar>
        </StickyFilters>
        {!ledger ? <Group justify="center" p="xl"><Loader /></Group> : <div {...reloadingStyle(ledgerLoading)}>{!ledger.invoices.length ? (ledgerChips.some(Boolean) ? <EmptyResults search={ledgerSearch} noun="invoices" onClear={resetLedger} /> : <Text ta="center" c="dimmed" py="xl">No invoices for this customer yet.</Text>) : <>{isMobile ? <CardList>{ledger.invoices.map((invoice) => (
          <InvoiceCard key={invoice.invoice_id} invoice={invoice} customerType={ledger.customer?.type ?? selected?.type} showCustomer={false} onOpen={() => setHistoryId(invoice.invoice_id)} onCollect={setRecording} onSelect={ticks.toggle} selected={ticks.isTicked(invoice)} selecting={ticks.count > 0} />
        ))}</CardList> : <TableScroll minWidth={680}><Table miw={680} verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th w={36}>{ledger && <TickAllCell ticks={ticks} invoices={ledger.invoices} />}</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th>{/* Disabled: MR is shown once in the header. Re-enable if needed. <Table.Th>MR</Table.Th> */}<Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id} onClick={() => setHistoryId(invoice.invoice_id)} style={{ cursor: 'pointer' }}>
          <Table.Td onClick={(event) => event.stopPropagation()}><TickCell ticks={ticks} invoice={invoice} /></Table.Td>
          <Table.Td fw={600} style={{ whiteSpace: 'nowrap' }}>{invoice.invoice_number}{invoice.mr && invoice.mr !== ledger.customer?.mr_name && <Text size="xs" c="dimmed" fw={400}>MR {invoice.mr}</Text>}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.date)}</Table.Td>{/* <Table.Td>{invoice.mr || '—'}</Table.Td> */}<Table.Td ta="right">{money(invoice.amount)}</Table.Td><Table.Td ta="right" c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td>
          <Table.Td><StatusCell row={invoice} /></Table.Td>
          <Table.Td maw={180}><RecordedBy row={invoice} /></Table.Td>
          <Table.Td>{ledgerActions(invoice)}</Table.Td>
        </Table.Tr>)}</Table.Tbody></Table></TableScroll>}<ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(debouncedLedgerSearch.trim())} label="invoices" /></>}</div>}
        <TickedBar ticks={ticks} invoices={ledger?.invoices} onCollect={() => setCollectingCustomer({ id: selected.id, name: selected.name, invoiceIds: ticks.ids() })} />
      </Stack>
      {/* Long ledger: ↑ back to the totals and filters. */}
      <PanelTop hidden={ticks.count > 0} />
    </SidePanel>
    <CustomerCollectModal customer={collectingCustomer} onClose={() => setCollectingCustomer(null)} onSaved={() => { setRefresh((value) => value + 1); reloadLedger(); ticks.clearSoon(); }} />
    <RecordCollectionModal invoice={recording && { ...recording, customer_name: selected?.name }} onClose={() => setRecording(null)} onSaved={() => { reloadLedger(); ticks.clearSoon(); }} />
    {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
    <MarkUnpaidModal invoice={reversing && { ...reversing, customer_name: selected?.name }} onClose={() => setReversing(null)} onSaved={reloadLedger} /> */}
    {/* Saving reloads the customer screen and the list so the new numbers show everywhere. */}
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={reloadLedger} onRecord={setRecording} refreshKey={ledgerRefresh} />
    <EditCustomerModal customerId={editingDetails} onClose={closeDetails} onSaved={(saved) => {
      setSelected((current) => (current && current.id === saved.id ? { ...current, ...saved } : current));
      setRefresh((value) => value + 1); reloadLedger();
    }} />
    {/* Add customer ({}) and Edit customer share one form. */}
    <CustomerFormModal customer={editing} mrOptions={mrOptions} onClose={() => setEditing(null)} onSaved={(saved, isNew) => {
      setNotice(isNew ? `${saved.name} added.` : 'Customer details saved.');
      setSelected((current) => (current && current.id === saved.id ? { ...current, ...saved } : current));
      setRefresh((value) => value + 1); reloadLedger();
    }} />
  </Stack>;
}
