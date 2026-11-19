import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionIcon, Alert, Button, Group, Loader, Menu, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowRight, IconDots, IconDownload, IconEdit, IconFileInvoice } from '@tabler/icons-react';
import { adminApi } from '../../api/adminApi';
import { SearchInput } from '../filters/FilterBar';
import ChangeModeModal from '../collections/ChangeModeModal';
import { downloadErrorText, errorText, money, saveDownload, shortDate } from '../../utils/formatters';
import { lakh, MODE_COLORS } from './insightsFormat';
import css from '../../pages/admin/AdminInsights.module.css';

const PAGE = 50;

/** Insights filters → Collections filters (dates, MR, customer type, area). */
function baseParams(filters, mode) {
  return {
    ...(!filters.all_time && filters.date_from && { date_from: filters.date_from }),
    ...(!filters.all_time && filters.date_to && { date_to: filters.date_to }),
    ...(filters.customer_type && { customer_type: filters.customer_type }),
    ...(filters.area && { area: filters.area }),
    ...(filters.mr_id !== undefined && filters.mr_id !== null && { mr_id: filters.mr_id }),
    mode,
  };
}

/**
 * "How customers pay" → one payment type: every collection behind that line,
 * from the Collections ledger with Insights' filters, so the total always
 * equals the chart. Search, sort, split by MR, change a wrong mode, Excel,
 * and "See in Collections" for the full page.
 */
