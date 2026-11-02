import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import { fetchMrOutstanding, recordPayment, resetPaymentStatus, setSearchQuery } from '../../store/slices/mrSlice';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

const modes = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other'];

export default function MrCollections() {
  const dispatch = useAppDispatch(); const { outstanding, outstandingCount, totalOutstanding, loading, paymentLoading, paymentSuccess, paymentError, searchQuery } = useAppSelector((state) => state.mr);
  const [page, setPage] = useState(1); const [active, setActive] = useState(null); const [amount, setAmount] = useState(0); const [mode, setMode] = useState('UPI'); const [reference, setReference] = useState(''); const [validation, setValidation] = useState('');

  useEffect(() => {
    let activeRequest = true;
    const timer = setTimeout(() => {
      if (activeRequest) dispatch(fetchMrOutstanding({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(searchQuery.trim() && { search: searchQuery.trim() }) }));
    }, searchQuery ? 250 : 0);
    return () => { activeRequest = false; clearTimeout(timer); };
  }, [dispatch, page, searchQuery]);

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
      else dispatch(fetchMrOutstanding({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(searchQuery.trim() && { search: searchQuery.trim() }) }));
    }
  };

  return <Stack gap="md"><div><Title order={1}>Collections</Title><Text c="dimmed">Select an outstanding invoice to record a payment.</Text></div><Paper withBorder p="md" bg="green.0"><Text size="sm" c="dimmed">Outstanding across your invoices</Text><Title order={2}>{money(totalOutstanding)}</Title></Paper>
    <Paper withBorder p="md"><Group justify="space-between" mb="md"><Title order={3}>Invoices to collect</Title><TextInput leftSection={<IconSearch size={16} />} placeholder="Search invoice or customer" value={searchQuery} onChange={(e) => { dispatch(setSearchQuery(e.currentTarget.value)); setPage(1); }} /></Group>
      {loading ? <Group justify="center" p="xl"><Loader /></Group> : !outstanding.length ? <Text c="dimmed" ta="center" py="xl">{searchQuery.trim() ? 'No invoices match this search.' : outstandingCount ? 'No invoices on this page.' : 'Nothing outstanding. All invoices are settled.'}</Text> : <Table.ScrollContainer minWidth={620}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{outstanding.map((item) => <Table.Tr key={item.invoice_id}><Table.Td fw={600}>{item.customer || 'Unnamed customer'}</Table.Td><Table.Td>{item.invoice_number}</Table.Td><Table.Td fw={700} c="red">{money(item.pending_amount)}</Table.Td><Table.Td><Badge color={item.status === 'PARTIAL' ? 'yellow' : 'red'}>{item.status}</Badge></Table.Td><Table.Td><Button size="xs" onClick={() => open(item)}>Record collection</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={outstandingCount} page={page} onChange={setPage} searchActive={Boolean(searchQuery.trim())} label="invoices" />
    </Paper>
    <Modal opened={!!active} onClose={() => setActive(null)} title={`Record payment · ${active?.invoice_number || ''}`} centered><form onSubmit={submit}><Stack><Paper withBorder p="sm"><Text size="xs" c="dimmed">Customer</Text><Text fw={600}>{active?.customer || '—'}</Text><Text size="xs" c="dimmed" mt="xs">Pending balance</Text><Text fw={700} c="red">{money(active?.pending_amount)}</Text></Paper>{validation && <Alert color="red">{validation}</Alert>}{paymentError && <Alert color="red">{paymentError}</Alert>}{paymentSuccess && <Alert color="green">Payment recorded successfully.</Alert>}<NumberInput label="Amount received (₹)" min={0.01} max={active?.pending_amount} decimalScale={2} required value={amount} onChange={setAmount} /><Select label="Payment mode" required data={modes} value={mode} onChange={(value) => setMode(value || 'UPI')} /><TextInput label="Reference / UTR / cheque number (optional)" value={reference} onChange={(e) => setReference(e.currentTarget.value)} /><Group justify="end"><Button variant="default" type="button" onClick={() => setActive(null)}>Cancel</Button><Button type="submit" loading={paymentLoading}>Save payment</Button></Group></Stack></form></Modal>
  </Stack>;
}
