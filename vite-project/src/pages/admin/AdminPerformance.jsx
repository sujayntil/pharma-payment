import { useEffect, useState } from 'react';
import { Alert, Badge, Group, Loader, Paper, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { adminApi } from '../../api/adminApi';
import FilterBar from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { errorText, money } from '../../utils/formatters';

const rateOf = (row) => (Number(row.sales) > 0 ? Math.round(Number(row.collected) / Number(row.sales) * 100) : 0);
const RateBadge = ({ rate }) => <Badge color={rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red'}>{rate}%</Badge>;

export default function AdminPerformance() {
  const [rows, setRows] = useState([]); const [range, setRange] = useState(EMPTY_RANGE); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const isMobile = useIsMobile();

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await adminApi.getMrPerformance({ ...(range.from && { date_from: range.from }), ...(range.to && { date_to: range.to }) });
        if (active) setRows(result);
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [range]);

  const rangeLabel = describeRange(range);
  return <Stack gap="md"><Group justify="space-between" align="end"><div><Title order={1}>MR performance</Title><Text c="dimmed">Sales, collections and pending balance by representative.</Text></div><Badge variant="light" size="lg">{rows.length} MRs</Badge></Group>
    <FilterBar chips={[rangeLabel && { key: 'range', label: `Invoice date: ${rangeLabel}`, onRemove: () => setRange(EMPTY_RANGE) }]} summary={rangeLabel ? null : 'Showing all time'}>
      <DateRangeFilter label="Invoice date" value={range} onChange={setRange} allLabel="All time" />
    </FilterBar>
    {error && <Alert color="red">{error}</Alert>}
    <Paper {...listPaperProps(isMobile)}>{loading ? <Group justify="center" p="xl"><Loader /></Group> : !rows.length ? <Text c="dimmed" ta="center" py="xl">No performance records for this range.</Text> : isMobile ? <CardList>{rows.map((row) => (
      <RowCard
        key={row.mr_id}
        title={row.name}
        amount={money(row.collected)}
        amountLabel="collected"
        amountColor="green"
        badges={<RateBadge rate={rateOf(row)} />}
        details={[{ label: 'Sales', value: money(row.sales) }, { label: 'Pending', value: <Text span c="red" size="sm">{money(row.pending)}</Text> }]}
      />
    ))}</CardList> : <ScrollArea><Table miw={640} striped verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Medical representative</Table.Th><Table.Th ta="right">Sales</Table.Th><Table.Th ta="right">Collected</Table.Th><Table.Th ta="right">Pending</Table.Th><Table.Th>Collection rate</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{rows.map((row) => <Table.Tr key={row.mr_id}><Table.Td fw={600}>{row.name}</Table.Td><Table.Td ta="right">{money(row.sales)}</Table.Td><Table.Td ta="right" c="green" fw={700}>{money(row.collected)}</Table.Td><Table.Td ta="right" c="red">{money(row.pending)}</Table.Td><Table.Td><RateBadge rate={rateOf(row)} /></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>}</Paper>
  </Stack>;
}
