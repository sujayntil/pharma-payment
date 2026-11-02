import { useEffect, useState } from 'react';
import { Alert, Badge, Drawer, Group, Loader, Paper, ScrollArea, SimpleGrid, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { customersApi } from '../../api/customersApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import { money } from '../../utils/formatters';

export default function MrCustomers() {
  const [customers, setCustomers] = useState([]); const [total, setTotal] = useState(0); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null); const [ledger, setLedger] = useState(null); const [ledgerSearch, setLedgerSearch] = useState(''); const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(true); const [ledgerLoading, setLedgerLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await customersApi.getMyCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(search.trim() && { search: search.trim() }) });
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
  return <div><Group justify="space-between" mb="md"><div><Title order={1}>My customers</Title><Text c="dimmed">Customers assigned to you, with invoice and pending totals.</Text></div><Badge size="lg" variant="light">{total} customers</Badge></Group>
    <Paper withBorder p="md"><TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search customer, type, phone" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} />{error && <Alert color="red" mb="md">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? <Text c="dimmed" ta="center" py="xl">{search ? 'No customers match your search.' : 'No customers are assigned to you yet.'}</Text> : <ScrollArea><Table highlightOnHover miw={680}><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Invoices</Table.Th><Table.Th>Total billed</Table.Th><Table.Th>Outstanding</Table.Th><Table.Th>Last invoice</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id} onClick={() => openLedger(customer)} style={{ cursor: 'pointer' }}><Table.Td fw={600}>{customer.name}<Text size="xs" c="dimmed">{customer.phone || ''}</Text></Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.invoice_count}</Table.Td><Table.Td>{money(customer.total_invoiced)}</Table.Td><Table.Td fw={700} c={customer.outstanding ? 'red' : 'green'}>{money(customer.outstanding)}</Table.Td><Table.Td>{customer.latest_invoice_date || '—'}</Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}
      <ListPagination total={total} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="customers" />
    </Paper>
    <Drawer opened={!!selected} onClose={() => setSelected(null)} position="right" size="min(720px, 100%)" title={selected?.name}>
      {ledger && <><SimpleGrid cols={{ base: 1, sm: 3 }} mb="md"><Paper withBorder p="sm"><Text size="xs" c="dimmed">Invoiced</Text><Text fw={700}>{money(ledger.total_invoiced)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Collected</Text><Text fw={700}>{money(ledger.total_paid)}</Text></Paper><Paper withBorder p="sm"><Text size="xs" c="dimmed">Outstanding</Text><Text fw={700} c="red">{money(ledger.outstanding)}</Text></Paper></SimpleGrid><TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder="Search this customer's invoices" value={ledgerSearch} onChange={(event) => { setLedgerSearch(event.currentTarget.value); setLedgerPage(1); }} />{error && <Alert color="red" mb="md">{error}</Alert>}</>}
      {ledgerLoading || !ledger ? <Group justify="center" p="xl"><Loader /></Group> : !ledger.invoices.length ? <Text ta="center" c="dimmed" py="xl">No invoices match this search.</Text> : <><ScrollArea><Table miw={560}><Table.Thead><Table.Tr><Table.Th>Invoice</Table.Th><Table.Th>Date</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{ledger.invoices.map((invoice) => <Table.Tr key={invoice.invoice_id}><Table.Td>{invoice.invoice_number}</Table.Td><Table.Td>{invoice.date || '—'}</Table.Td><Table.Td>{money(invoice.amount)}</Table.Td><Table.Td>{invoice.mode || '—'}</Table.Td><Table.Td><Badge color={invoice.status === 'PAID' ? 'green' : invoice.status === 'PARTIAL' ? 'yellow' : 'red'}>{invoice.status}</Badge></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea><ListPagination total={ledger.invoice_count} page={ledgerPage} onChange={setLedgerPage} searchActive={Boolean(ledgerSearch.trim())} label="invoices" /></>}
    </Drawer>
  </div>;
}
