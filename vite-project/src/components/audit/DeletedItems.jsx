import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconDownload, IconFileInvoice, IconUser, IconUsers, IconCashOff } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import EmptyResults from '../common/EmptyResults';
import SidePanel from '../common/SidePanel';
import ListPagination, { PAGE_SIZE } from '../common/ListPagination';
import { listPaperProps, reloadingStyle } from '../common/listPaper';
import StatCard from '../common/StatCard';
import DateRangeFilter from '../filters/DateRangeFilter';
import { describeRange, EMPTY_RANGE } from '../filters/dateRanges';
import FilterBar, { FilterSelect } from '../filters/FilterBar';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useBackClose } from '../../hooks/useBackClose';
import { dateTime, downloadErrorText, errorText, money, saveDownload, shortDate, timeOf } from '../../utils/formatters';

const istDay = (at) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const KINDS = [
  { value: 'invoice', label: 'Invoices' },
  { value: 'customer', label: 'Customers' },
  { value: 'user', label: 'Users' },
  { value: 'undone', label: 'Undone collections' },
];
const KIND_INFO = {
  invoice: { label: 'Invoice', icon: IconFileInvoice, color: 'red' },
  customer: { label: 'Customer', icon: IconUsers, color: 'orange' },
  user: { label: 'User', icon: IconUser, color: 'grape' },
  undone: { label: 'Undone collection', icon: IconCashOff, color: 'gray' },
};
const BLANK = { kind: '', byId: '', range: EMPTY_RANGE };

function KindBadge({ kind }) {
  const info = KIND_INFO[kind];
  const Icon = info.icon;
  return <Badge variant="light" color={info.color} leftSection={<Icon size={12} />} style={{ flexShrink: 0 }}>{info.label}</Badge>;
}

/** What it was, in one line ("Tulsi Pharmacy · Rahul · 12 Oct"). */
function describe(r) {
  if (r.kind === 'invoice') return [r.customer, r.mr, r.date && shortDate(r.date)].filter(Boolean).join(' · ');
  if (r.kind === 'customer') return [r.type, r.area, r.mr && `MR ${r.mr}`].filter(Boolean).join(' · ');
  if (r.kind === 'user') return [r.code, r.role === 'ADMIN' ? 'Admin' : 'MR'].filter(Boolean).join(' · ');
  return [r.mode, r.payments > 1 ? `${r.payments} collections` : null].filter(Boolean).join(' · ');
}

function Status({ r }) {
  if (r.restored) return <Badge variant="light" color="green">Restored</Badge>;
  return null;
}

/**
 * Audit log › Deleted: everything removed (invoices, customers, users,
 * collections undone right after saving), who removed it, when and why,
 * with the money that left the totals. Invoices and customers can be
 * restored for 30 days.
 */