export default function ModePayments({ item, filters, periodLabel, isMobile, onCustomer, onInvoice, onChanged }) {
  const navigate = useNavigate();
  const mode = item.mode;
  const insightsMr = filters.mr_id !== undefined && filters.mr_id !== null;
  const [mrPick, setMrPick] = useState(null); // tap an MR chip to narrow the list
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search.trim(), 300);
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(PAGE);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: '' });
  const [changing, setChanging] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const params = {
    ...baseParams(filters, mode),
    ...(mrPick !== null && { mr_id: mrPick }),
    ...(query && { search: query }),
    ...(sort === 'amount' && { sort: 'amount' }),
  };
  const key = JSON.stringify({ params, shown, reload });
  useEffect(() => {
    let live = true;
    const { params: p, shown: n } = JSON.parse(key);
    adminApi.getCollections({ ...p, limit: Math.min(n, 100), offset: 0, summary: true })
      .then(async (first) => {
        // Past 100 rows (the page limit), fetch the rest in pages.
        let rows = first.rows;
        while (first.limit && rows.length < Math.min(n, first.total_count)) {
          const more = await adminApi.getCollections({ ...p, limit: 100, offset: rows.length });
          if (!more.rows.length) break;
          rows = rows.concat(more.rows);
        }
        if (live) setState({ key, data: { ...first, rows }, error: '' });
      })
      .catch((err) => live && setState((prev) => ({ key, data: prev.data, error: errorText(err) })));
    return () => { live = false; };
  }, [key]);

  const { data, error } = state;
  const loading = state.key !== key;
  const rows = data?.rows || [];
  const exportExcel = async () => {
    setExporting(true); setExportError('');
    try {
      const exportParams = { ...params }; delete exportParams.sort; // the file is always newest first
      saveDownload(await adminApi.exportCollections(exportParams), `${mode} collections.xlsx`);
    } catch (err) {
      setExportError(await downloadErrorText(err));
    } finally { setExporting(false); }
  };

  const seeInCollections = () => navigate('/admin/collections', {
    state: {
      collectionsFilters: {
        range: { from: filters.all_time ? '' : (filters.date_from || ''), to: filters.all_time ? '' : (filters.date_to || '') },
        mrId: mrPick !== null ? String(mrPick) : (insightsMr ? String(filters.mr_id) : ''),
        mode,
        customerType: filters.customer_type || '',
        area: filters.area || '',
        ...(query && { search: query }),
      },
    },
  });

  const color = MODE_COLORS[mode] || '#868e96';
  const canChange = (r) => !r.is_reversal && r.amount > 0 && !r.fully_reversed;
  const who = (r) => (r.recorded_by_admin ? `${r.mr_name || 'No MR'} · by Office` : (r.mr_name || r.recorded_by || '—'));
  const actions = (r) => (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${r.invoice_number}`} onClick={(e) => e.stopPropagation()}><IconDots size={16} /></ActionIcon></Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<IconFileInvoice size={15} />} onClick={() => onInvoice(r.invoice_id)}>Open invoice</Menu.Item>
        {canChange(r) && <Menu.Item leftSection={<IconEdit size={15} />} onClick={() => setChanging({ ...r, collected_by: r.recorded_by })}>Change payment mode</Menu.Item>}
      </Menu.Dropdown>
    </Menu>
  );
  const customerLink = (r) => (
    <Text size="sm" fw={600} c="green.8" truncate style={{ cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); if (r.customer_id) onCustomer({ id: r.customer_id, name: r.customer_name }); }}>
      {r.customer_name || '—'}
    </Text>
  );
  const amountText = (r) => <Text fw={700} size="sm" className={css.num} c={r.amount < 0 ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap' }}>{money(r.amount)}</Text>;
  const note = (r) => (r.is_reversal ? (r.reason || 'Reversed') : r.transaction_reference);

  return (
    <Stack gap="sm">
      <div>
        <Group gap={8} wrap="nowrap"><i style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} /><Text fw={700} fz={18}>{mode === 'Reversal' ? 'Reversals' : `${mode} collections`}</Text></Group>
        <Text size="sm" c="dimmed">{[periodLabel, ...(item.scope || [])].filter(Boolean).join(' · ')}</Text>
      </div>
      {error && <Alert color="red">{error}</Alert>}
      {exportError && <Alert color="red" withCloseButton onClose={() => setExportError('')}>{exportError}</Alert>}
      {!data ? <Group justify="center" p="lg"><Loader size="sm" /></Group> : (
        <>
          <div className={css.stats} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 0 }}>
            <div className={css.st}><div className={css.l}>Total</div><div className={css.v} style={data.total_amount < 0 ? { color: '#d9480f' } : undefined}>{lakh(data.total_amount)}</div></div>
            <div className={css.st}><div className={css.l}>{mode === 'Reversal' ? 'Reversals' : 'Payments'}</div><div className={css.v}>{data.total_count}</div></div>
            <div className={css.st}><div className={css.l}>Customers</div><div className={css.v}>{data.customer_count}</div></div>
          </div>
          {item.share != null && reload === 0 && data.total_count > 0 && mode !== 'Reversal' && !query && mrPick === null && <Text size="xs" c="dimmed">{item.share}% of everything collected {periodLabel === 'All time' ? 'so far' : `in ${periodLabel}`}.</Text>}

          {/* Split by MR: tap one to narrow the list (hidden when Insights already shows one MR). */}
          {!insightsMr && (data.by_mr?.length > 1 || mrPick !== null) && (
            <Group gap={6}>
              {(mrPick === null ? data.by_mr : [{ mr_id: mrPick, name: data.by_mr?.[0]?.name, amount: data.total_amount }]).map((m) => (
                <Button key={m.mr_id} size="compact-xs" radius="xl" variant={mrPick === m.mr_id ? 'filled' : 'default'} color="green"
                  onClick={() => { setMrPick(mrPick === m.mr_id ? null : m.mr_id); setShown(PAGE); }}>
                  {m.name} · {lakh(m.amount)}{mrPick === m.mr_id ? '  ✕' : ''}
                </Button>
              ))}
            </Group>
          )}

          <Group gap="xs" wrap="nowrap">
            <SearchInput className="" style={{ flex: 1 }} value={search} onChange={(v) => { setSearch(v); setShown(PAGE); }} placeholder="Customer, invoice, ref, MR" />
            <SegmentedControl size="xs" value={sort} onChange={(v) => { setSort(v); setShown(PAGE); }} data={[{ value: 'date', label: 'Newest' }, { value: 'amount', label: 'Largest' }]} />
          </Group>

          <Group justify="space-between">
            <Text size="sm" fw={600}>{loading ? 'Loading…' : `${data.total_count} ${data.total_count === 1 ? 'entry' : 'entries'}`}</Text>
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exporting} disabled={!data.total_count} onClick={exportExcel}>Excel</Button>
          </Group>

          <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 150ms' }}>
            {!rows.length && <Text c="dimmed" size="sm" py="sm">{query ? `Nothing matches “${query}”.` : 'No collections here.'}</Text>}
            {isMobile ? (
              <Stack gap={0}>
                {rows.map((r) => (
                  <Group key={r.payment_id} justify="space-between" wrap="nowrap" gap="xs" py="xs" style={{ borderTop: '1px solid var(--app-line)', cursor: 'pointer' }} onClick={() => onInvoice(r.invoice_id)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {customerLink(r)}
                      <Text size="xs" c="dimmed" truncate>{r.invoice_number} · {shortDate(r.payment_date)} · {who(r)}</Text>
                      {note(r) && <Text size="xs" c={r.is_reversal ? 'orange.8' : 'dimmed'} truncate>{r.is_reversal ? note(r) : `Ref ${note(r)}`}</Text>}
                    </div>
                    {amountText(r)}
                    {actions(r)}
                  </Group>
                ))}
              </Stack>
            ) : rows.length > 0 && (
              <Table highlightOnHover verticalSpacing="xs" fz="sm">
                <Table.Thead><Table.Tr><Table.Th>Paid on</Table.Th><Table.Th>Customer</Table.Th><Table.Th>MR</Table.Th><Table.Th ta="right">Amount</Table.Th><Table.Th w={36} /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => (
                    <Table.Tr key={r.payment_id} style={{ cursor: 'pointer' }} onClick={() => onInvoice(r.invoice_id)}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{shortDate(r.payment_date)}<Text size="xs" c="dimmed">{r.invoice_number}</Text></Table.Td>
                      <Table.Td style={{ maxWidth: 200 }}>{customerLink(r)}{note(r) && <Text size="xs" c={r.is_reversal ? 'orange.8' : 'dimmed'} truncate title={note(r)}>{r.is_reversal ? note(r) : `Ref ${note(r)}`}</Text>}</Table.Td>
                      <Table.Td><Text size="sm">{r.mr_name || 'No MR'}</Text>{r.recorded_by_admin && <Text size="xs" c="dimmed">by Office</Text>}</Table.Td>
                      <Table.Td ta="right">{amountText(r)}</Table.Td>
                      <Table.Td>{actions(r)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {rows.length < data.total_count && (
              <Group justify="center" pt="sm"><Button variant="default" size="xs" loading={loading} onClick={() => setShown((n) => n + PAGE)}>Show more ({data.total_count - rows.length} left)</Button></Group>
            )}
          </div>

          <Button variant="subtle" color="green" rightSection={<IconArrowRight size={15} />} onClick={seeInCollections} style={{ alignSelf: 'flex-start' }}>See in Collections</Button>
        </>
      )}
      <ChangeModeModal payment={changing} onClose={() => setChanging(null)} onSaved={() => { setChanging(null); setReload((v) => v + 1); onChanged?.(); }} />
    </Stack>
  );
}
