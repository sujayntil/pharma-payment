import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Drawer, Group, Loader, Paper, ScrollArea, SimpleGrid, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null); const [ledger, setLedger] = useState(null); const [ledgerSearch, setLedgerSearch] = useState(''); const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(search.trim() && { search: search.trim() }) });
        if (active) { setCustomers(result.items); setTotal(result.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [page, search]);

  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setLedgerLoading(true); setError('');
      try {
        const result = await customersApi.getCustomerLedger(selected.id, { limit: PAGE_SIZE, offset: (ledgerPage - 1) * PAGE_SIZE, ...(ledgerSearch.trim() && { search: ledgerSearch.trim() }) });
        if (active) setLedger(result);
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setLedgerLoading(false); }
    }, ledgerSearch ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [ledgerPage, ledgerSearch, selected]);

  const openLedger = (customer) => { setSelected(customer); setLedger(null); setLedgerSearch(''); setLedgerPage(1); };
  return <div><Group justify="space-between" mb="md"><div><Title order={1}>Customers</Title><Text c="dimmed">Browse customer records and open their invoice ledgers.</Text></div><Badge variant="light" size="lg">{total} customers</Badge></Group>
    <Paper withBorder p="md"><TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search by name, type or phone" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} />{error && <Alert color="red" mb="md">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? <Text ta="center" c="dimmed" py="xl">No customers match your search.</Text> : <ScrollArea><Table miw={650} highlightOnHover><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Phone</Table.Th><Table.Th>MR</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id}><Table.Td fw={600}>{customer.name}</Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.phone || '—'}</Table.Td><Table.Td>{customer.mr_name || '—'}</Table.Td><Table.Td><Button size="xs" variant="light" onClick={() => openLedger(customer)}>View ledger</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(720px, 100%)" title={`Ledger — ${selected?.name || ''}`}>
      {ledger && <><SimpleGrid cols={{ base: 1, sm: 3 }} mb="md"><Paper withBorder p="sm"><Text size="xs" c="dimmed">Total invoiced</Text><Text fw={700}>{money(ledger.total_invoiced)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Total paid</Text><Text fw={700}>{money(ledger.total_paid)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Outstanding</Text><Text fw={700} c="red">{money(ledger.outstanding)}</Text></Paper></SimpleGrid><TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search this customer's invoices" value={ledgerSearch} onChange={(event) => { setLedgerSearch(event.currentTarget.value); setLedgerPage(1); }} />{error && <Alert color="red" mb="md">{error}</Alert>}</>}
      {ledgerLoading || !ledger ? <Group justify="center" p="xl"><Loader /></Group> : !ledger.invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match this search.</Text> : <><ScrollArea><Table miw={560}><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>MR</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id}><Table.Td>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.date || '—'}</Table.Td><Table.Td>{invoice.mr || '—'}</Table.Td><Table.Td>{money(invoice.amount)}</Table.Td><Table.Td>{invoice.mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea><ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(ledgerSearch.trim())} label="invoices" /></>}
    </Drawer>
  </div>;
}
