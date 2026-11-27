import SectionNav from '../../components/common/SectionNav';
import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Menu, Paper, SegmentedControl, Select, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconBook2, IconChartPie, IconChevronRight, IconDots, IconMapPin, IconX } from '@tabler/icons-react';
import ContactActions from '../../components/customers/ContactActions';
import { insightsApi } from '../../api/insightsApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import PeriodPicker from '../../components/insights/PeriodPicker';
import { businessPeriods, describeRange, isCustomRange, last15Range, shortRange } from '../../components/filters/dateRanges';
import { Donut, Spark, TrendChart } from '../../components/insights/charts';
import { lakh, MODE_COLORS, TYPE_COLORS } from '../../components/insights/insightsFormat';
import InsightsPanel from '../../components/insights/InsightsPanel';
import ShowMore from '../../components/insights/ShowMore';
import css from './AdminInsights.module.css';
import { FilterChecks } from '../../components/filters/FilterBar';
import { TYPE_GROUPS, listLabel } from '../../utils/customerTypes';
import { formatDateLocal, shortDate } from '../../utils/formatters';

const TYPES = TYPE_GROUPS;
const NOT_SET = '__none__';

const initials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const FOLLOW_LABEL = { quiet: 'Not ordering', less: 'Buying less', late: 'Paying late', more: 'Growing', new: 'New' };
const DUE_LABELS = { not_due: 'Not due yet', '1-30': '1–30 days overdue', '31-60': '31–60 days overdue', '60+': 'Over 60 days overdue' };
// Days past the due date for each overdue box (0 = due today).
const DUE_BANDS = { '1-30': [0, 29], '31-60': [30, 59], '60+': [60, null] };
const DUE_COLORS = { not_due: '#2f9e44', '1-30': '#f59f00', '31-60': '#f76707', '60+': '#e03131' };
const pctLabel = (v) => (v === null || v === undefined ? '—' : `${Math.abs(v)}%`);

// "Jump to section" (right-edge dots on laptop, chips on phone).
const INSIGHT_SECTIONS = [
  { id: 'ins-summary', label: 'Summary' },
  { id: 'ins-owed', label: 'Money owed' },
  { id: 'ins-types', label: 'By customer type' },
  { id: 'ins-trend', label: 'Sales vs collections' },
  { id: 'ins-mr', label: 'By MR' },
  { id: 'ins-top', label: 'Top customers' },
  { id: 'ins-follow', label: 'Customers to watch' },
  { id: 'ins-area', label: 'By area' },
];

