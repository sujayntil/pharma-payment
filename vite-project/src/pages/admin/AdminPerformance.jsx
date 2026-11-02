import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, ScrollArea, Table, Text, TextInput, Title } from '@mantine/core';
import { adminApi } from '../../api/adminApi';
import { money } from '../../utils/formatters';

export default function AdminPerformance() {
  const [rows, setRows] = useState([]); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async (params = {}, initial = false) => { if (!initial) { setLoading(true); setError(''); } try { setRows(await adminApi.getMrPerformance(params)); } catch (err) { setError(err.detail || err.message); } finally { setLoading(false); } };
  useEffect(() => {
    let active = true;
    adminApi.getMrPerformance()
      .then((result) => { if (active) setRows(result); })
      .catch((err) => { if (active) setError(err.detail || err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const apply = () => load({ ...(from && { date_from: from }), ...(to && { date_to: to }) });
  return <div><Group justify="space-between" mb="md"><div><Title order={1}>MR performance</Title><Text c="dimmed">Sales, collections and pending balance by representative.</Text></div><Badge variant="light">{rows.length} MRs</Badge></Group><Paper withBorder p="md" mb="md"><Group align="end"><TextInput type="date" label="From invoice date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /><TextInput type="date" label="To invoice date" value={to} onChange={(e) => setTo(e.currentTarget.value)} /><Button onClick={apply}>Apply</Button><Button variant="subtle" onClick={() => { setFrom(''); setTo(''); load(); }}>All time</Button></Group></Paper><Paper withBorder p="md">{error && <Alert color="red">{error}</Alert>}{loading ? <Group justify="center" p="xl"><Loader /></Group> : !rows.length ? <Text c="dimmed" ta="center" py="xl">No performance records for this range.</Text> : <ScrollArea><Table miw={640} striped><Table.Thead><Table.Tr><Table.Th>Medical representative</Table.Th><Table.Th>Sales</Table.Th><Table.Th>Collected</Table.Th><Table.Th>Pending</Table.Th><Table.Th>Collection rate</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows.map((row) => { const rate = Number(row.sales) > 0 ? Math.round(Number(row.collected) / Number(row.sales) * 100) : 0; return <Table.Tr key={row.mr_id}><Table.Td fw={600}>{row.name}</Table.Td><Table.Td>{money(row.sales)}</Table.Td><Table.Td c="green" fw={700}>{money(row.collected)}</Table.Td><Table.Td c="red">{money(row.pending)}</Table.Td><Table.Td><Badge color={rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red'}>{rate}%</Badge></Table.Td></Table.Tr>; })}</Table.Tbody></Table></ScrollArea>}</Paper></div>;
}
