import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Group, Loader, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
// Disabled (MR edit/delete invoice): Button, Menu, Modal, NumberInput, Select, TextInput, IconDots, IconEdit, IconTrash.
import { useDebouncedValue } from '@mantine/hooks';
import { IconHistory } from '@tabler/icons-react';
import { invoicesApi } from '../../api/invoicesApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import FilterBar from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import StatusTabs from '../../components/filters/StatusTabs';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
// Disabled (MR edit invoice): import { PAYMENT_MODES } from '../../components/collections/collectionUtils';
import { RecordedBy, StatusCell } from '../../components/collections/CollectionBadges';
import { errorText, money, shortDate } from '../../utils/formatters';

// Disabled (MR edit invoice): const blank ={ invoice_number: '', invoice_date: '', customer_name: '', total_amount: '', payment_mode: '', remarks: '' };

export default function MrInvoices() {
  const [invoices, setInvoices] = useState([]); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [range, setRange] = useState(EMPTY_RANGE); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  // Disabled (MR edit/delete invoice): const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const isMobile = useIsMobile();
  // Disabled (MR edit/delete invoice): const [editing, setEditing] = useState(null); const [form, setForm] = useState(blank); const [deleting, setDeleting] = useState(null); const [busy, setBusy] = useState(false);
  const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await invoicesApi.getMyInvoices({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(range.from && { date_from: range.from }),
          ...(range.to && { date_to: range.to }),
          ...(status && { status }),
        });
        if (active) { setInvoices(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [range, status, page, debouncedSearch]);

  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setRange(EMPTY_RANGE); setStatus(''); setSearch(''); setPage(1); };
  const rangeLabel = describeRange(range);
  // View-only history icon. Edit/Delete were removed for MRs, so the old
  // "..." menu (history, edit, delete) is replaced by this single icon.
  const historyIcon = (invoice) => (
    <Tooltip label="Invoice history" withArrow>
      <ActionIcon variant="light" color="gray" size="lg" aria-label={`History for ${invoice.invoice_number}`} onClick={() => setHistoryId(invoice.id)}><IconHistory size={18} /></ActionIcon>
    </Tooltip>
  );
  /* Disabled (MR edit/delete invoice). Re-enable if needed:
  const rowMenu = (invoice) => (
    <Menu position="bottom-end" shadow="md" withinPortal>
          <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${invoice.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconHistory size={15} />} onClick={() => setHistoryId(invoice.id)}>Collection history</Menu.Item>
            <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => openEdit(invoice)}>Edit invoice</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => setDeleting(invoice)}>Delete invoice</Menu.Item>
          </Menu.Dropdown>
        </Menu>
  );
  */
  const chips = [
    status && { key: 'status', label: `Status: ${status.toLowerCase()}`, onRemove: () => { setStatus(''); setPage(1); } },
    rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => { setRange(EMPTY_RANGE); setPage(1); } },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  /* Disabled (MR edit/delete invoice). Re-enable if needed:
  const openEdit = (invoice) => { setEditing(invoice); setForm({ invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date || '', customer_name: invoice.customer_name || '', total_amount: invoice.total_amount, payment_mode: invoice.payment_mode || '', remarks: invoice.remarks || '' }); };
  const save = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await invoicesApi.updateInvoice(editing.id, { ...form, total_amount: Number(form.total_amount) }); setEditing(null); setRefresh((value) => value + 1); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };
  const remove = async () => { setBusy(true); setError(''); try { await invoicesApi.deleteInvoice(deleting.id); setDeleting(null); setRefresh((value) => value + 1); } catch (err) { setError(errorText(err)); } finally { setBusy(false); } };
  */

  return <Stack gap="md"><div><Title order={1}>My invoices</Title><Text c="dimmed">Invoices assigned to you, with payment status and balance.</Text></div>
    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search by invoice number or customer" chips={chips} onReset={reset}>
      <StatusTabs value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
      <DateRangeFilter label="Invoice date" value={range} onChange={(next) => { setRange(next); setPage(1); }} />
    </FilterBar>
    {error && <Alert color="red" onClose={() => setError('')} withCloseButton>{error}</Alert>}
    <Paper {...listPaperProps(isMobile)}>{loading ? <Group justify="center" p="xl"><Loader /></Group> : !invoices.length ? <Text c="dimmed" ta="center" py="xl">No invoices match these filters.</Text> : isMobile ? <CardList>{invoices.map((invoice) => (
      <RowCard
        key={invoice.id}
        title={invoice.customer_name || '—'}
        subtitle={`${invoice.invoice_number} · ${shortDate(invoice.invoice_date)}`}
        amount={money(invoice.pending_amount)}
        amountLabel="pending"
        amountColor={invoice.pending_amount ? 'red' : 'green'}
        badges={<StatusCell row={invoice} />}
        details={[{ label: 'Bill amount', value: money(invoice.total_amount) }, { label: 'Collected', value: money(invoice.paid_amount) }, { label: 'Recorded by', value: <RecordedBy row={invoice} />, full: true }]}
        actions={historyIcon(invoice)}
      />
    ))}</CardList> : <Table.ScrollContainer minWidth={1040}><Table striped highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Customer</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th ta="right">Collected</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{invoices.map((invoice) => <Table.Tr key={invoice.id}>
      <Table.Td fw={600}>{invoice.invoice_number}</Table.Td><Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(invoice.invoice_date)}</Table.Td><Table.Td>{invoice.customer_name || '—'}</Table.Td>
      <Table.Td ta="right">{money(invoice.total_amount)}</Table.Td><Table.Td ta="right">{money(invoice.paid_amount)}</Table.Td><Table.Td ta="right" fw={600} c={invoice.pending_amount ? 'red' : 'green'}>{money(invoice.pending_amount)}</Table.Td>
      <Table.Td><StatusCell row={invoice} /></Table.Td>
      <Table.Td maw={200}><RecordedBy row={invoice} /></Table.Td>
      <Table.Td>{historyIcon(invoice)}</Table.Td>
    </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="invoices" />
    </Paper>
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} />
    {/* Disabled (MR edit/delete invoice). Re-enable if needed:
    <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Edit invoice ${editing?.invoice_number || ''}`} centered><form onSubmit={save}><Stack><TextInput label="Invoice number" required value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.currentTarget.value })} /><TextInput type="date" label="Invoice date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.currentTarget.value })} /><TextInput label="Customer" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.currentTarget.value })} /><NumberInput label="Total amount (₹)" min={0.01} decimalScale={2} required value={form.total_amount} onChange={(value) => setForm({ ...form, total_amount: value })} /><Select label="Payment mode" clearable data={PAYMENT_MODES} value={form.payment_mode || null} onChange={(value) => setForm({ ...form, payment_mode: value || '' })} /><TextInput label="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.currentTarget.value })} /><Button type="submit" loading={busy}>Save changes</Button></Stack></form></Modal>
    <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete invoice" centered><Stack><Alert color="red">This removes invoice {deleting?.invoice_number} and its payment history.</Alert><Group justify="end"><Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button><Button color="red" loading={busy} onClick={remove}>Delete permanently</Button></Group></Stack></Modal>
    */}
  </Stack>;
}