export default function AdminInsights({ onOpenCustomer }) {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh();
  const [picked, setPicked] = useState(null); // null = the current month so far (moves on with the date)
  const [type, setType] = useState(null);
  const [mrId, setMrId] = useState(null);
  const [area, setArea] = useState(null);
  const [trend, setTrend] = useState('monthly');
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const [panel, setPanel] = useState([]); // drill stack
  const [donutView, setDonutView] = useState('sales'); // the type donut: sales share or owed share
  const [followKind, setFollowKind] = useState('all'); // Customers to follow up: which reason
  const [refreshKey, setRefreshKey] = useState(0);

  // Worked out each render, so a page left open moves on with the date.
  const currentMonth = businessPeriods(null)[0];
  // All time: { all: true } (first invoice to today; nothing to compare with).
  const allTime = Boolean(picked?.all);
  const range = allTime ? { from: '', to: '' } : (picked || currentMonth);
  const periodLabel = allTime ? 'All time' : describeRange(range, { business: true });
  // All time has nothing before it: tiles say where it starts instead.
  const firstDay = result.data?.range?.all_time ? result.data.range.from : null;
  const sinceText = firstDay ? `since ${new Date(`${firstDay}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : 'since the start';
  const pickRange = (r) => {
    if (r.all || (!r.from && !r.to)) { setPicked({ all: true }); return; }
    setPicked(r.from === currentMonth.from && r.to === currentMonth.to ? null : { from: r.from, to: r.to });
  };
  const filters = {
    ...(allTime ? { all_time: true } : { date_from: range.from, date_to: range.to }),
    ...(type && { customer_type: type }), ...(mrId !== null && { mr_id: mrId }), ...(area && { area }),
  };
  // One key per request; the last answer stays on screen (dimmed) while the next loads.
  const requestKey = JSON.stringify({ filters, trend, appRefresh, refreshKey });
  // Lists fold back to their first few when the period or a filter changes.
  const listKey = JSON.stringify(filters);
  const { data, error } = result;
  const loading = result.key !== requestKey;

  useEffect(() => {
    let alive = true;
    const { filters: params, trend: kind } = JSON.parse(requestKey);
    insightsApi.summary({ ...params, trend: kind })
      .then((answer) => { if (alive) setResult({ key: requestKey, data: answer, error: '' }); })
      .catch((err) => { if (alive) setResult((prev) => ({ key: requestKey, data: prev.data, error: err.detail || err.message || 'Could not load Insights.' })); });
    return () => { alive = false; };
  }, [requestKey]);

  const open = (item) => setPanel((stack) => [...stack, item]);
  const openFresh = (item) => setPanel([item]);
  const mrName = (id) => data?.by_mr.rows.find((r) => r.mr_id === id)?.name || 'MR';
  const chips = [
    type && { key: 'type', label: listLabel(type), clear: () => setType(null) },
    mrId !== null && { key: 'mr', label: `MR: ${mrName(mrId)}`, clear: () => setMrId(null) },
    area && { key: 'area', label: `Area: ${area === NOT_SET ? 'Not set' : area}`, clear: () => setArea(null) },
  ].filter(Boolean);
  const clearAll = () => { setType(null); setMrId(null); setArea(null); };
  const pickTrend = (point) => pickRange(point);
  // What every "vs …" compares against, named (e.g. "1–18 Oct", "Sep 2026").
  const prevShort = result.data ? shortRange({ from: result.data.range.previous_from, to: result.data.range.previous_to }) : 'before';
  const toggle = (setter, current, value) => setter(current === value ? null : value);
  // Customer types: several can be picked ("Chemist,Doctor"); tapping one adds / removes it.
  const pickedTypes = String(type || '').split(',').filter(Boolean);
  const toggleType = (t) => {
    const next = pickedTypes.includes(t) ? pickedTypes.filter((x) => x !== t) : TYPES.filter((x) => x === t || pickedTypes.includes(x));
    setType(next.length ? next.join(',') : null);
  };

  const swatch = (bg, extra) => <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: bg, margin: '0 5px -1px 0', ...extra }} />;
  const legend = (
    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
      {swatch('var(--app-pending)', { border: '1px solid var(--app-pending-line)' })}Sales {swatch('#2f9e44', { marginLeft: 8 })}Paid so far {swatch('#1c7ed6', { width: 12, height: 3, marginLeft: 8, verticalAlign: 3 })}Collections
    </Text>
  );
  // All time · Today · Last 7 days · Last 15 days; Clear goes back to this month.
  const nowDate = new Date();
  const todayStr = formatDateLocal(nowDate);
  const weekAgoStr = formatDateLocal(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 6));
  const insightChips = [
    { id: 'all', label: 'All time', from: '', to: '', all: true },
    { id: 'today', label: 'Today', from: todayStr, to: todayStr },
    { id: 'last7', label: '7 days', from: weekAgoStr, to: todayStr },
    { id: 'last15', label: '15 days', ...last15Range(nowDate) },
  ];
  const periodPicker = (
    <PeriodPicker value={range} firstDate={result.data?.first_invoice_date} label={periodLabel} fullWidth={isMobile} onPick={pickRange}
      isCustom={!allTime && isCustomRange(range)} chips={insightChips} onClear={picked ? () => setPicked(null) : undefined} />
  );
  const k = data?.kpis;
  const custRow = (c, right, sub) => (
    <button type="button" key={`${c.customer_id}-${sub || ''}`} className={css.row} onClick={() => open({ kind: 'customer', id: c.customer_id, name: c.name })}>
      <span className={css.ini} style={{ background: `${TYPE_COLORS[c.type] || '#868e96'}22`, color: TYPE_COLORS[c.type] || '#868e96' }}>{initials(c.name)}</span>
      <span style={{ flex: 1, minWidth: 0 }}><div className={css.nm}>{c.name}</div><div className={css.sub}>{sub || [c.type, c.mr].filter(Boolean).join(' · ')}</div></span>
      {right}
    </button>
  );
  const empty = (text) => <Text size="sm" c="dimmed" py={6}>{text}</Text>;

  // count: show the change as a number ("↑ 3 customers") instead of a %.
  const kpi = (key, label, value, { good = 'up', color, kind, open: openItem, suffix = '%', note, foot, count, cardKey, valueClass } = {}) => {
    const item = k?.[key];
    const diff = count && item?.previous !== null && item?.previous !== undefined ? (item.value || 0) - (item.previous || 0) : null;
    const change = count ? diff : item?.change;
    const better = change === null || change === undefined ? null : (good === 'up' ? change >= 0 : change <= 0);
    return (
      <button type="button" key={cardKey || key} className={`${css.card} ${css.kpi} ${kind ? css.clickable : ''}`} onClick={openItem ? () => openFresh(openItem) : kind ? () => openFresh({ kind: 'records', records: kind, title: label }) : undefined} style={kind || openItem ? undefined : { cursor: 'default' }}>
        <div className={css.kl}>{label}{(kind || openItem) && <IconChevronRight size={14} color="var(--app-faint)" />}</div>
        {loading && !data ? <Skeleton height={28} width={120} mt={6} /> : <div className={`${css.kv} ${valueClass || ''}`}>{value}</div>}
        {note && data && <div className={css.note}>{note}</div>}
        {foot ? <div className={css.kf}>{data && foot}</div> : <div className={css.kf}>
          <span>{change === null || change === undefined ? (allTime ? sinceText : 'no earlier data') : <><span className={better ? css.up : css.down}>{count && change === 0 ? 'Same' : <>{change >= 0 ? '↑' : '↓'} {count ? `${Math.abs(change)} ${count}${Math.abs(change) === 1 ? '' : 's'}` : suffix === '%' ? pctLabel(change) : `${Math.abs(change)}${suffix}`}</>}</span></>}</span>
          <Spark values={item?.spark || []} color={color} />
        </div>}
        {!foot && data && change !== null && change !== undefined && <div className={css.vs}>vs {prevShort}</div>}
      </button>
    );
  };

  const typeTotal = (data?.by_type || []).reduce((sum, row) => sum + row.sales, 0);
  const owedTotal = (data?.by_type || []).reduce((sum, row) => sum + (row.owed || 0), 0);
  // Tap a slice / row: every unpaid bill of that type, oldest first.
  const modeTotal = (data?.payment_modes || []).reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const dueRows = data?.due_ageing || [];
  const dueTotal = dueRows.reduce((sum, row) => sum + row.amount, 0);
  const overdueCustomers = data?.kpis.outstanding.overdue_customers ?? 0;
  const typeRows = (data?.by_type || []).filter((r) => r.sales > 0 || r.owed > 0);
  const areaNotSet = data?.area.rows.find((a) => a.area === NOT_SET && a.sales > 0);
  const areaRows = (data?.area.rows || []).filter((a) => a.area !== NOT_SET);
  // The running period's bar is only part-way through: say so on the axis.
  const trendPoints = (data?.trend.points || []).map((p, idx, all) => (idx === all.length - 1 ? { ...p, label: `${p.label} (so far)` } : p));
  const asRow = (c, reason) => ({ ...c, overdue: c.overdue || 0, usual_month: c.usual_month ?? null, reasons: [reason] });
  const watchRows = followKind === 'more'
    ? (data?.growing || []).map((c) => asRow(c, { kind: 'more', text: `+${lakh(c.change)} a month lately · usually ${lakh(c.usual_month)}` }))
    : followKind === 'new'
      ? (data?.new_customers || []).map((c) => asRow(c, { kind: 'new', text: `First order ${shortDate(c.first_order)} · ${lakh(c.sales)} so far` }))
      : (data?.follow_up.rows || []).filter((r) => followKind === 'all' || r.reasons.some((x) => x.kind === followKind));
  const areaOptions = data?.area.areas?.length ? [...data.area.areas.map((a) => ({ value: a, label: a })), { value: NOT_SET, label: 'Not set' }] : [];

  return (
    <Stack gap="md">
      <SectionNav watch={data} sections={INSIGHT_SECTIONS} />
      <Group justify="space-between" align="center" gap="sm">
        <Title order={1}>Insights</Title>
        {isMobile ? <div style={{ width: '100%' }}>{periodPicker}</div> : periodPicker}
      </Group>

      <Group gap={8} wrap="wrap">
        <div style={{ width: isMobile ? '48%' : 190 }}><FilterChecks placeholder="All types" data={TYPES} value={type || ''} onChange={(v) => setType(v || null)} /></div>
        <Select size="sm" w={isMobile ? '48%' : 170} placeholder="All MRs" clearable aria-label="MR"
          data={(data?.by_mr.rows || []).map((r) => ({ value: String(r.mr_id), label: r.name }))}
          value={mrId === null ? null : String(mrId)} onChange={(v) => setMrId(v === null ? null : Number(v))} />
        <Select size="sm" w={isMobile ? '100%' : 170} aria-label="Area" clearable disabled={!areaOptions.length}
          placeholder={areaOptions.length ? 'All areas' : 'Area: not set yet'} data={areaOptions} value={area} onChange={setArea} />
        {chips.map((chip) => (
          <Badge key={chip.key} size="lg" variant="light" color="green" radius="xl" rightSection={<IconX size={12} style={{ cursor: 'pointer' }} onClick={chip.clear} aria-label={`Remove ${chip.label}`} />}>{chip.label}</Badge>
        ))}
        {chips.length > 0 && <Button size="compact-sm" variant="subtle" color="gray" onClick={clearAll}>Clear all</Button>}
      </Group>
      <Text size="sm" c="dimmed" mt={-8}>Overview › <Text span fw={600} c="var(--app-ink)">{[periodLabel, listLabel(type), mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean).join(' › ')}</Text></Text>

      {error && <Alert color="red">{error}</Alert>}

      <div className={css.kpis} id="ins-summary" data-section>
        {kpi('sales', 'Sales', lakh(k?.sales.value), { color: '#2f9e44', kind: 'sales' })}
        {kpi('collected', 'Collected', lakh(k?.collected.value), { color: '#1c7ed6', kind: 'collected' })}
        {kpi('outstanding', 'Owed to you today', lakh(k?.outstanding.value), { color: '#e03131', kind: 'outstanding',
          foot: k && <span>{lakh(k.outstanding.not_due)} not due yet</span> })}
        {kpi('outstanding', 'Overdue', lakh(k?.outstanding.overdue), { cardKey: 'overdue', kind: 'outstanding', valueClass: css.red,
          foot: k && <span>{k.outstanding.value ? Math.round((k.outstanding.overdue / k.outstanding.value) * 100) : 0}% of what's owed · {overdueCustomers} customers</span> })}
      </div>

      {data && (
        <div className={css.grid} style={loading ? { opacity: 0.6, transition: 'opacity .2s' } : undefined}>
          {/* Money: what's owed, by due date. */}
          <Paper className={`${css.card} ${css.s12}`} id="ins-owed" data-section>
            <div className={css.ch}><div><div className={css.ct}>Money owed by due date</div><div className={css.cs}>As of today · tap a box for its bills</div></div><div className={css.big}>{lakh(dueTotal)}</div></div>
            <div className={css.cb}>
              <div className={css.stack}>{dueRows.map((a) => <i key={a.bucket} title={DUE_LABELS[a.bucket]} style={{ width: `${dueTotal ? (a.amount / dueTotal) * 100 : 0}%`, background: DUE_COLORS[a.bucket] }} />)}</div>
              <div className={css.dueGrid}>
                {dueRows.map((a) => (
                  <button type="button" key={a.bucket} className={css.dueCell} onClick={() => openFresh({ kind: 'records', records: 'outstanding', title: DUE_LABELS[a.bucket], ...(a.bucket === 'not_due' ? { due: 'notdue' } : { lateBand: DUE_BANDS[a.bucket] }) })}>
                    <span className={css.k}><i style={{ width: 9, height: 9, borderRadius: 2, background: DUE_COLORS[a.bucket] }} />{DUE_LABELS[a.bucket]}</span>
                    <b style={a.bucket === 'not_due' ? undefined : { color: DUE_COLORS[a.bucket] }}>{lakh(a.amount)}</b>
                    <span className={css.sub}>{a.customers} {a.customers === 1 ? 'customer' : 'customers'} · {dueTotal ? Math.round((a.amount / dueTotal) * 100) : 0}%</span>
                  </button>
                ))}
              </div>
              <div className={css.sub} style={{ marginTop: 8 }}>Due date = bill date + 40 days (60 for distributors).</div>
            </div>
          </Paper>

          {/* One table instead of two donuts. */}
          <Paper className={`${css.card} ${css.s12}`} id="ins-types" data-section>
            <div className={css.ch}><div><div className={css.ct}>By customer type</div><div className={css.cs}>Sales and collected in {allTime ? 'all time' : periodLabel} · owed as of today · tap a row to filter</div></div></div>
            <div className={`${css.cb} ${css.typeWrap}`}>
              <div className={css.typeDonut}>
                <SegmentedControl size="xs" value={donutView} onChange={setDonutView} data={[{ value: 'sales', label: 'Sales' }, { value: 'owed', label: 'Owed' }]} />
                <Donut size={isMobile ? 176 : 184} centerLabel={donutView === 'owed' ? 'Owed' : 'Sales'} unit={donutView === 'owed' ? "of what's owed" : 'of sales'} label={`${donutView === 'owed' ? 'Owed' : 'Sales'} by customer type`}
                  rows={typeRows.map((r) => ({ key: r.type, value: donutView === 'owed' ? r.owed : r.sales, color: TYPE_COLORS[r.type] }))}
                  total={donutView === 'owed' ? owedTotal : typeTotal} active={type} onPick={toggleType} />
              </div>
              <div className={css.tblScroll} style={{ minWidth: 0 }}>
              <table className={css.tbl}>
                <thead><tr><th>Type</th><th>Sales</th><th className={css.hideSm} title="Share of sales">% of sales</th><th className={css.hideSm}>Collected</th><th>Owed</th><th className={css.hideSm} title="Share of what's owed">% of owed</th><th>Overdue</th><th className={css.hideSm} title="Customers who bought in this period">Bought</th></tr></thead>
                <tbody>
                  {typeRows.map((r) => (
                    <tr key={r.type} onClick={() => toggleType(r.type)} style={pickedTypes.length && !pickedTypes.includes(r.type) ? { opacity: 0.45 } : undefined}>
                      <td className={css.left}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: TYPE_COLORS[r.type], marginRight: 8 }} />{r.type}</td>
                      <td><b>{lakh(r.sales)}</b></td>
                      <td className={`${css.muted} ${css.hideSm}`}>{typeTotal ? Math.round((r.sales / typeTotal) * 100) : 0}%</td>
                      <td className={css.hideSm}>{lakh(r.collected)}</td>
                      <td>{lakh(r.owed)}</td>
                      <td className={`${css.muted} ${css.hideSm}`}>{owedTotal ? Math.round((r.owed / owedTotal) * 100) : 0}%</td>
                      <td className={r.overdue > 0 ? css.red : css.muted}>{r.overdue > 0 ? lakh(r.overdue) : '—'}</td>
                      <td className={`${css.muted} ${css.hideSm}`}>{r.customers}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td className={css.left}>Total</td><td>{lakh(typeTotal)}</td><td className={css.hideSm} /><td className={css.hideSm}>{lakh(typeRows.reduce((s, r) => s + r.collected, 0))}</td><td>{lakh(owedTotal)}</td><td className={css.hideSm} /><td className={css.red}>{lakh(typeRows.reduce((s, r) => s + r.overdue, 0))}</td><td className={css.hideSm} /></tr></tfoot>
              </table>
              </div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`} id="ins-trend" data-section>
            <div className={css.ch}>
              <div><div className={css.ct}>Sales vs collections</div><div className={css.cs}>Last 12 {trend === 'weekly' ? 'weeks' : 'months'} · {isMobile ? 'tap' : 'click'} a bar to open it</div></div>
              <Group gap={10} wrap="nowrap">
                {!isMobile && legend}
                <SegmentedControl size="xs" value={trend} onChange={setTrend} data={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
              </Group>
            </div>
            <div className={css.cb}>
              {isMobile && <div style={{ marginBottom: 6 }}>{legend}</div>}
              <TrendChart points={trendPoints} selected={allTime ? null : range} onPick={pickTrend} weekly={trend === 'weekly'} wide={!isMobile} />
              {data.payment_modes.length > 0 && (
                <div className={css.payStrip}>
                  <span className={css.lbl}>Collected by</span>
                  {data.payment_modes.map((m) => {
                    const share = modeTotal ? Math.round((Math.max(m.amount, 0) / modeTotal) * 100) : 0;
                    return (
                      <button type="button" key={m.mode} onClick={() => openFresh({ kind: 'mode', mode: m.mode, share, scope: [listLabel(type), mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean) })}>
                        <i style={{ width: 9, height: 9, borderRadius: 2, background: MODE_COLORS[m.mode] || '#868e96' }} />{m.mode} <b className={css.num}>{share}%</b> <span className={css.sub}>{lakh(m.amount)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`} id="ins-mr" data-section>
            <div className={css.ch}>
              <div><div className={css.ct}>By MR</div><div className={css.cs}>Sales and collected in {allTime ? 'all time' : periodLabel} · owed as of today · tap to filter</div></div>
            </div>
            <div className={`${css.cb} ${css.tblScroll}`}>
              <table className={css.tbl}>
                <thead><tr><th>MR</th><th>Sales</th><th>Collected</th><th>Owed</th><th>Overdue</th></tr></thead>
                <tbody>
                  {data.by_mr.rows.map((r) => {
                    return (
                      <tr key={r.mr_id} onClick={() => toggle(setMrId, mrId, r.mr_id)} style={mrId !== null && mrId !== r.mr_id ? { opacity: 0.45 } : undefined}>
                        <td className={css.left}><b>{r.name}</b></td>
                        <td><b>{lakh(r.sales)}</b></td>
                        <td>{lakh(r.collected)}</td>
                        <td>{lakh(r.owed)}</td>
                        <td className={r.overdue > 0 ? css.red : css.muted}>{r.overdue > 0 ? lakh(r.overdue) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!data.by_mr.rows.length && empty('No MR sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`} id="ins-top" data-section>
            <div className={css.ch}><div><div className={css.ct}>Top customers</div><div className={css.cs}>Top 10 = <b style={{ color: 'var(--app-ink)' }}>{data.top_customers.top10_share}%</b> of sales · with what they owe today</div></div></div>
            <div className={css.cb}>
              {data.top_customers.dependence && <div className={css.warn}>⚠️ <span><b>{data.top_customers.dependence.name}</b> alone is <b>{Math.round(data.top_customers.dependence.share)}%</b> of sales — a lot riding on one customer.</span></div>}
              <ShowMore key={listKey} items={data.top_customers.rows} initial={5} render={(c) => custRow(c, (
                <span style={{ width: isMobile ? 132 : 210, textAlign: 'right', flexShrink: 0 }}>
                  <b className={css.num}>{lakh(c.sales)}</b>
                  <span className={css.owes}>{c.owed > 0 ? <>owes {lakh(c.owed)}{c.overdue > 0 && <> · <span className={css.red}>{lakh(c.overdue)} overdue</span></>}</> : 'nothing owed'}</span>
                </span>
              ))} />
              {!data.top_customers.rows.length && empty('No sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`} id="ins-follow" data-section>
            <div className={css.ch}><div><div className={css.ct}>Customers to watch</div><div className={css.cs}><b style={{ color: 'var(--app-ink)' }}>{k?.active_customers.value}</b> active customers{k?.active_customers.previous != null && <> ({k.active_customers.value - k.active_customers.previous >= 0 ? '↑' : '↓'} {Math.abs(k.active_customers.value - k.active_customers.previous)} vs {prevShort})</>} · each compared with their own usual buying</div></div></div>
            <div className={css.cb}>
              <div className={css.fchips}>
                {[['all', 'Needs follow up', data.follow_up.rows.length], ['quiet', 'Not ordering', data.follow_up.counts.quiet], ['less', 'Buying less', data.follow_up.counts.less], ['late', 'Paying late', data.follow_up.counts.late], ['more', 'Growing', data.growing.length], ['new', 'New', data.new_customers.length]].map(([kind, text, count]) => (
                  <UnstyledButton key={kind} className={css.fchip} data-on={followKind === kind || undefined} onClick={() => setFollowKind(kind)}>{kind !== 'all' && <i className={css.fuDot} data-kind={kind} />}{text} <b>{count}</b></UnstyledButton>
                ))}
              </div>
              {!isMobile && watchRows.length > 0 && (
                <div className={`${css.fuRow} ${css.fuHead}`}><span>Customer</span><span>Why</span><span className={css.fuNum}>Overdue</span><span className={css.fuNum}>Usual / month</span><span /></div>
              )}
              <ShowMore key={`${listKey}-${followKind}`} items={watchRows} initial={8} render={(c) => {
                const shown = ['all', 'more', 'new'].includes(followKind) ? c.reasons : c.reasons.filter((x) => x.kind === followKind);
                const openIt = () => open({ kind: 'customer', id: c.customer_id, name: c.name });
                const why = shown.map((x) => {
                  const [main, ...rest] = x.text.split(' · ');
                  return <div key={x.kind} className={css.fuWhy}><i className={css.fuDot} data-kind={x.kind} title={FOLLOW_LABEL[x.kind]} /><span><b>{main}</b>{rest.length > 0 && <span className={css.sub}> · {rest.join(' · ')}</span>}</span></div>;
                });
                const actions = (
                  <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <ContactActions size="sm" name={c.name} phone={c.phone} alternatePhone={c.alternate_phone} whatsappOn={c.whatsapp_on} />
                    <Menu position="bottom-end" shadow="md" withinPortal>
                      <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`More actions for ${c.name}`}><IconDots size={16} /></ActionIcon></Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconChartPie size={15} />} onClick={openIt}>Customer insights</Menu.Item>
                        {onOpenCustomer && <Menu.Item leftSection={<IconBook2 size={15} />} onClick={() => onOpenCustomer({ id: c.customer_id, name: c.name })}>Open ledger</Menu.Item>}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                );
                const who = [c.type, c.mr].filter(Boolean).join(' · ');
                if (isMobile) {
                  return (
                    <div key={c.customer_id} role="button" tabIndex={0} className={css.fuCard} onClick={openIt} onKeyDown={(e) => { if (e.key === 'Enter') openIt(); }}>
                      <Group justify="space-between" wrap="nowrap" gap={8} align="flex-start">
                        <div style={{ minWidth: 0 }}><div className={css.nm}>{c.name}</div><div className={css.sub}>{who}</div></div>
                        <span className={css.stake}>{c.overdue > 0 ? <><b style={{ color: 'var(--app-tag-red)' }}>{lakh(c.overdue)}</b><small>overdue</small></> : <><b>{c.usual_month ? lakh(c.usual_month) : '—'}</b><small>usual / month</small></>}</span>
                      </Group>
                      <Group justify="space-between" wrap="nowrap" gap={6} align="flex-end" mt={4}>
                        <div style={{ minWidth: 0 }}>{why}</div>
                        {actions}
                      </Group>
                    </div>
                  );
                }
                return (
                  <div key={c.customer_id} role="button" tabIndex={0} className={css.fuRow} onClick={openIt} onKeyDown={(e) => { if (e.key === 'Enter') openIt(); }}>
                    <span style={{ minWidth: 0 }}><div className={css.nm}>{c.name}</div><div className={css.sub}>{who}</div></span>
                    <span style={{ minWidth: 0 }}>{why}</span>
                    <span className={css.fuNum}>{c.overdue > 0 ? <b style={{ color: 'var(--app-tag-red)' }}>{lakh(c.overdue)}</b> : <span className={css.sub}>—</span>}</span>
                    <span className={css.fuNum}>{c.usual_month ? lakh(c.usual_month) : <span className={css.sub}>—</span>}</span>
                    {actions}
                  </div>
                );
              }} />
              {!watchRows.length && empty(followKind === 'new' ? 'No new customers in this period.' : followKind === 'more' ? 'No one is buying much more than usual right now.' : 'Nobody needs a follow-up right now 🎉')}
            </div>
          </Paper>

          {data.area.show ? (
            <Paper className={`${css.card} ${css.s12}`} id="ins-area" data-section>
              <div className={css.ch}><div><div className={css.ct}>Sales by area</div><div className={css.cs}>Tap an area to filter</div></div></div>
              <div className={css.cb}>
                {areaNotSet && <div className={css.areaNote}><IconMapPin size={15} /><span><b style={{ color: 'var(--app-ink)' }}>{lakh(areaNotSet.sales)}</b> of sales is from customers with no area · set it in Customers › Edit</span></div>}
                <div className={css.areaGrid}>
                  {areaRows.slice(0, 12).map((a) => (
                    <button type="button" key={a.area} className={css.row} onClick={() => toggle(setArea, area, a.area)}>
                      <span style={{ flex: 1, minWidth: 0 }}><Group justify="space-between" wrap="nowrap"><span className={css.nm}>{a.area}</span><b className={css.num}>{lakh(a.sales)}</b></Group>
                        <div className={css.bar} style={{ height: 6 }}><i style={{ width: `${(a.sales / (areaRows[0]?.sales || 1)) * 100}%`, background: '#5c7cfa' }} /></div></span>
                    </button>
                  ))}
                </div>
              </div>
            </Paper>
          ) : (
            <div className={`${css.areaHint} ${css.s12}`}><IconMapPin size={18} /><span><b>By area</b> — shows here once most customers have an area ({data.area.coverage}% so far). Add it in Customers › Edit › More details › Area.</span></div>
          )}
        </div>
      )}
      {loading && !data && <Skeleton height={320} radius="md" />}

      <InsightsPanel
        stack={panel}
        filters={filters}
        periodLabel={periodLabel}
        scope={[type && `Type: ${listLabel(type)}`, mrId !== null && `MR: ${mrName(mrId)}`, area && `Area: ${area === NOT_SET ? 'not set' : area}`].filter(Boolean)}
        onPush={open}
        onBack={() => setPanel((stack) => stack.slice(0, -1))}
        onClose={() => setPanel([])}
        onChanged={() => setRefreshKey((v) => v + 1)}
        onOpenLedger={onOpenCustomer}
      />
    </Stack>
  );
}
