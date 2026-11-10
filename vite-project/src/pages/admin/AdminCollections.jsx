import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Loader, Menu, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowBackUp, IconCash, IconDots, IconDownload, /* IconHistory, */ IconUser, IconUserShield, IconWallet } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import StatCard from '../../components/common/StatCard';
import ListPagination, { PAGE_SIZE } from '../../components/common/ListPagination';
import RowCard, { CardList } from '../../components/common/RowCard';
import { listPaperProps, reloadingStyle } from '../../components/common/listPaper';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSidePanelSpace } from '../../hooks/useSidePanelSpace';
import FilterBar, { FilterSelect } from '../../components/filters/FilterBar';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../../components/filters/dateRanges';
import RecordCollectionModal from '../../components/collections/RecordCollectionModal';
// Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
// import MarkUnpaidModal from '../../components/collections/MarkUnpaidModal';
import InvoiceHistory from '../../components/collections/InvoiceHistory';
import ReversePaymentModal from '../../components/collections/ReversePaymentModal';
import { PAYMENT_MODES } from '../../components/collections/collectionUtils';
import { RecordedBy, StatusBadge } from '../../components/collections/CollectionBadges';
import { dateTime, downloadErrorText, errorText, money, saveDownload } from '../../utils/formatters';

const BLANK = { range: EMPTY_RANGE, mrId: '', mode: '', recordedBy: '', entryType: '' };
const RECORDED_BY = [{ value: 'MR', label: 'By MR' }, { value: 'ADMIN', label: 'By Admin' }];
const ENTRY_TYPES = [{ value: 'collection', label: 'Collections only' }, { value: 'reversal', label: 'Reversals only' }];

