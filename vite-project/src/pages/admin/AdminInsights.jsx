import SectionNav from '../../components/common/SectionNav';
import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Menu, Paper, SegmentedControl, Select, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconBook2, IconChartPie, IconChevronRight, IconDots, IconMapPin, IconTarget, IconX } from '@tabler/icons-react';
import ContactActions from '../../components/customers/ContactActions';
import { insightsApi } from '../../api/insightsApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import PeriodPicker from '../../components/insights/PeriodPicker';
import { businessPeriods, describeRange, isCustomRange, last15Range, shortRange } from '../../components/filters/dateRanges';
import { Donut, Spark, TrendChart } from '../../components/insights/charts';
import { AGE_COLORS, AGE_LABELS, lakh, MODE_COLORS, MR_COLORS, TYPE_COLORS } from '../../components/insights/insightsFormat';
import InsightsPanel from '../../components/insights/InsightsPanel';
import ShowMore from '../../components/insights/ShowMore';
import css from './AdminInsights.module.css';
import { formatDateLocal, shortDate } from '../../utils/formatters';

const TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital', 'Other'];
const NOT_SET = '__none__';

const initials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const FOLLOW_LABEL = { quiet: 'Not ordering', less: 'Buying less', late: 'Paying late' };
const pctLabel = (v) => (v === null || v === undefined ? '—' : `${Math.abs(v)}%`);

