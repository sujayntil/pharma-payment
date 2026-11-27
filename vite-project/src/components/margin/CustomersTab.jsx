import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Paper, SegmentedControl, Select, Stack, Table, Text, Title } from '@mantine/core';
import ExportMenu from '../common/ExportMenu';
import { adminApi } from '../../api/adminApi';
import { downloadErrorText, saveDownload } from '../../utils/formatters';
import { FilterChecks, SearchInput } from '../filters/FilterBar';
import TableScroll from '../common/TableScroll';
import { TYPE_GROUPS } from '../../utils/customerTypes';
import { calc, filled, marginTone, missing, pct, productName, rule, rupees, schemeName } from '../../utils/marginCalc';
import classes from './Margin.module.css';

const LIST_LIMIT = 200;
const cx = (...names) => names.filter(Boolean).join(' ');
const tone = (v) => (v < -0.00005 ? classes.neg : '');
const groupOf = (type) => {
  const t = String(type || '').trim().toLowerCase();
  return TYPE_GROUPS.find((g) => g !== 'Other' && g.toLowerCase() === t) || 'Other';
};

function Figures({ product, scheme }) {
  const gaps = missing(product, scheme);
  if (gaps.length) return <Text size="sm" c="dimmed" className={classes.figs}>Scheme not complete: fill in {gaps.join(', ')}</Text>;
  const r = calc(product, scheme);
  const cell = (label, value, cls) => <div><span>{label}</span><b className={cls}>{value}</b></div>;
  return (
    <div className={classes.figs}>
      {cell('Keep / unit', rupees(r.per), tone(r.per) || classes.keep)}
      {cell('% of MRP', pct(r.pMrp), tone(r.pMrp))}
      {cell('% of bill, after GST', pct(r.pAft, 2), classes[marginTone(r.pAft)])}
      {cell('% of bill, before GST', pct(r.pBef, 2), tone(r.pBef))}
      {cell('Take home / batch', rupees(r.take, 0), tone(r.take) || classes.keep)}
    </div>
  );
}

function ByCustomer({ customers, products, linkOf, countOf, onLink, onNewScheme }) {
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState('');
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [picked, setPicked] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wanted = types ? types.split(',') : [];
    return customers.filter((c) => (!q || c.name.toLowerCase().includes(q))
      && (!wanted.length || wanted.includes(groupOf(c.type)))
      && (!onlyLinked || countOf(c.id) > 0));
  }, [customers, search, types, onlyLinked, countOf]);

  const customer = customers.find((c) => c.id === picked) || filtered[0] || null;

  return (
    <div className={classes.ccols}>
      <Paper withBorder p="sm" radius="lg">
        <Stack gap="xs">
          <div><SearchInput value={search} onChange={setSearch} placeholder="Search customers" className="" /></div>
          <div><FilterChecks value={types} onChange={setTypes} data={TYPE_GROUPS} placeholder="All types" /></div>
          <Checkbox size="sm" label="With schemes only" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.currentTarget.checked)} />
          <Text size="xs" c="dimmed">{filtered.length.toLocaleString('en-IN')} customers</Text>
          <div className={classes.clist}>
            {filtered.slice(0, LIST_LIMIT).map((c) => {
              const n = countOf(c.id);
              return (
                <button key={c.id} type="button" className={classes.citem} aria-current={customer?.id === c.id} onClick={() => setPicked(c.id)}>
                  <span style={{ minWidth: 0 }}><Text span size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{c.name}</Text><small>{c.type || 'Other'}</small></span>
                  {n > 0 && <Badge size="sm" variant="light" color="green">{n}</Badge>}
                </button>
              );
            })}
            {filtered.length > LIST_LIMIT && <Text size="xs" c="dimmed" p="xs">Showing {LIST_LIMIT}. Search to find others.</Text>}
            {!filtered.length && <Text size="sm" c="dimmed" p="xs">No customers match.</Text>}
          </div>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="lg">
        {!customer ? <Text c="dimmed">Pick a customer.</Text> : (
          <>
            <Group justify="space-between" align="baseline" mb={4}>
              <Title order={2} fz={18} style={{ overflowWrap: 'anywhere' }}>{customer.name}</Title>
              <Badge variant="default">{customer.type || 'Other'}</Badge>
            </Group>
            {!products.length && <Text c="dimmed" mt="sm">Add a product in Products &amp; schemes first.</Text>}
            {products.map((p) => {
              const s = p.schemes.find((x) => x.id === linkOf(customer.id, p.id));
              return (
                <div key={p.id} className={classes.prow}>
                  <div>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{productName(p)}</Text>
                    <Text size="xs" c="dimmed">MRP {filled(p.mrp) ? rupees(Number(p.mrp)) : '—'} · cost {filled(p.cost) ? rupees(Number(p.cost)) : '—'}</Text>
                  </div>
                  <div>
                    <Select aria-label={`Scheme for ${productName(p)}`} value={s ? String(s.id) : ''} allowDeselect={false}
                      data={[{ value: '', label: 'Not supplied' }, ...p.schemes.map((x) => ({ value: String(x.id), label: `${schemeName(x)} · ${rule(x)}` }))]}
                      onChange={(v) => onLink(customer.id, p.id, v ? Number(v) : null)} />
                    <Button variant="subtle" size="compact-xs" mt={4} px={0} onClick={() => onNewScheme(p.id)}>+ New scheme</Button>
                  </div>
                  {s ? <Figures product={p} scheme={s} /> : <Text size="sm" c="dimmed" className={classes.figs}>Not supplied</Text>}
                </div>
              );
            })}
          </>
        )}
      </Paper>
    </div>
  );
}