export default function AdminCollections() {
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [count, setCount] = useState(0); const [mrs, setMrs] = useState([]);
  const [search, setSearch] = useState(''); const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState(BLANK); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const isMobile = useIsMobile();
  const [recording, setRecording] = useState(null); /* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed: const [reversing, setReversing] = useState(null); */ const [reversingPayment, setReversingPayment] = useState(null); const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    let active = true;
    adminApi.getUsers().then((users) => { if (active) setMrs(users.filter((user) => user.role === 'MR')); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await adminApi.getCollections({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(filters.range.from && { date_from: filters.range.from }),
          ...(filters.range.to && { date_to: filters.range.to }),
          ...(filters.mrId && { mr_id: filters.mrId }),
          ...(filters.mode && { mode: filters.mode }),
          ...(filters.recordedBy && { recorded_by: filters.recordedBy }),
          ...(filters.entryType && { entry_type: filters.entryType }),
        });
        if (active) { setRows(result.rows); setTotal(result.total_amount); setCount(result.total_count); }
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [debouncedSearch, filters, page, refresh]);

  // Export: every ledger entry matching the current filters and search (not just this page).
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true); setError('');
    try {
      saveDownload(await adminApi.exportCollections({
        ...(search.trim() && { search: search.trim() }),
        ...(filters.range.from && { date_from: filters.range.from }),
        ...(filters.range.to && { date_to: filters.range.to }),
        ...(filters.mrId && { mr_id: filters.mrId }),
        ...(filters.mode && { mode: filters.mode }),
        ...(filters.recordedBy && { recorded_by: filters.recordedBy }),
        ...(filters.entryType && { entry_type: filters.entryType }),
      }), 'collections.xlsx');
    } catch (err) { setError(await downloadErrorText(err)); }
    finally { setExporting(false); }
  };

  const update = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const onSearch = (value) => { setSearch(value); setPage(1); };
  const reset = () => { setFilters(BLANK); setSearch(''); setPage(1); };
  const reload = () => setRefresh((value) => value + 1);
  const panelSpace = useSidePanelSpace(Boolean(historyId));
  const mrOptions = useMemo(() => mrs.map((mr) => ({ value: String(mr.id), label: mr.name })), [mrs]);
  const rangeLabel = describeRange(filters.range);
  const rowActions = (row) => (
    <Group gap={4} wrap="nowrap" justify="flex-end" onClick={(event) => event.stopPropagation()}>
          {row.pending_amount > 0 && <Button size="xs" variant="light" leftSection={<IconCash size={14} />} onClick={() => setRecording(row)}>Record</Button>}
          {!row.is_reversal && row.amount > 0 && !row.fully_reversed && Number(row.paid_amount) > 0 && <Menu position="bottom-end" shadow="md" withinPortal>
            <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${row.invoice_number}`}><IconDots size={16} /></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              {/* Replaced by clicking the row (opens the invoice panel):
              <Menu.Item leftSection={<IconHistory size={15} />} onClick={() => setHistoryId(row.invoice_id)}>Invoice history</Menu.Item> */}
              {!row.is_reversal && row.amount > 0 && !row.fully_reversed && Number(row.paid_amount) > 0 && <Menu.Item color="red" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversingPayment(row)}>Reverse payment</Menu.Item>}
              {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
              {row.paid_amount > 0 && <Menu.Item color="red" leftSection={<IconArrowBackUp size={15} />} onClick={() => setReversing(row)}>Mark invoice unpaid</Menu.Item>} */}
            </Menu.Dropdown>
          </Menu>}
        </Group>
  );

  const chips = [
    rangeLabel && { key: 'range', label: `Collected: ${rangeLabel}`, onRemove: () => update({ range: EMPTY_RANGE }) },
    filters.mrId && { key: 'mr', label: `MR: ${mrOptions.find((o) => o.value === filters.mrId)?.label || '—'}`, onRemove: () => update({ mrId: '' }) },
    filters.mode && { key: 'mode', label: `Mode: ${filters.mode}`, onRemove: () => update({ mode: '' }) },
    filters.recordedBy && { key: 'by', label: `Recorded ${RECORDED_BY.find((o) => o.value === filters.recordedBy)?.label.toLowerCase()}`, onRemove: () => update({ recordedBy: '' }) },
    filters.entryType && { key: 'type', label: ENTRY_TYPES.find((o) => o.value === filters.entryType)?.label, onRemove: () => update({ entryType: '' }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  return <Stack gap="md" style={panelSpace}>
    <div><Title order={1}>Collections</Title><Text c="dimmed">Every payment and reversal in the ledger, newest first. Click an entry to open its invoice.</Text></div>

    <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Search invoice, customer, MR…" chips={chips} onReset={reset} moreActive={[filters.mrId, filters.mode, filters.recordedBy, filters.entryType].filter(Boolean).length} more={<>
      <FilterSelect placeholder="All MRs" icon={<IconUser size={16} />} searchable data={mrOptions} value={filters.mrId} onChange={(mrId) => update({ mrId })} />
        <FilterSelect placeholder="All modes" icon={<IconWallet size={16} />} data={[...PAYMENT_MODES, 'Admin adjustment', 'Reversal']} value={filters.mode} onChange={(mode) => update({ mode })} />
        <FilterSelect placeholder="Recorded by anyone" icon={<IconUserShield size={16} />} data={RECORDED_BY} value={filters.recordedBy} onChange={(recordedBy) => update({ recordedBy })} />
        <FilterSelect placeholder="All entries" data={ENTRY_TYPES} value={filters.entryType} onChange={(entryType) => update({ entryType })} />
    </>}>
      <DateRangeFilter label="Collected" value={filters.range} onChange={(range) => update({ range })} />
    </FilterBar>

    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
      <StatCard label={`Net collected${rangeLabel ? ` · ${rangeLabel}` : ''}`} hint="Collections minus reversals" value={money(total)} bg="green.0" />
      <StatCard label="Ledger entries" value={count} />
    </SimpleGrid>

    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    <Group justify="space-between" gap="xs"><Text fw={700}>{count} {count === 1 ? 'entry' : 'entries'}</Text><Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exporting} disabled={!count} onClick={exportExcel}>Export</Button></Group>
    <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && rows.length > 0)}>{loading && !rows.length ? <Group justify="center" p="xl"><Loader /></Group> : !rows.length ? <Text ta="center" c="dimmed" py="xl">No collections match these filters.</Text> : isMobile ? <CardList>{rows.map((row) => (
      <RowCard
        key={row.payment_id}
        onClick={() => setHistoryId(row.invoice_id)}
        title={`${row.invoice_number} · ${row.customer_name || '—'}`}
        subtitle={dateTime(row.payment_date)}
        amount={`${row.is_reversal ? '−' : ''}${money(Math.abs(row.amount))}`}
        amountColor={row.is_reversal ? 'orange.8' : undefined}
        highlight={row.is_reversal ? 'orange.0' : undefined}
        badges={<><Badge variant="light" color={row.is_reversal ? 'orange' : 'gray'}>{row.mode || '—'}</Badge><StatusBadge status={row.invoice_status} /></>}
        details={[
          { label: 'Assigned MR', value: row.mr_name || 'Unassigned' },
          { label: 'Recorded by', value: <RecordedBy row={row} /> },
          row.transaction_reference && { label: 'Reference', value: row.transaction_reference, full: true },
        ]}
        actions={rowActions(row)}
      />
    ))}</CardList> : <Table.ScrollContainer minWidth={1200}><Table className="pin-last" striped highlightOnHover verticalSpacing="sm"><Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Invoice</Table.Th><Table.Th>Customer</Table.Th><Table.Th>Assigned MR</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Recorded by</Table.Th><Table.Th>Invoice status</Table.Th><Table.Th /></Table.Tr></Table.Thead><Table.Tbody>{rows.map((row) => <Table.Tr key={row.payment_id} onClick={() => setHistoryId(row.invoice_id)} style={{ cursor: 'pointer' }} bg={historyId === row.invoice_id ? 'green.0' : undefined} data-selected={historyId === row.invoice_id || undefined}>
      <Table.Td style={{ whiteSpace: 'nowrap' }}>{dateTime(row.payment_date)}</Table.Td>
      <Table.Td fw={600}>{row.invoice_number}</Table.Td>
      <Table.Td>{row.customer_name || '—'}</Table.Td>
      <Table.Td>{row.mr_name || <Text span c="dimmed" size="sm">Unassigned</Text>}</Table.Td>
      <Table.Td ta="right" fw={700} c={row.is_reversal ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{row.is_reversal ? '−' : ''}{money(Math.abs(row.amount))}</Table.Td>
      <Table.Td><Badge variant="light" color={row.is_reversal ? 'orange' : 'gray'}>{row.mode || '—'}</Badge>{row.transaction_reference && <Text size="xs" c="dimmed" lineClamp={1} maw={180} title={row.transaction_reference}>{row.transaction_reference}</Text>}</Table.Td>
      <Table.Td><RecordedBy row={row} /></Table.Td>
      <Table.Td><StatusBadge status={row.invoice_status} /></Table.Td>
      <Table.Td>{rowActions(row)}</Table.Td>
    </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>}
      <ListPagination total={count} page={page} onChange={setPage} searchActive={Boolean(debouncedSearch.trim())} label="entries" />
    </Paper>
    <RecordCollectionModal invoice={recording} onClose={() => setRecording(null)} onSaved={reload} />
    {/* Disabled: Mark unpaid (use Reverse payment per collection). Re-enable if needed:
    <MarkUnpaidModal invoice={reversing} onClose={() => setReversing(null)} onSaved={reload} /> */}
    <ReversePaymentModal payment={reversingPayment} onClose={() => setReversingPayment(null)} onSaved={reload} />
    <InvoiceHistory invoiceId={historyId} onClose={() => setHistoryId(null)} onChanged={reload} onRecord={setRecording} refreshKey={refresh} />
  </Stack>;
}