export default function DeletedItems({ preset }) {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh();
  const [filters, setFilters] = useState(() => ({ ...BLANK, ...(preset || {}) }));
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const params = useMemo(() => ({
    ...(filters.kind && { kind: filters.kind }),
    ...(filters.byId && { by_id: filters.byId }),
    ...(filters.range.from && { date_from: filters.range.from }),
    ...(filters.range.to && { date_to: filters.range.to }),
    ...(debounced.trim() && { search: debounced.trim() }),
  }), [filters, debounced]);
  const key = JSON.stringify({ params, page, refresh, appRefresh });
  useEffect(() => {
    let live = true;
    const { params: p, page: n } = JSON.parse(key);
    adminApi.getDeletions({ ...p, limit: PAGE_SIZE, offset: (n - 1) * PAGE_SIZE })
      .then((data) => live && setState({ key, data, error: '' }))
      .catch((err) => live && setState((prev) => ({ key, data: prev.data, error: errorText(err) })));
    return () => { live = false; };
  }, [key]);

  const { data, error } = state;
  const loading = state.key !== key;
  const rows = data?.rows || [];
  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const onSearch = (v) => { setSearch(v); setPage(1); };
  const reset = () => { setFilters(BLANK); setSearch(''); setPage(1); };
  const byOptions = (data?.deleters || []).map((d) => ({ value: String(d.id), label: d.name }));
  const rangeLabel = describeRange(filters.range);
  const chips = [
    filters.kind && { key: 'kind', label: KINDS.find((k) => k.value === filters.kind)?.label, onRemove: () => update({ kind: '' }) },
    filters.byId && { key: 'by', label: `By ${byOptions.find((o) => o.value === filters.byId)?.label || '—'}`, onRemove: () => update({ byId: '' }) },
    rangeLabel && { key: 'range', label: `Deleted: ${rangeLabel}`, onRemove: () => update({ range: EMPTY_RANGE }) },
    search.trim() && { key: 'q', label: `“${search.trim()}”`, onRemove: () => onSearch('') },
  ];

  const exportExcel = async () => {
    setExporting(true);
    try { saveDownload(await adminApi.exportDeletions(params), 'deleted.xlsx'); } catch (err) {
      notifications.show({ color: 'red', title: 'Export', message: await downloadErrorText(err) });
    } finally { setExporting(false); }
  };

  const amountCell = (r) => (r.kind === 'invoice' ? (
    <div style={{ textAlign: 'right' }}>
      <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>{money(r.amount)}</Text>
      {r.collected > 0 && <Text size="xs" c={r.restored ? 'dimmed' : 'red.7'} fw={600} style={{ whiteSpace: 'nowrap' }}>{money(r.collected)} collected</Text>}
    </div>
  ) : r.kind === 'undone' ? <Text size="sm" fw={600} ta="right" style={{ whiteSpace: 'nowrap' }}>{money(r.amount)}</Text> : null);

  return (
    <Stack gap="md">
      <FilterBar search={search} onSearch={onSearch} searchPlaceholder="Invoice, customer, reason, person" chips={chips} onReset={reset} activeOutline>
        <FilterSelect placeholder="Everything" data={KINDS} value={filters.kind} onChange={(kind) => update({ kind: kind || '' })} />
        <FilterSelect placeholder="Anyone" icon={<IconUser size={16} />} data={byOptions} value={filters.byId} onChange={(byId) => update({ byId: byId || '' })} />
        <DateRangeFilter label="Deleted" value={filters.range} onChange={(range) => update({ range })} />
      </FilterBar>

      {data && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <StatCard size="md" label="Invoices deleted" value={data.invoices} />
          <StatCard size="md" label="Collections removed" hint={isMobile ? undefined : "Money on deleted invoices"} value={money(data.collections_removed)} color={data.collections_removed > 0 ? 'red' : undefined} />
          <StatCard size="md" label="Customers deleted" value={data.customers} />
          <StatCard size="md" label="Restored" value={data.restored} color={data.restored ? 'green' : undefined} />
        </SimpleGrid>
      )}

      {error && <Alert color="red" variant="light">{error}</Alert>}
      <Group justify="space-between">
        <Text fw={700}>{data ? `${data.total_count} ${data.total_count === 1 ? 'item' : 'items'}` : ' '}</Text>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exporting} disabled={!data?.total_count} onClick={exportExcel}>Export</Button>
      </Group>

      <Paper {...listPaperProps(isMobile)} {...reloadingStyle(loading && rows.length > 0)}>
        {!data ? <Group justify="center" p="xl"><Loader /></Group>
          : !rows.length ? (chips.some(Boolean) ? <EmptyResults search={search} noun="items" onClear={reset} /> : <Text ta="center" c="dimmed" py="xl">Nothing has been deleted.</Text>)
            : isMobile ? (
              <Stack gap={0}>
                {rows.map((r) => (
                  <div key={r.id} role="button" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}
                    style={{ padding: '12px', borderTop: '1px solid var(--app-line)', cursor: 'pointer', opacity: r.restored ? 0.65 : 1 }}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                      <div style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap"><Text fw={700} truncate>{r.title || '—'}</Text><Status r={r} /></Group>
                        <Text size="xs" c="dimmed" truncate>{describe(r)}</Text>
                      </div>
                      {amountCell(r)}
                    </Group>
                    <Group gap={6} mt={6} wrap="nowrap">
                      <KindBadge kind={r.kind} />
                      <Text size="xs" c="dimmed" truncate>{dateTime(r.at)} · {r.by || '—'}{r.reason ? ` · “${r.reason}”` : ''}</Text>
                    </Group>
                  </div>
                ))}
              </Stack>
            ) : (
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead><Table.Tr>
                  <Table.Th>Deleted</Table.Th><Table.Th>What</Table.Th><Table.Th>Name / number</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th>Reason</Table.Th><Table.Th>By</Table.Th><Table.Th />
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => (
                    <Table.Tr key={r.id} style={{ cursor: 'pointer', opacity: r.restored ? 0.65 : 1 }} onClick={() => setOpenId(r.id)}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}><Text size="sm">{istDay(r.at)}</Text><Text size="xs" c="dimmed">{timeOf(r.at)}</Text></Table.Td>
                      <Table.Td><KindBadge kind={r.kind} /></Table.Td>
                      <Table.Td style={{ maxWidth: 280 }}><Text size="sm" fw={600} truncate>{r.title || '—'}</Text><Text size="xs" c="dimmed" truncate>{describe(r)}</Text></Table.Td>
                      <Table.Td>{amountCell(r)}</Table.Td>
                      <Table.Td style={{ maxWidth: 220 }}><Text size="sm" truncate c={r.reason ? undefined : 'dimmed'}>{r.reason || '—'}</Text></Table.Td>
                      <Table.Td><Text size="sm">{r.by || '—'}</Text></Table.Td>
                      <Table.Td><Status r={r} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
        <ListPagination total={data?.total_count || 0} page={page} onChange={setPage} searchActive={Boolean(debounced.trim())} label="items" />
      </Paper>
      <DeletedDetail id={openId} onClose={() => setOpenId(null)} onRestored={() => { setOpenId(null); setRefresh((v) => v + 1); }} />
    </Stack>
  );
}