// "Jump to section" (right-edge dots on laptop, chips on phone).
const INSIGHT_SECTIONS = [
  { id: 'ins-summary', label: 'Summary' },
  { id: 'ins-types', label: 'By customer type' },
  { id: 'ins-trend', label: 'Sales vs collections' },
  { id: 'ins-owed', label: 'Money owed' },
  { id: 'ins-mr', label: 'By MR' },
  { id: 'ins-top', label: 'Top customers' },
  { id: 'ins-follow', label: 'Follow up' },
  { id: 'ins-more', label: 'New & payments' },
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
    type && { key: 'type', label: type, clear: () => setType(null) },
    mrId !== null && { key: 'mr', label: `MR: ${mrName(mrId)}`, clear: () => setMrId(null) },
    area && { key: 'area', label: `Area: ${area === NOT_SET ? 'Not set' : area}`, clear: () => setArea(null) },
  ].filter(Boolean);
  const clearAll = () => { setType(null); setMrId(null); setArea(null); };
  const pickTrend = (point) => pickRange(point);
  // What every "vs …" compares against, named (e.g. "1–18 Oct", "Sep 2026").
  const prevShort = result.data ? shortRange({ from: result.data.range.previous_from, to: result.data.range.previous_to }) : 'before';
  const toggle = (setter, current, value) => setter(current === value ? null : value);

  const swatch = (bg, extra) => <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: bg, margin: '0 5px -1px 0', ...extra }} />;
  const legend = (
    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
      {swatch('#2f9e44')}Recovered {swatch('var(--app-pending)', { marginLeft: 8, border: '1px solid var(--app-pending-line)' })}Pending {swatch('#1c7ed6', { width: 12, height: 3, marginLeft: 8, verticalAlign: 3 })}All collections
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
  const kpi = (key, label, value, { good = 'up', color, kind, open: openItem, suffix = '%', note, foot, count } = {}) => {
    const item = k?.[key];
    const diff = count && item?.previous !== null && item?.previous !== undefined ? (item.value || 0) - (item.previous || 0) : null;
    const change = count ? diff : item?.change;
    const better = change === null || change === undefined ? null : (good === 'up' ? change >= 0 : change <= 0);
    return (
      <button type="button" key={key} className={`${css.card} ${css.kpi} ${kind ? css.clickable : ''}`} onClick={openItem ? () => openFresh(openItem) : kind ? () => openFresh({ kind: 'records', records: kind, title: label }) : undefined} style={kind || openItem ? undefined : { cursor: 'default' }}>
        <div className={css.kl}>{label}{(kind || openItem) && <IconChevronRight size={14} color="var(--app-faint)" />}</div>
        {loading && !data ? <Skeleton height={28} width={120} mt={6} /> : <div className={css.kv}>{value}</div>}
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
  const owedByType = [...(data?.owed_by_type || [])].sort((x, y) => y.owed - x.owed);
  const owedTotal = owedByType.reduce((sum, row) => sum + row.owed, 0);
  // Tap a slice / row: every unpaid bill of that type, oldest first.
  const openOwed = (t) => openFresh({ kind: 'records', records: 'outstanding', customerType: t, title: `Owed by ${t === 'Other' ? 'other customers' : `${t.toLowerCase()}s`}` });
  const mrMax = Math.max(...(data?.by_mr.rows || []).map((r) => Math.max(r.sales, r.collected)), 1);
  const ageTotal = (data?.ageing || []).reduce((sum, row) => sum + row.amount, 0);
  const modeTotal = (data?.payment_modes || []).reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const areaOptions = data?.area.areas?.length ? [...data.area.areas.map((a) => ({ value: a, label: a })), { value: NOT_SET, label: 'Not set' }] : [];

  return (
    <Stack gap="md">
      <SectionNav watch={data} sections={INSIGHT_SECTIONS} />
      <Group justify="space-between" align="center" gap="sm">
        <Title order={1}>Insights</Title>
        {isMobile ? <div style={{ width: '100%' }}>{periodPicker}</div> : periodPicker}
      </Group>

      <Group gap={8} wrap="wrap">
        <Select size="sm" w={isMobile ? '48%' : 170} placeholder="All types" clearable data={TYPES} value={type} onChange={setType} aria-label="Customer type" />
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
      <Text size="sm" c="dimmed" mt={-8}>Overview › <Text span fw={600} c="var(--app-ink)">{[periodLabel, type, mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean).join(' › ')}</Text></Text>

      {error && <Alert color="red">{error}</Alert>}

      <div className={css.kpis} id="ins-summary" data-section>
        {kpi('sales', 'Sales', lakh(k?.sales.value), { color: '#2f9e44', kind: 'sales' })}
        {kpi('collected', 'Collected', lakh(k?.collected.value), { color: '#1c7ed6', kind: 'collected' })}
        {kpi('outstanding', 'Owed to you today', lakh(k?.outstanding.value), { color: '#e03131', kind: 'outstanding',
          foot: k && <span><b className={css.down}>{lakh(k.outstanding.overdue)}</b> of it overdue</span> })}
        {kpi('active_customers', 'Active customers', k?.active_customers.value ?? '—', { color: '#7048e8', open: { kind: 'change' }, count: 'customer' })}
      </div>

      {data && (
        <div className={css.grid} style={loading ? { opacity: 0.6, transition: 'opacity .2s' } : undefined}>
          {/* Two donuts side by side: what each customer type buys, and what it owes today. */}
          <Paper className={`${css.card} ${css.s6}`} id="ins-types" data-section>
            <div className={css.ch}><div><div className={css.ct}>Sales by customer type</div><div className={css.cs}>{allTime ? 'Since the start' : periodLabel} · tap a type to filter</div></div></div>
            <div className={`${css.cb} ${css.donutBody}`}>
              <Donut size={isMobile ? 168 : 188} rows={data.by_type.map((r) => ({ key: r.type, value: r.sales, color: TYPE_COLORS[r.type] }))} total={typeTotal} active={type} onPick={(t) => toggle(setType, type, t)} />
              <div className={css.legend} style={{ flex: 1, minWidth: 0 }}>
                {data.by_type.filter((r) => r.sales > 0 || r.type === type).map((r) => (
                  <button type="button" key={r.type} className={type === r.type ? css.on : undefined} onClick={() => toggle(setType, type, r.type)}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[r.type], flexShrink: 0 }} />{r.type}
                    <b className={css.num} style={{ marginLeft: 'auto' }}>{lakh(r.sales)}</b>
                    <span className={css.sub} style={{ width: 34, textAlign: 'right' }}>{typeTotal ? Math.round((r.sales / typeTotal) * 100) : 0}%</span>
                  </button>
                ))}
                {!typeTotal && empty('No sales in this period.')}
              </div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Owed to you by customer type</div><div className={css.cs}>As of today · tap a type for its bills</div></div></div>
            <div className={`${css.cb} ${css.donutBody}`}>
              <Donut size={isMobile ? 168 : 188} centerLabel="Owed" unit="of what's owed" label="Owed to you by customer type"
                rows={owedByType.map((r) => ({ key: r.type, value: r.owed, color: TYPE_COLORS[r.type] }))} total={owedTotal} active={type} onPick={openOwed} />
              <div className={css.legend} style={{ flex: 1, minWidth: 0 }}>
                {owedByType.filter((r) => r.owed > 0).map((r) => (
                  <button type="button" key={r.type} className={type === r.type ? css.on : undefined} onClick={() => openOwed(r.type)}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[r.type], flexShrink: 0 }} />
                    <span style={{ minWidth: 0, textAlign: 'left' }}>{r.type}<span className={css.sub} style={{ display: 'block' }}>{r.customers} {r.customers === 1 ? 'customer' : 'customers'}</span></span>
                    <b className={css.num} style={{ marginLeft: 'auto' }}>{lakh(r.owed)}</b>
                    <span className={css.sub} style={{ width: 34, textAlign: 'right' }}>{owedTotal ? Math.round((r.owed / owedTotal) * 100) : 0}%</span>
                  </button>
                ))}
                {!owedTotal && empty('Nothing owed right now 🎉')}
              </div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`} id="ins-trend" data-section>
            <div className={css.ch}>
              <div><div className={css.ct}>Sales vs collections</div><div className={css.cs}>{isMobile ? 'Tap a bar for its numbers' : 'Hover a bar for its numbers · click to open it'}</div></div>
              <Group gap={10} wrap="nowrap">
                {!isMobile && legend}
                <SegmentedControl size="xs" value={trend} onChange={setTrend} data={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
              </Group>
            </div>
            <div className={css.cb}>
              {isMobile && <div style={{ marginBottom: 6 }}>{legend}</div>}
              <TrendChart points={data.trend.points} selected={allTime ? null : range} onPick={pickTrend} weekly={trend === 'weekly'} wide={!isMobile} />
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`} id="ins-owed" data-section>
            <div className={css.ch}><div><div className={css.ct}>Money owed to you</div><div className={css.cs}>As of today · by age of the bill · tap a row</div></div><div className={css.big}>{lakh(ageTotal)}</div></div>
            <div className={css.cb}>
              <div className={css.stack}>{data.ageing.map((a) => <i key={a.bucket} title={AGE_LABELS[a.bucket]} style={{ width: `${ageTotal ? (a.amount / ageTotal) * 100 : 0}%`, background: AGE_COLORS[a.bucket] }} onClick={() => openFresh({ kind: 'records', records: 'age', bucket: a.bucket, title: AGE_LABELS[a.bucket] })} />)}</div>
              {data.ageing.map((a) => (
                <button type="button" key={a.bucket} className={css.bucket} onClick={() => openFresh({ kind: 'records', records: 'age', bucket: a.bucket, title: AGE_LABELS[a.bucket] })}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: AGE_COLORS[a.bucket], flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{AGE_LABELS[a.bucket]}<span className={css.sub} style={{ display: 'block' }}>{a.customers} {a.customers === 1 ? 'customer' : 'customers'}</span></span>
                  <b className={css.num} style={{ whiteSpace: 'nowrap' }}>{lakh(a.amount)}</b><span className={css.sub} style={{ width: 36, textAlign: 'right' }}>{ageTotal ? Math.round((a.amount / ageTotal) * 100) : 0}%</span>
                </button>
              ))}
              <div className={css.sub} style={{ marginTop: 6, paddingInline: 6 }}>Chemists & doctors are overdue after 40 days, distributors after 60.</div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`} id="ins-mr" data-section>
            <div className={css.ch}>
              <div><div className={css.ct}>By MR</div><div className={css.cs}>Tap to filter · targets for {data.by_mr.month_label}</div></div>
              <Button size="compact-sm" variant="default" leftSection={<IconTarget size={14} />} onClick={() => openFresh({ kind: 'targets' })}>Set targets</Button>
            </div>
            <div className={css.cb}>
              {data.by_mr.rows.map((r, index) => {
                const color = r.mr_id ? MR_COLORS[index % MR_COLORS.length] : '#868e96';
                const pct = r.sales_target ? Math.round(((r.month_sales || 0) / r.sales_target) * 100) : null;
                return (
                  <button type="button" key={r.mr_id} className={css.row} onClick={() => toggle(setMrId, mrId, r.mr_id)} style={mrId !== null && mrId !== r.mr_id ? { opacity: 0.4 } : undefined}>
                    <span className={css.ini} style={{ background: `${color}22`, color }}>{r.name[0]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <Group justify="space-between" wrap="nowrap"><span className={css.nm}>{r.name}</span><b className={css.num}>{lakh(r.sales)}</b></Group>
                      <div className={css.bar}><i style={{ width: `${(r.sales / mrMax) * 100}%`, background: '#2f9e44' }} /></div>
                      <div className={css.bar} style={{ height: 5, marginTop: 3 }}><i style={{ width: `${(Math.max(r.collected, 0) / mrMax) * 100}%`, background: '#1c7ed6' }} /></div>
                      <Group justify="space-between" mt={3} wrap="nowrap" gap={6}>
                        <span className={css.sub}>Collected {lakh(r.collected)}</span>
                        {pct !== null && <span className={css.sub}>Target <b style={{ color: pct >= 100 ? '#2b8a3e' : pct >= 70 ? 'var(--app-ink)' : '#e03131' }}>{pct}%</b> of {lakh(r.sales_target)}{data.by_mr.current_month ? ` · ${data.by_mr.days_left} days left` : ''}</span>}
                      </Group>
                    </span>
                  </button>
                );
              })}
              {!data.by_mr.rows.length && empty('No MR sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`} id="ins-top" data-section>
            <div className={css.ch}><div><div className={css.ct}>Top customers</div><div className={css.cs}>Top 10 = <b style={{ color: 'var(--app-ink)' }}>{data.top_customers.top10_share}%</b> of sales</div></div></div>
            <div className={css.cb}>
              {data.top_customers.dependence && <div className={css.warn}>⚠️ <span><b>{data.top_customers.dependence.name}</b> alone is <b>{Math.round(data.top_customers.dependence.share)}%</b> of sales — a lot riding on one customer.</span></div>}
              <ShowMore key={listKey} items={data.top_customers.rows} initial={8} render={(c) => custRow(c, <span style={{ width: 120, textAlign: 'right' }}><b className={css.num}>{lakh(c.sales)}</b><div className={css.bar}><i style={{ width: `${(c.sales / data.top_customers.rows[0].sales) * 100}%`, background: TYPE_COLORS[c.type] }} /></div></span>)} />
              {!data.top_customers.rows.length && empty('No sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`} id="ins-follow" data-section>
            <div className={css.ch}><div><div className={css.ct}>Customers to follow up</div><div className={css.cs}>As of today · each compared with their own usual buying · biggest money first</div></div></div>
            <div className={css.cb}>
              <div className={css.fchips}>
                {[['all', 'All', data.follow_up.rows.length], ['quiet', 'Not ordering', data.follow_up.counts.quiet], ['less', 'Buying less', data.follow_up.counts.less], ['late', 'Paying late', data.follow_up.counts.late]].map(([kind, text, count]) => (
                  <UnstyledButton key={kind} className={css.fchip} data-on={followKind === kind || undefined} onClick={() => setFollowKind(kind)}>{kind !== 'all' && <i className={css.fuDot} data-kind={kind} />}{text} <b>{count}</b></UnstyledButton>
                ))}
              </div>
              {/* Laptop: one row per customer in aligned columns; phone: compact cards. */}
              {!isMobile && data.follow_up.rows.length > 0 && (
                <div className={`${css.fuRow} ${css.fuHead}`}><span>Customer</span><span>Why</span><span className={css.fuNum}>Overdue</span><span className={css.fuNum}>Usual / month</span><span /></div>
              )}
              <ShowMore key={`${listKey}-${followKind}`} items={data.follow_up.rows.filter((r) => followKind === 'all' || r.reasons.some((x) => x.kind === followKind))} initial={8} render={(c) => {
                const shown = followKind === 'all' ? c.reasons : c.reasons.filter((x) => x.kind === followKind);
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
                        <span className={css.stake}>{c.overdue > 0 ? <><b style={{ color: 'var(--app-tag-red)' }}>{lakh(c.overdue)}</b><small>overdue</small></> : <><b>{lakh(c.usual_month)}</b><small>usual / month</small></>}</span>
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
              {!data.follow_up.rows.length && empty('Nobody needs a follow-up right now 🎉')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`} id="ins-more" data-section>
            <div className={css.ch}><div><div className={css.ct}>Buying more than usual</div><div className={css.cs}>Lately vs their usual month</div></div></div>
            <div className={css.cb}>
              <ShowMore key={listKey} items={data.growing} initial={5} render={(c) => custRow(c, <span className={css.stake}><b className={css.green}>+{lakh(c.change)}</b><small>a month</small></span>)} />
              {!data.growing.length && empty('No one is buying much more than usual right now.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`}>
            <div className={css.ch}><div><div className={css.ct}>New customers</div><div className={css.cs}>First order {allTime ? 'since the start' : `in ${periodLabel}`}</div></div></div>
            <div className={css.cb}>
              <ShowMore key={listKey} items={data.new_customers} initial={5} render={(c) => custRow(c, <span className={css.stake}><b>{lakh(c.sales)}</b><small>{shortDate(c.first_order)}</small></span>)} />
              {!data.new_customers.length && empty('No new customers in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`}>
            <div className={css.ch}><div><div className={css.ct}>How customers pay</div><div className={css.cs}>Collected {allTime ? 'since the start' : `in ${periodLabel}`}</div></div></div>
            <div className={css.cb}>
              {data.payment_modes.map((m) => {
                const share = modeTotal ? Math.round((Math.max(m.amount, 0) / modeTotal) * 100) : 0;
                // Tap a payment type: every collection behind it (side panel).
                return (
                  <button type="button" key={m.mode} className={css.bucket} style={{ display: 'block', padding: '7px 6px' }} aria-label={`See ${m.mode} collections`}
                    onClick={() => openFresh({ kind: 'mode', mode: m.mode, share, scope: [type, mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean) })}>
                    <Group justify="space-between" wrap="nowrap"><Text size="sm"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: MODE_COLORS[m.mode] || '#868e96', marginRight: 7 }} />{m.mode}</Text><Text size="sm"><b className={css.num}>{lakh(m.amount)}</b> <span className={css.sub}>{share}%</span></Text></Group>
                    <div className={css.bar}><i style={{ width: `${share}%`, background: MODE_COLORS[m.mode] || '#868e96' }} /></div>
                  </button>
                );
              })}
              {!data.payment_modes.length && empty('No collections in this period.')}
            </div>
          </Paper>

          {data.area.show ? (
            <Paper className={`${css.card} ${css.s12}`} id="ins-area" data-section>
              <div className={css.ch}><div><div className={css.ct}>Sales by area</div><div className={css.cs}>Tap an area to filter</div></div></div>
              <div className={css.cb}>
                {data.area.rows.slice(0, 12).map((a) => (
                  <button type="button" key={a.area} className={css.row} onClick={() => toggle(setArea, area, a.area)}>
                    <IconMapPin size={16} color="#868e96" />
                    <span style={{ flex: 1, minWidth: 0 }}><Group justify="space-between" wrap="nowrap"><span className={css.nm}>{a.area === NOT_SET ? 'Not set' : a.area}</span><b className={css.num}>{lakh(a.sales)}</b></Group>
                      <div className={css.bar}><i style={{ width: `${(a.sales / (data.area.rows[0]?.sales || 1)) * 100}%`, background: '#1c7ed6' }} /></div></span>
                  </button>
                ))}
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
        onPush={open}
        onBack={() => setPanel((stack) => stack.slice(0, -1))}
        onClose={() => setPanel([])}
        onChanged={() => setRefreshKey((v) => v + 1)}
        onOpenLedger={onOpenCustomer}
      />
    </Stack>
  );
}