function Assigned({ rows }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  // The list below as the standard Excel / PDF report (internal, confidential).
  const download = async (format) => {
    const val = (ok, v) => (ok && Number.isFinite(v) ? v : null);
    const columns = [
      { header: 'Customer', width: 26 }, { header: 'Type', width: 11 }, { header: 'Product', width: 22 }, { header: 'Scheme', width: 18 },
      { header: 'Rule', width: 20 }, { header: 'Billing value / unit', kind: 'money', width: 13 }, { header: 'Keep / unit', kind: 'money', width: 12 },
      { header: '% of MRP', kind: 'pct', width: 9 }, { header: '% of bill after GST', kind: 'pct', width: 11 }, { header: '% of bill before GST', kind: 'pct', width: 11 },
      { header: 'Take home / batch', kind: 'money0', width: 13 },
    ];
    const body = rows.map(({ c, p, s, ok, r }) => [c.name, c.type || '', productName(p), schemeName(s), rule(s), val(ok, r.get), val(ok, r.per),
      val(ok, r.pMrp), val(ok, r.pAft), val(ok, r.pBef), val(ok, r.take)]);
    setExporting(true); setExportError('');
    try {
      saveDownload(await adminApi.reportTable({ title: 'Customer schemes', filters: ['Every customer with a scheme'], columns, rows: body, format }), `Customer schemes.${format}`);
    } catch (err) { setExportError(await downloadErrorText(err)); }
    finally { setExporting(false); }
  };
  if (!rows.length) {
    return <Paper withBorder p="xl" radius="lg"><Text c="dimmed" ta="center">No customer has a scheme yet. Pick one in “By customer”.</Text></Paper>;
  }
  return (
    <Paper withBorder p="md" radius="lg">
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">{rows.length} customer {rows.length === 1 ? 'scheme' : 'schemes'}</Text>
        <ExportMenu loading={exporting} onExport={download} label="Download" />
      </Group>
      {exportError && <Alert color="red" mb="sm" withCloseButton onClose={() => setExportError('')}>{exportError}</Alert>}
      <TableScroll minWidth={860}>
        <Table striped highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Customer</Table.Th><Table.Th>Product</Table.Th><Table.Th>Scheme</Table.Th>
              <Table.Th ta="right">Keep / unit</Table.Th><Table.Th ta="right">% bill after GST</Table.Th><Table.Th ta="right">Take home / batch</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ c, p, s, ok, r }) => (
              <Table.Tr key={`${c.id}-${p.id}`}>
                <Table.Td><Text size="sm" fw={500}>{c.name}</Text><Text size="xs" c="dimmed">{c.type || 'Other'}</Text></Table.Td>
                <Table.Td>{productName(p)}</Table.Td>
                <Table.Td><Text size="sm">{schemeName(s)}</Text><Text size="xs" c="dimmed">{rule(s)}</Text></Table.Td>
                <Table.Td ta="right" className={cx(classes.n, ok && tone(r.per))}>{ok ? rupees(r.per) : '—'}</Table.Td>
                <Table.Td ta="right" className={cx(classes.n, ok && classes[marginTone(r.pAft)])}>{ok ? pct(r.pAft, 2) : '—'}</Table.Td>
                <Table.Td ta="right" fw={600} className={cx(classes.n, ok && tone(r.take))}>{ok ? rupees(r.take, 0) : '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </TableScroll>
    </Paper>
  );
}

/** Customers: your real customers (name and type only) and their schemes. */
export default function CustomersTab({ customers, products, links, onLink, onNewScheme }) {
  const [view, setView] = useState('customer');
  const linkMap = useMemo(() => new Map(links.map((l) => [`${l.customer_id}:${l.product_id}`, l.scheme_id])), [links]);
  const counts = useMemo(() => {
    const m = new Map();
    links.forEach((l) => m.set(l.customer_id, (m.get(l.customer_id) || 0) + 1));
    return m;
  }, [links]);
  const linkOf = (customerId, productId) => linkMap.get(`${customerId}:${productId}`);
  const countOf = useMemo(() => (id) => counts.get(id) || 0, [counts]);

  const rows = useMemo(() => {
    const byId = new Map(customers.map((c) => [c.id, c]));
    const out = [];
    links.forEach((l) => {
      const c = byId.get(l.customer_id);
      const p = products.find((x) => x.id === l.product_id);
      const s = p?.schemes.find((x) => x.id === l.scheme_id);
      if (c && p && s) out.push({ c, p, s, ok: !missing(p, s).length, r: calc(p, s) });
    });
    return out.sort((a, b) => a.c.name.localeCompare(b.c.name) || productName(a.p).localeCompare(productName(b.p)));
  }, [customers, products, links]);

  return (
    <Stack gap="md">
      <SegmentedControl value={view} onChange={setView} style={{ alignSelf: 'flex-start' }}
        data={[{ value: 'customer', label: 'By customer' }, { value: 'all', label: `All assigned${rows.length ? ` (${rows.length})` : ''}` }]} />
      {view === 'customer'
        ? <ByCustomer customers={customers} products={products} linkOf={linkOf} countOf={countOf} onLink={onLink} onNewScheme={onNewScheme} />
        : <Assigned rows={rows} />}
    </Stack>
  );
}