/** One deleted item as it was, with Restore when possible. */
function DeletedDetail({ id, onClose, onRestored }) {
  useBackClose(Boolean(id), onClose);
  return (
    <SidePanel opened={Boolean(id)} onClose={onClose} width={600} mobileProps={{ size: '88%' }} title={<Text fw={700}>Deleted item</Text>} zIndex={220}>
      {id && <DetailBody key={id} id={id} onRestored={onRestored} />}
    </SidePanel>
  );
}

function DetailBody({ id, onRestored }) {
  const [state, setState] = useState({ item: null, error: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  useEffect(() => {
    let live = true;
    adminApi.getDeletion(id).then((item) => live && setState({ item, error: '' })).catch((err) => live && setState({ item: null, error: errorText(err) }));
    return () => { live = false; };
  }, [id]);
  const { item, error } = state;
  if (error) return <Alert color="red">{error}</Alert>;
  if (!item) return <Group justify="center" p="lg"><Loader size="sm" /></Group>;
  const d = item.details || {};
  const restore = async () => {
    setBusy(true); setRestoreError('');
    try {
      const result = await adminApi.restoreDeletion(item.id);
      notifications.show({ color: 'green', title: 'Restored', message: result.kind === 'invoice' ? `${result.invoice_number} is back${result.collected ? ` with ${money(result.collected)} collected` : ''}.` : `${result.name} is back.` });
      onRestored();
    } catch (err) { setRestoreError(errorText(err)); setConfirming(false); } finally { setBusy(false); }
  };
  const line = (label, value) => (value || value === 0 ? <Group justify="space-between" wrap="nowrap" gap="md"><Text size="sm" c="dimmed">{label}</Text><Text size="sm" ta="right">{value}</Text></Group> : null);

  return (
    <Stack gap="md">
      <div>
        <Group gap={8}><KindBadge kind={item.kind} />{item.restored && <Badge variant="light" color="green">Restored</Badge>}</Group>
        <Text fw={700} fz={20} mt={6}>{item.title || '—'}</Text>
        <Text size="sm" c="dimmed">{describe(item)}</Text>
      </div>
      <Paper withBorder radius="md" p="sm">
        <Stack gap={6}>
          {line('Deleted', `${dateTime(item.at)} · ${item.by || '—'}`)}
          {line('Reason', item.reason || '—')}
          {item.restored && line('Restored', `${dateTime(item.restored.at)}${item.restored.by ? ` · ${item.restored.by}` : ''}`)}
        </Stack>
      </Paper>

      {item.kind === 'invoice' && (
        <>
          <SimpleGrid cols={3} spacing="xs">
            <StatCard size="md" label="Amount" value={money(d.total)} />
            <StatCard size="md" label="Collected" color={d.paid > 0 ? 'green' : undefined} value={money(d.paid)} />
            <StatCard size="md" label="Pending" color={d.pending > 0 ? 'red' : undefined} value={money(d.pending)} />
          </SimpleGrid>
          <div>
            <Text fw={700} size="sm" mb={6}>Collections on it ({d.payments?.length || 0})</Text>
            {!d.payments?.length ? <Text size="sm" c="dimmed">None.</Text> : (
              <Stack gap={0}>
                {d.payments.map((p, i) => (
                  <Group key={i} justify="space-between" wrap="nowrap" py={8} style={{ borderTop: '1px solid var(--app-line)' }}>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm">{p.date ? istDay(p.date.endsWith('Z') || p.date.includes('+') ? p.date : `${p.date}Z`) : '—'} · {p.mode}{p.by ? ` · ${p.by}` : ''}</Text>
                      {(p.reference || p.reason) && <Text size="xs" c={p.amount < 0 ? 'orange.8' : 'dimmed'} truncate>{p.amount < 0 ? p.reason || p.reference : `Ref ${p.reference}`}</Text>}
                    </div>
                    <Text size="sm" fw={700} c={p.amount < 0 ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{money(p.amount)}</Text>
                  </Group>
                ))}
              </Stack>
            )}
          </div>
          {d.remarks && line('Remarks', d.remarks)}
        </>
      )}
      {item.kind === 'customer' && (
        <Paper withBorder radius="md" p="sm"><Stack gap={6}>{line('Phone', d.phone)}{line('Other phone', d.alternate_phone)}{line('Area', d.area)}{line('Address', d.address)}{line('GSTIN', d.gstin)}</Stack></Paper>
      )}
      {item.kind === 'user' && (
        <Paper withBorder radius="md" p="sm"><Stack gap={6}>{line('Code', d.employee_code)}{line('Role', d.role === 'ADMIN' ? 'Admin' : 'MR')}{line('Phone', d.phone)}</Stack></Paper>
      )}
      {item.kind === 'undone' && (
        <Stack gap={0}>
          <Text size="sm" c="dimmed" mb={6}>Saved and then undone straight away from the Undo bar.</Text>
          {(d.payments || []).map((p, i) => (
            <Group key={i} justify="space-between" py={8} style={{ borderTop: '1px solid var(--app-line)' }}>
              <Text size="sm">{p.invoice_number} · {p.mode}{p.reference ? ` · Ref ${p.reference}` : ''}</Text><Text size="sm" fw={700}>{money(p.amount)}</Text>
            </Group>
          ))}
        </Stack>
      )}

      {restoreError && <Alert color="red" variant="light">{restoreError}</Alert>}
      {(item.kind === 'invoice' || item.kind === 'customer') && !item.restored && (
        item.can_restore ? (
          confirming ? (
            <Paper withBorder radius="md" p="sm">
              <Text size="sm" mb="sm">{item.kind === 'invoice' ? `Bring back ${item.title} with all its collections${item.collected ? ` (${money(item.collected)} goes back into the totals)` : ''}?` : `Bring back ${item.title}?`}</Text>
              <Group justify="end"><Button variant="default" onClick={() => setConfirming(false)}>Cancel</Button><Button color="green" loading={busy} onClick={restore}>Restore</Button></Group>
            </Paper>
          ) : <Button color="green" variant="light" leftSection={<IconArrowBackUp size={16} />} onClick={() => setConfirming(true)}>Restore {item.kind === 'invoice' ? 'invoice' : 'customer'}</Button>
        ) : <Text size="sm" c="dimmed">Can't restore: {item.restore_note}.</Text>
      )}
    </Stack>
  );
}
