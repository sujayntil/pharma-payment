import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Loader, Modal, NumberInput, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { /* IconArrowBackUp, IconDots, IconHistory, */ IconArrowsSort, IconCash, IconCircleCheck, IconEdit, IconTrash, IconUser } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import { adminApi } from '../../api/adminApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSidePanelSpace } from '../../hooks/useSidePanelSpace';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
// Replaced by the Pending / Paid / All tabs + "Show only" below:
// import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
// Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
// import MarkUnpaidModal from '../../components/collections/MarkUnpaidModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import InvoiceCard from '../../components/collections/InvoiceCard';
import { PAYMENT_MODES } from '../../components/collections/collectionUtils';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { errorText, money, shortDate } from '../../utils/formatters';

/*
 * Admin Invoices. Same pattern as the MR Invoices screen:
 *   Pending / Paid / All tabs (+ "Show only", labelled after the tab),
 *   MR, invoice date and sort filters, all applied by the server.
 * Rows show one action (Record). Clicking a row opens the invoice panel with
 * the summary, Record collection, history and a "⋯" menu for Edit / Delete.
 */
const TABS = [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }];
const ONLY_OPTIONS = {
  pending: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIAL', label: 'Part paid' }, { value: 'REVERSED', label: 'Reversed' }],
  paid: [],
  all: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PARTIAL', label: 'Part paid' }, { value: 'PAID', label: 'Paid' }, { value: 'REVERSED', label: 'Reversed' }],
};
const ONLY_PLACEHOLDER = { pending: 'All pending', paid: 'All paid', all: 'All invoices' };
const SORTS = [{ value: 'newest', label: 'Newest invoice first' }, { value: 'oldest', label: 'Oldest invoice first' }, { value: 'amount', label: 'Highest pending first' }];
const BLANK = { mrId: '', only: '', range: EMPTY_RANGE, sort: 'newest' };

