import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchMrOutstanding, recordPayment, resetPaymentStatus, setSearchQuery } from '../../store/slices/mrSlice';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other'];
const outstandingParams = (page, search, filters) => ({
  limit: PAGE_SIZE,
  offset: (page - 1) * PAGE_SIZE,
  ...(search.trim() && { search: search.trim() }),
  ...filters,
});

export default function MrCollections() {
  const dispatch = useAppDispatch(); const { outstanding, outstandingCount, totalOutstanding, loading, paymentLoading, paymentSuccess, paymentError, searchQuery } = useAppSelector((state) => state.mr);
  const [page, setPage] = useState(1); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState(''); const [sortOrder, setSortOrder] = useState('newest'); const [appliedFilters, setAppliedFilters] = useState({ sort_order: 'newest' }); const [filterError, setFilterError] = useState(''); const [active, setActive] = useState(null); const [amount, setAmount] = useState(0); const [mode, setMode] = useState('UPI'); const [reference, setReference] = useState(''); const [validation, setValidation] = useState('');

  useEffect(() => {
    let activeRequest = true;
    const timer = setTimeout(() => {
      if (activeRequest) dispatch(fetchMrOutstanding(outstandingParams(page, searchQuery, appliedFilters)));
    }, searchQuery ? 250 : 0);
    return () => { activeRequest = false; clearTimeout(timer); };
  }, [appliedFilters, dispatch, page, searchQuery]);

  const open = (invoice) => { setActive(invoice); setAmount(invoice.pending_amount); setMode('UPI'); setReference(''); setValidation(''); dispatch(resetPaymentStatus()); };
  const submit = async (event) => {
    event.preventDefault();
    if (!active || !amount || amount <= 0 || amount > active.pending_amount) { setValidation(`Enter an amount up to ${money(active?.pending_amount)}.`); return; }
    setValidation('');
    const action = await dispatch(recordPayment({ invoice_id: active.invoice_id, amount, mode: mode || null, transaction_reference: reference.trim() || null }));
    if (recordPayment.fulfilled.match(action)) {
      notifications.show({ color: 'green', title: 'Collection recorded', message: `${money(amount)} received for ${active.invoice_number}.` });
      setActive(null);
      const settlesInvoice = amount >= active.pending_amount - 0.01;
      const nextPage = Math.min(page, Math.max(1, Math.ceil((outstandingCount - Number(settlesInvoice)) / PAGE_SIZE)));
      if (nextPage !== page) setPage(nextPage);
      else dispatch(fetchMrOutstanding(outstandingParams(page, searchQuery, appliedFilters)));
    }
  };
  const applyFilters = () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setFilterError('From date must be on or before To date.');
      return;
    }
    setFilterError('');
    setPage(1);
    setAppliedFilters({ ...(dateFrom && { date_from: dateFrom }), ...(dateTo && { date_to: dateTo }), sort_order: sortOrder });
  };
  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setSortOrder('newest'); setPage(1);
    setFilterError('');
    setAppliedFilters({ sort_order: 'newest' });
    dispatch(setSearchQuery(''));
  };
  const hasDateFilter = Boolean(appliedFilters.date_from || appliedFilters.date_to);

  return <Stack gap="md"><div><Title order={1}>Collections</Title><Text c="dimmed">Select an outstanding invoice to record a payment.</Text></div><Paper withBorder p="md" bg="green.0"><Text size="sm" c="dimmed">Outstanding across your invoices</Text><Title order={2}>{money(totalOutstanding)}</Title></Paper>
    <Paper withBorder p="md"><Group justify="space-between" mb="md"><Title order={3}>Invoices to collect</Title></Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" verticalSpacing="sm" mb="md">
        <TextInput type="date" label="From invoice date" value={dateFrom} onChange={(event) => setDateFrom(event.currentTarget.value)} />
        <TextInput type="date" label="To invoice date" value={dateTo} onChange={(event) => setDateTo(event.currentTarget.value)} />
        <Select label="Sort by invoice date" data={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} value={sortOrder} onChange={(value) => setSortOrder(value || 'newest')} />
        <Group align="end" grow><Button onClick={applyFilters}>Apply</Button><Button variant="subtle" onClick={clearFilters}>Clear</Button></Group>
      </SimpleGrid>
      {filterError && <Alert color="red" mb="md">{filterError}</Alert>}
      <TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search invoice or customer" value={searchQuery} onChange={(event) => { dispatch(setSearchQuery(event.currentTarget.value)); setPage(1); }} />
      {loading ? <Group justify="center" p="xl"><Loader /></Group> : !outstanding.length ? <Text c="dimmed" ta="center" py="xl">{searchQuery.trim() || hasDateFilter ? 'No invoices match these filters.' : outstandingCount ? 'No invoices on this page.' : 'Nothing outstanding. All invoices are settled.'}</Text> : <Table.ScrollContainer minWidth={700}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{outstanding.map((item) => <Table.Tr key={item.invoice_id}><Table.Td fw={600}>{item.customer || 'Unnamed customer'}</Table.Td><Table.Td>{item.invoice_number}</Table.Td><Table.Td>{item.invoice_date || '—'}</Table.Td><Table.Td fw={700} c="red">{money(item.pending_amount)}</Table.Td><Table.Td><Badge color={item.status === 'PARTIAL' ? 'yellow' : 'red'}>{item.status}</Badge></Table.Td><Table.Td><Button size="xs" onClick={() => open(item)}>Record collection</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={outstandingCount} page={page} onChange={setPage} searchActive={Boolean(searchQuery.trim())} label="invoices" />
    </Paper>
    <Modal opened={!!active} onClose={() => setActive(null)} title={`Record payment · ${active?.invoice_number || ''}`} centered><form onSubmit={submit}><Stack><Paper withBorder p="sm"><Text size="xs" c="dimmed">Customer</Text><Text fw={600}>{active?.customer || '—'}</Text><Text size="xs" c="dimmed" mt="xs">Pending balance</Text><Text fw={700} c="red">{money(active?.pending_amount)}</Text></Paper>{validation && <Alert color="red">{validation}</Alert>}{paymentError && <Alert color="red">{paymentError}</Alert>}{paymentSuccess && <Alert color="green">Payment recorded successfully.</Alert>}<NumberInput label="Amount received (₹)" min={0.01} max={active?.pending_amount} decimalScale={2} required value={amount} onChange={setAmount} /><Select label="Payment mode" required data={modes} value={mode} onChange={(value) => setMode(value || 'UPI')} /><TextInput label="Reference / UTR / cheque number (optional)" value={reference} onChange={(e) => setReference(e.currentTarget.value)} /><Group justify="end"><Button variant="default" type="button" onClick={() => setActive(null)}>Cancel</Button><Button type="submit" loading={paymentLoading}>Save payment</Button></Group></Stack></form></Modal>
  </Stack>;
}
