import { useEffect, useState } from 'react';
import { Alert, Button, FileInput, Group, Loader, Modal, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconFileSpreadsheet, IconPlus, IconSearch, IconUser } from '@tabler/icons-react';
import { FilterSelect } from '../../components/filters/FilterBar';
import { adminApi } from '../../api/adminApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import RowCard, { CardList } from '../../components/common/RowCard';
import { customersApi } from '../../api/customersApi';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import ManualInvoiceModal from './ManualInvoiceModal';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import EmptyResults from '../../components/common/EmptyResults';


export default function AdminImport() {
  const appRefresh = useAppRefresh(); // top-bar ⟳ / pull-to-refresh reloads this page in place
  const isMobile = useIsMobile();
  const [file, setFile] = useState(null); const [customers, setCustomers] = useState([]); const [customerTotal, setCustomerTotal] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [mrFilter, setMrFilter] = useState(''); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [customerLoading, setCustomerLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch((err) => { if (active) setError(err.detail || err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const data = await customersApi.getCustomers({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...(search.trim() && { search: search.trim() }), ...(mrFilter && { mr_id: mrFilter }), sort: 'assignment' });
        if (active) { setCustomers(data.items); setCustomerTotal(data.total); }
      } catch (err) { if (active) setError(err.detail || err.message); }
      finally { if (active) setCustomerLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [page, refresh, search, mrFilter, appRefresh]);


  const upload = async () => { if (!file) return; setBusy(true); setMessage(''); setError(''); try { const data = await adminApi.importInvoices(file); setResult(data); setMessage(`Import complete: ${data.created} added, ${data.updated || 0} updated.`); setFile(null); setRefresh((value) => value + 1); } catch (err) { setError(err.detail || err.message); } finally { setBusy(false); } };
  // Changing the MR moves every invoice of that customer, so it is confirmed
  // first (the dropdown used to save the moment it changed, including the "x").
  const [pendingMap, setPendingMap] = useState(null);
  const mrName = (id) => mrs.find((mr) => String(mr.id) === String(id))?.name;
  const askMap = (customer, value) => { if (String(value || '') !== String(customer.mr_id || '')) setPendingMap({ customer, value: value || null }); };
  const confirmMap = async () => { const { customer, value } = pendingMap; setPendingMap(null); await map(customer.id, value); };
  const map = async (customerId, value) => { try { await adminApi.mapCustomer(customerId, value ? Number(value) : null); setMessage('Customer assignment saved.'); setRefresh((count) => count + 1); } catch (err) { setError(err.detail || err.message); } };

  return <Stack gap="md"><Group justify="space-between"><Title order={1}>Import & mapping</Title><Button leftSection={<IconPlus size={16} />} onClick={() => setManualOpen(true)}>Add invoice</Button></Group>
    {error && <Alert color="red">{error}</Alert>}{message && <Alert color="green">{message}</Alert>}
    <Paper withBorder p="md"><Group align="end"><FileInput label="Tally sales book (.xls or .xlsx)" placeholder="Choose workbook" accept="application/vnd.ms-excel,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx" value={file} onChange={setFile} leftSection={<IconFileSpreadsheet size={16} />} flex={1} /><Button loading={busy} disabled={!file} onClick={upload}>Upload sales book</Button></Group>{result && <><Text size="sm" mt="md">Added: {result.created} · Updated: {result.updated || 0} · Repeated: {result.duplicates} · Conflicts: {(result.conflicts || []).length} · Row issues: {(result.row_errors || []).length}</Text>{(result.conflicts || []).length > 0 && <Alert color="yellow" mt="sm" title="Bill number conflicts"><Stack gap={4}>{result.conflicts.map((item, index) => <Text size="sm" key={`${item.invoice_number}-${index}`}>Row {item.row} · {item.invoice_number}: {item.message}</Text>)}</Stack></Alert>}{(result.row_errors || []).length > 0 && <Alert color="red" mt="sm" title="Rows not imported"><Stack gap={4}>{result.row_errors.map((item, index) => <Text size="sm" key={`${item.row}-${index}`}>Row {item.row}: {item.message}</Text>)}</Stack></Alert>}</>}</Paper>
    <Paper withBorder p="md"><Group justify="space-between" mb="md"><div><Title order={3}>Customer to MR assignment</Title><Text size="sm" c="dimmed">Changing an MR updates all invoices for that customer.</Text></div><Group gap="xs" wrap="wrap">{/* Same MR filter as Customers (with "Unassigned" = no MR). */}<FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} data={[...mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), { value: '0', label: 'Unassigned' }]} value={mrFilter} onChange={(value) => { setMrFilter(value || ''); setPage(1); }} /><TextInput placeholder="Search customers" leftSection={<IconSearch size={16} />} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} /></Group></Group>{customerLoading ? <Group justify="center" p="xl"><Loader /></Group> : !customers.length ? (search.trim() || mrFilter ? <EmptyResults search={search} noun="customers" onClear={() => { setSearch(''); setMrFilter(''); setPage(1); }} /> : <Text ta="center" c="dimmed" py="xl">No customers yet. They are added when you import a sales book or add an invoice.</Text>) : isMobile ? <CardList>{customers.map((customer) => (
      <RowCard
        key={customer.id}
        title={customer.name}
        subtitle={`${customer.type || 'No type'} · ${customer.invoice_count || 0} invoices`}
        details={[{ label: 'Assigned MR', full: true, value: <Select size="sm" clearable placeholder="Unassigned" aria-label={`Assign MR for ${customer.name}`} data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={customer.mr_id ? String(customer.mr_id) : null} onChange={(value) => askMap(customer, value)} /> }]}
      />
    ))}</CardList> : <Table.ScrollContainer minWidth={680}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Type</Table.Th><Table.Th>Invoices</Table.Th><Table.Th>Assigned MR</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{customers.map((customer) => <Table.Tr key={customer.id}><Table.Td fw={600}>{customer.name}</Table.Td><Table.Td>{customer.type || '—'}</Table.Td><Table.Td>{customer.invoice_count || 0}</Table.Td><Table.Td><Select size="xs" clearable placeholder="Unassigned" data={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} value={customer.mr_id ? String(customer.mr_id) : null} onChange={(value) => askMap(customer, value)} /></Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={customerTotal} page={page} onChange={setPage} searchActive={Boolean(search.trim())} label="customers" />
    </Paper>
    <ManualInvoiceModal opened={manualOpen} onClose={() => setManualOpen(false)} mrOptions={mrs.map((mr) => ({ value: String(mr.id), label: mr.name }))} onSaved={(text) => { setMessage(text); setRefresh((value) => value + 1); }} />
    <Modal opened={!!pendingMap} onClose={() => setPendingMap(null)} title="Change assigned MR" centered>
      {pendingMap && <Stack>
        <Text size="sm">
          {pendingMap.value
            ? <>Assign <b>{pendingMap.customer.name}</b> to <b>{mrName(pendingMap.value) || 'this MR'}</b>{pendingMap.customer.mr_id ? <> (currently {mrName(pendingMap.customer.mr_id) || 'another MR'})</> : null}?</>
            : <>Remove <b>{mrName(pendingMap.customer.mr_id) || 'the MR'}</b> from <b>{pendingMap.customer.name}</b>? The customer will be unassigned.</>}
        </Text>
        <Alert color="yellow" variant="light">This updates all {pendingMap.customer.invoice_count || 0} invoices of this customer.</Alert>
        <Group justify="end"><Button variant="default" onClick={() => setPendingMap(null)}>Cancel</Button><Button onClick={confirmMap}>{pendingMap.value ? 'Assign' : 'Unassign'}</Button></Group>
      </Stack>}
    </Modal>
  </Stack>;
}