function tabParams(tab, only) {
  if (tab === 'paid') return { status: 'PAID' };
  if (tab === 'pending') return { pending_only: true, ...(only && { status: only }) };
  return only ? { status: only } : {};
}

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]); const [total, setTotal] = useState(0); const [pendingTotal, setPendingTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [tab, setTab] = useState('pending'); const [counts, setCounts] = useState({});
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState(BLANK); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null); const [form, setForm] = useState(null); const [deleting, setDeleting] = useState(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const isMobile = useIsMobile();
  const [recording, setRecording] = useState(null); /* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed: const [reversing, setReversing] = useState(null); */ const [historyId, setHistoryId] = useState(null); const [historyKey, setHistoryKey] = useState(0);
  const panelSpace = useSidePanelSpace(Boolean(historyId));

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
        const result = await invoicesApi.getInvoices({
          limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
          ...tabParams(tab, filters.only),
          sort_order: filters.sort,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(filters.mrId && { mr_id: filters.mrId }),
          ...(filters.range.from && { date_from: filters.range.from }),
          ...(filters.range.to && { date_to: filters.range.to }),
        });
        if (active) { setInvoices(result.items); setTotal(result.total); setPendingTotal(result.filtered_outstanding ?? 0); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [tab, filters, page, refresh, debouncedSearch]);

  // Tab counts (unfiltered), refreshed after every change.
  useEffect(() => {
    let active = true;
    Promise.all(TABS.map((t) => invoicesApi.getInvoices({ ...tabParams(t.value, ''), limit: 1, offset: 0 })))
      .then((results) => { if (active) setCounts({ pending: results[0].total, paid: results[1].total, all: results[2].total }); })
      .catch(() => { /* counts are a convenience; the list shows its own errors */ });
    return () => { active = false; };
  }, [refresh]);

  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const changeTab = (next) => { setTab(next); if (!ONLY_OPTIONS[next].some((o) => o.value === filters.only)) update({ only: '' }); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setFilters(BLANK); setSearch(''); setPage(1); };
  const reload = useCallback(() => { setRefresh((value) => value + 1); setHistoryKey((value) => value + 1); }, []);
  const mrOptions = useMemo(() => mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), [mrs]);
  const rangeLabel = describeRange(filters.range);
  const onlyOptions = ONLY_OPTIONS[tab];
  const tabData = TABS.map((t) => ({ value: t.value, label: counts[t.value] == null ? t.label : `${t.label} ${counts[t.value]}` }));
  /* Replaced: the per-row history icon and "⋯" menu (history, edit, delete).
     A row click now opens the invoice panel; Edit / Delete are in its "⋯" menu.
  const rowActions = (invoice) => (
    <Group gap={4} wrap="nowrap" justify="flex-end">
          {invoice.pending_amount > 0 && <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={() => setRecording(invoice)}>Record</Button>}
          <Tooltip label="Invoice history" withArrow>
            <ActionIcon variant="light" color="gray" size={isMobile ? 'lg' : 'md'} aria-label={`History for ${invoice.invoice_number}`} onClick={() => setHistoryId(invoice.id)}><IconHistory size={isMobile ? 18 : 16} /></ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" shadow="md" withinPortal>
            <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${invoice.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconHistory size={15} />} onClick={() => setHistoryId(invoice.id)}>Collection history</Menu.Item>
              <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => openEdit(invoice)}>Edit invoice</Menu.Item>
              {invoice.paid_amount > 0 && <Menu.Item color="orange" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing(invoice)}>Mark unpaid</Menu.Item>}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => setDeleting(invoice)}>Delete invoice</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
  );
  */
  const chips = [
    filters.only && { key: 'only', label: `Show only: ${onlyOptions.find((o) => o.value === filters.only)?.label}`, onRemove: () => update({ only: '' }) },
    filters.mrId && { key: 'mr', label: `MR: ${mrOptions.find((o) => o.value === filters.mrId)?.label || '—'}`, onRemove: () => update({ mrId: '' }) },
    rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => update({ range: EMPTY_RANGE }) },
    filters.sort !== 'newest' && { key: 'sort', label: SORTS.find((s) => s.value === filters.sort)?.label, onRemove: () => update({ sort: 'newest' }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const openEdit = (invoice) => { setEditing(invoice); setForm({ invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date || '', customer_name: invoice.customer_name || '', total_amount: invoice.total_amount, payment_mode: invoice.payment_mode || '', remarks: invoice.remarks || '' }); };
  const save = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await invoicesApi.updateInvoice(editing.id, { ...form, invoice_number: form.invoice_number.trim(), customer_name: form.customer_name.trim(), total_amount: Number(form.total_amount), payment_mode: form.payment_mode || null, remarks: form.remarks.trim() || null }); setEditing(null); setNotice('Invoice updated.'); reload(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); setError(''); try { await invoicesApi.deleteInvoice(deleting.id); if (historyId === deleting.id) setHistoryId(null); setDeleting(null); setNotice('Invoice and its collection history were deleted.'); reload(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };
  const panelActions = [
    { label: 'Edit invoice', icon: <IconEdit size={15} />, onClick: openEdit },
    { label: 'Delete invoice', icon: <IconTrash size={15} />, color: 'red', onClick: setDeleting },
  ];
  const recordButton = (invoice) => Number(invoice.pending_amount) > 0 && (
    <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={(event) => { event.stopPropagation(); setRecording(invoice); }}>Record</Button>
  );

  return <Stack gap="md" style={panelSpace}><div><Title order={1}>Invoices</Title><Text c="dimmed">Click an invoice to see its history, record a collection, or edit it.</Text></div>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}{notice && <Alert color="green" withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
    <SegmentedControl fullWidth={isMobile} style={isMobile ? undefined : { alignSelf: 'flex-start' }} data={tabData} value={tab} onChange={changeTab} aria-label="Invoice status" />
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search invoice, customer or MR" chips={chips} onReset={reset}>
      {/* Replaced by the tabs above + "Show only": <StatusTabs value={filters.status} onChange={(status) => update({ status })} /> */}
      {onlyOptions.length > 0 && <FilterSelect placeholder={ONLY_PLACEHOLDER[tab]} icon={<IconCircleCheck size={16} />} data={onlyOptions} value={filters.only} onChange={(only) => update({ only })} />}
      <FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} searchable data={mrOptions} value={filters.mrId} onChange={(mrId) => update({ mrId })} />
      <DateRangeFilter label="Invoice date" value={filters.range} onChange={(range) => update({ range })} />
      <FilterSelect placeholder="Sort" icon={<IconArrowsSort size={16} />} data={SORTS} value={filters.sort} clearable={false} allowDeselect={false} onChange={(sort) => update({ sort: sort || 'newest' })} />
    </FilterBar>
    <Group justify="space-between" gap="xs"><Text fw={700}>{total} {total === 1 ? 'invoice' : 'invoices'}</Text><Text size="sm" c="dimmed">{money(pendingTotal)} pending</Text></Group>
    <Paper {...listPaperProps(isMobile)}>{loading ? <Group justify="center" p="xl"><Loader /></Group> : !invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match these filters.</Text> : isMobile ? <CardList>{invoices.map((invoice) => (
      <InvoiceCard key={invoice.id} invoice={invoice} onOpen={() => setHistoryId(invoice.id)} />
    ))}</CardList> : <Table.ScrollContainer minWidth={1180}><Table striped highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th ta="right">Bill</Table.Th><Table.Th ta="right">Collected</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id} onClick={() => setHistoryId(invoice.id)} style={{ cursor: 'pointer' }} bg={historyId === invoice.id ? 'green.0' : undefined}>
      <Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.invoice_date)}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td><Table.Td>{invoice.mr_name || <Text span c="dimmed" size="sm">Unassigned</Text>}</Table.Td>
      <Table.Td ta="right">{money(invoice.total_amount)}</Table.Td><Table.Td ta="right">{money(invoice.paid_amount)}</Table.Td><Table.Td ta="right" fw={600} c={invoice.pending_amount ? 'red' : 'dimmed'}>{money(invoice.pending_amount)}</Table.Td>
      <Table.Td><StatusCell row={invoice} /></Table.Td>
      <Table.Td maw={200}><RecordedBy row={invoice} /></Table.Td>
      <Table.Td><Group justify="flex-end" wrap="nowrap">{recordButton(invoice)}</Group></Table.Td>
    </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="invoices" />
    </Paper>
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={reload} />
    {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
    <MarkUnpaidModal invoice={reversing} onClose={() => setReversing(null)} onSaved={reload} /> */}
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={reload} onRecord={setRecording} refreshKey={historyKey} actions={panelActions} />
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit invoice ${editing?.invoice_number || ''}`} centered zIndex={250}><form onSubmit={save}><Stack><TextInput required label="Invoice number" value={form?.invoice_number || ''} onChange={(event) => setForm({ ...form, invoice_number: event.currentTarget.value })} /><TextInput required type="date" label="Invoice date" value={form?.invoice_date || ''} onChange={(event) => setForm({ ...form, invoice_date: event.currentTarget.value })} /><TextInput required label="Customer" value={form?.customer_name || ''} onChange={(event) => setForm({ ...form, customer_name: event.currentTarget.value })} /><NumberInput required min={0.01} decimalScale={2} label="Bill amount (₹)" value={form?.total_amount || ''} onChange={(value) => setForm({ ...form, total_amount: value })} /><Select label="Payment mode" clearable data={PAYMENT_MODES} value={form?.payment_mode || null} onChange={(value) => setForm({ ...form, payment_mode: value || '' })} /><TextInput label="Remarks" value={form?.remarks || ''} onChange={(event) => setForm({ ...form, remarks: event.currentTarget.value })} /><Button type="submit" loading={busy}>Save changes</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete invoice" centered zIndex={250}><Stack><Alert color="red">Delete invoice {deleting?.invoice_number}? Its collection history will also be removed and balances will recalculate.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={remove}>Delete invoice</Button></Group></Stack></Modal>
  </Stack>;
}
