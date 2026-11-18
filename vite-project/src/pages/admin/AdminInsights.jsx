import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, SegmentedControl, Select, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconChevronRight, IconMapPin, IconTarget, IconX } from '@tabler/icons-react';
import { insightsApi } from '../../api/insightsApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import PeriodPicker from '../../components/insights/PeriodPicker';
import { describeRange, periodThing } from '../../components/filters/dateRanges';
import { formatDateLocal } from '../../utils/formatters';
import { Donut, Spark, TrendChart } from '../../components/insights/charts';
import { AGE_COLORS, lakh, MODE_COLORS, MR_COLORS, TYPE_COLORS } from '../../components/insights/insightsFormat';
import InsightsPanel from '../../components/insights/InsightsPanel';
import ShowMore from '../../components/insights/ShowMore';
import css from './AdminInsights.module.css';

const TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital', 'Other'];
const NOT_SET = '__none__';

/** Period buttons (weekly / monthly first; financial year last). */
function periods(today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = (t.getDay() + 6) % 7; // Monday = 0
  const day = (d) => formatDateLocal(d);
  const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fy = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  return [
    { id: 'week', label: 'This week', from: day(add(t, -dow)), to: day(t) },
    { id: 'lastWeek', label: 'Last week', from: day(add(t, -dow - 7)), to: day(add(t, -dow - 1)) },
    { id: 'month', label: 'This month', from: day(new Date(t.getFullYear(), t.getMonth(), 1)), to: day(t) },
    { id: 'lastMonth', label: 'Last month', from: day(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: day(new Date(t.getFullYear(), t.getMonth(), 0)) },
    { id: 'quarter', label: 'Last 3 months', from: day(new Date(t.getFullYear(), t.getMonth() - 2, 1)), to: day(t) },
    { id: 'fy', label: 'This FY', from: day(new Date(fy, 3, 1)), to: day(t) },
  ];
}

const initials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const pctLabel = (v) => (v === null || v === undefined ? '—' : `${Math.abs(v)}%`);

export default function AdminInsights({ onOpenCustomer }) {
  const isMobile = useIsMobile();
  const appRefresh = useAppRefresh();
  const [periodId, setPeriodId] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [type, setType] = useState(null);
  const [mrId, setMrId] = useState(null);
  const [area, setArea] = useState(null);
  const [trend, setTrend] = useState('monthly');
  const [result, setResult] = useState({ key: null, data: null, error: '' });
  const [panel, setPanel] = useState([]); // drill stack
  const [refreshKey, setRefreshKey] = useState(0);

  // Worked out each render, so a page left open moves on with the date.
  const presets = periods();
  const range = periodId === 'custom' ? custom : presets.find((p) => p.id === periodId);
  const periodLabel = periodId === 'custom' ? describeRange(custom) : range.label;
  const filters = {
    date_from: range.from, date_to: range.to,
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
  const pickTrend = (point) => { setCustom({ from: point.from, to: point.to }); setPeriodId('custom'); };
  const toggle = (setter, current, value) => setter(current === value ? null : value);

  const swatch = (bg, extra) => <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: bg, margin: '0 5px -1px 0', ...extra }} />;
  const legend = (
    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
      {swatch('#2f9e44')}Recovered {swatch('#d3f9d8', { marginLeft: 8, border: '1px solid #b2f2bb' })}Pending {swatch('#1c7ed6', { width: 12, height: 3, marginLeft: 8, verticalAlign: 3 })}All collections
    </Text>
  );
  const periodPicker = (
    <PeriodPicker presets={presets} periodId={periodId} custom={custom} label={periodLabel} fullWidth={isMobile}
      onPreset={setPeriodId} onCustom={(next) => { setCustom(next); setPeriodId('custom'); }} />
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

  const kpi = (key, label, value, { good = 'up', color, kind, suffix = '%', note } = {}) => {
    const item = k?.[key];
    const change = item?.change;
    const better = change === null || change === undefined ? null : (good === 'up' ? change >= 0 : change <= 0);
    return (
      <button type="button" key={key} className={`${css.card} ${css.kpi} ${kind ? css.clickable : ''}`} onClick={kind ? () => openFresh({ kind: 'records', records: kind, title: label }) : undefined} style={kind ? undefined : { cursor: 'default' }}>
        <div className={css.kl}>{label}{kind && <IconChevronRight size={14} color="#adb5bd" />}</div>
        {loading && !data ? <Skeleton height={28} width={120} mt={6} /> : <div className={css.kv}>{value}</div>}
        {note && data && <div className={css.note}>{note}</div>}
        <div className={css.kf}>
          <span>{change === null || change === undefined ? 'no earlier data' : <><span className={better ? css.up : css.down}>{change >= 0 ? '↑' : '↓'} {suffix === '%' ? pctLabel(change) : `${Math.abs(change)}${suffix}`}</span> vs before</>}</span>
          <Spark values={item?.spark || []} color={color} />
        </div>
      </button>
    );
  };

  const typeTotal = (data?.by_type || []).reduce((sum, row) => sum + row.sales, 0);
  const mrMax = Math.max(...(data?.by_mr.rows || []).map((r) => Math.max(r.sales, r.collected)), 1);
  const ageTotal = (data?.ageing || []).reduce((sum, row) => sum + row.amount, 0);
  const modeTotal = (data?.payment_modes || []).reduce((sum, row) => sum + Math.max(row.amount, 0), 0);
  const areaOptions = data?.area.areas?.length ? [...data.area.areas.map((a) => ({ value: a, label: a })), { value: NOT_SET, label: 'Not set' }] : [];

  return (
    <Stack gap="md">
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
      <Text size="sm" c="dimmed" mt={-8}>Overview › <Text span fw={600} c="dark">{[periodLabel, type, mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean).join(' › ')}</Text></Text>

      {error && <Alert color="red">{error}</Alert>}

      <div className={css.kpis}>
        {kpi('sales', 'Sales', lakh(k?.sales.value), { color: '#2f9e44', kind: 'sales' })}
        {kpi('collected', 'Collected', lakh(k?.collected.value), { color: '#1c7ed6', kind: 'collected' })}
        {kpi('outstanding', 'Outstanding', lakh(k?.outstanding.value), { good: 'down', color: '#e03131', kind: 'outstanding' })}
        {kpi('days_to_collect', 'Avg days to collect', k?.days_to_collect.value === null || k?.days_to_collect.value === undefined ? '—' : `${k.days_to_collect.value} days`, { good: 'down', color: '#f08c00', suffix: ' d' })}
        {kpi('active_customers', 'Active customers', k?.active_customers.value ?? '—', { color: '#7048e8', kind: 'active' })}
      </div>

      {data && (
        <div className={css.grid} style={loading ? { opacity: 0.6, transition: 'opacity .2s' } : undefined}>
          <Paper className={`${css.card} ${css.s8}`}>
            <div className={css.ch}>
              <div><div className={css.ct}>Sales vs collections</div><div className={css.cs}>Tap a bar to see that {trend === 'weekly' ? 'week' : 'month'}</div></div>
              <Group gap={10} wrap="nowrap">
                {!isMobile && legend}
                <SegmentedControl size="xs" value={trend} onChange={setTrend} data={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
              </Group>
            </div>
            <div className={css.cb}>
              {isMobile && <div style={{ marginBottom: 6 }}>{legend}</div>}
              <TrendChart points={data.trend.points} selected={range} onPick={pickTrend} />
              {/* What came in against this period's sales, and what came from older bills. */}
              {k && (
                <div className={css.recovery}>
                  <div><span>Recovered · {periodThing(periodLabel, 'sales')}</span><b className={css.green}>{lakh(k.sales.recovered)}{k.sales.value > 0 && <small> · {Math.round((k.sales.recovered / k.sales.value) * 100)}%</small>}</b></div>
                  <div><span>Pending · {periodThing(periodLabel, 'sales')}</span><b className={css.red}>{lakh(Math.max(k.sales.value - k.sales.recovered, 0))}</b></div>
                  {k.collected.older !== null && k.collected.older !== undefined && <div><span>Collected · older bills</span><b>{lakh(k.collected.older)}</b></div>}
                </div>
              )}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`}>
            <div className={css.ch}><div><div className={css.ct}>Sales by customer type</div><div className={css.cs}>Tap a type to filter</div></div></div>
            <div className={css.cb} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Donut rows={data.by_type.map((r) => ({ key: r.type, value: r.sales, color: TYPE_COLORS[r.type] }))} total={typeTotal} active={type} onPick={(t) => toggle(setType, type, t)} />
              <div className={css.legend} style={{ flex: 1, minWidth: 200 }}>
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

          <Paper className={`${css.card} ${css.s12}`}>
            <div className={css.ch}><div><div className={css.ct}>Outstanding by age</div><div className={css.cs}>As of today · tap a bucket</div></div><div className={css.big}>{lakh(ageTotal)}</div></div>
            <div className={css.cb}>
              <div className={css.stack}>{data.ageing.map((a) => <i key={a.bucket} title={`${a.bucket} days`} style={{ width: `${ageTotal ? (a.amount / ageTotal) * 100 : 0}%`, background: AGE_COLORS[a.bucket] }} onClick={() => openFresh({ kind: 'records', records: 'age', bucket: a.bucket, title: `Outstanding ${a.bucket} days` })} />)}</div>
              {data.ageing.map((a) => (
                <button type="button" key={a.bucket} className={css.bucket} onClick={() => openFresh({ kind: 'records', records: 'age', bucket: a.bucket, title: `Outstanding ${a.bucket} days` })}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: AGE_COLORS[a.bucket], flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{a.bucket} days<span className={css.sub}> · {a.customers} customers</span></span>
                  <b className={css.num}>{lakh(a.amount)}</b><span className={css.sub} style={{ width: 36, textAlign: 'right' }}>{ageTotal ? Math.round((a.amount / ageTotal) * 100) : 0}%</span>
                </button>
              ))}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}>
              <div><div className={css.ct}>By MR</div><div className={css.cs}>Tap to filter · target bars are for this month</div></div>
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
                        {pct !== null && <span className={css.sub}>Target <b style={{ color: pct >= 100 ? '#2b8a3e' : pct >= 70 ? '#1a1d21' : '#e03131' }}>{pct}%</b> of {lakh(r.sales_target)} · {data.by_mr.days_left} days left</span>}
                      </Group>
                    </span>
                  </button>
                );
              })}
              {!data.by_mr.rows.length && empty('No MR sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Top customers</div><div className={css.cs}>Top 10 = <b style={{ color: '#1a1d21' }}>{data.top_customers.top10_share}%</b> of sales</div></div></div>
            <div className={css.cb}>
              {data.top_customers.dependence && <div className={css.warn}>⚠️ <span><b>{data.top_customers.dependence.name}</b> alone is <b>{Math.round(data.top_customers.dependence.share)}%</b> of sales — a lot riding on one customer.</span></div>}
              <ShowMore key={listKey} items={data.top_customers.rows} initial={8} render={(c) => custRow(c, <span style={{ width: 120, textAlign: 'right' }}><b className={css.num}>{lakh(c.sales)}</b><div className={css.bar}><i style={{ width: `${(c.sales / data.top_customers.rows[0].sales) * 100}%`, background: TYPE_COLORS[c.type] }} /></div></span>)} />
              {!data.top_customers.rows.length && empty('No sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Movers</div><div className={css.cs}>Compared with the period before</div></div></div>
            <div className={`${css.cb} ${css.two}`}>
              <div><div className={css.mini}>Growing</div><ShowMore key={listKey} items={data.movers.growing} render={(c) => custRow(c, <Badge color="green" variant="light">↑ {c.growth}%</Badge>)} />{!data.movers.growing.length && empty('—')}</div>
              <div><div className={css.mini}>Declining</div><ShowMore key={listKey} items={data.movers.declining} render={(c) => custRow(c, <Badge color="red" variant="light">↓ {Math.abs(c.growth)}%</Badge>)} />{!data.movers.declining.length && empty('—')}</div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>New and stopped customers</div><div className={css.cs}>{periodLabel} vs the period before</div></div></div>
            <div className={css.cb}>
              <div className={css.counts}>
                <div style={{ background: '#ebfbee' }}><div className={css.sub}>New</div><div className={css.big} style={{ color: '#2b8a3e' }}>{data.new_and_stopped.new_count ? `+${data.new_and_stopped.new_count}` : 0}</div></div>
                <div style={{ background: '#fff0f0' }}><div className={css.sub}>Stopped ordering</div><div className={css.big} style={{ color: '#e03131' }}>{data.new_and_stopped.stopped_count ? `−${data.new_and_stopped.stopped_count}` : 0}</div></div>
              </div>
              <div className={css.two}>
                <div><div className={css.mini}>New</div><ShowMore key={listKey} items={data.new_and_stopped.new} initial={4} render={(c) => custRow(c, null, `${[c.type, c.mr].filter(Boolean).join(' · ')} · first order`)} />{!data.new_and_stopped.new_count && empty('None')}</div>
                <div><div className={css.mini}>Stopped</div><ShowMore key={listKey} items={data.new_and_stopped.stopped} initial={4} render={(c) => custRow(c, null, `${[c.type, c.mr].filter(Boolean).join(' · ')} · bought before`)} />{!data.new_and_stopped.stopped_count && empty('None')}</div>
              </div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Payment speed</div><div className={css.cs}>Average days from invoice to paid · last 6 months</div></div></div>
            <div className={`${css.cb} ${css.two}`}>
              <div><div className={css.mini}>Fastest</div><ShowMore key={listKey} items={data.payment_speed.fastest} render={(c) => custRow(c, <Badge color="green" variant="light">{c.days} d</Badge>)} />{!data.payment_speed.fastest.length && empty('Not enough payments yet.')}</div>
              <div><div className={css.mini}>Slowest</div><ShowMore key={listKey} items={data.payment_speed.slowest} render={(c) => custRow(c, <Badge color={c.days > 40 ? 'red' : 'orange'} variant="light">{c.days} d</Badge>)} />{!data.payment_speed.slowest.length && empty('Not enough payments yet.')}</div>
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Risky credit</div><div className={css.cs}>Slow payers who owe money, or reversed / bounced payments</div></div></div>
            <div className={css.cb}>
              <ShowMore key={listKey} items={data.risky_credit} initial={6} render={(c) => custRow(c, (
                <span style={{ textAlign: 'right' }}><b className={css.num}>{lakh(c.outstanding)}</b>
                  <Group gap={4} justify="flex-end" mt={3} wrap="nowrap">{c.days > 40 && <Badge size="sm" color="orange" variant="light">{c.days} d</Badge>}{c.reversals > 0 && <Badge size="sm" color="red" variant="light">{c.reversals} reversed</Badge>}</Group>
                </span>
              ))} />
              {!data.risky_credit.length && empty('Nobody risky right now 🎉')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s8}`}>
            <div className={css.ch}><div><div className={css.ct}>At risk</div><div className={css.cs}>Regular buyers who have gone quiet</div></div></div>
            <div className={css.cb}>
              <ShowMore key={listKey} items={data.at_risk} initial={6} render={(c) => custRow(c, <Badge color="orange" variant="light">No order for {c.days_since} d</Badge>, `${[c.type, c.mr].filter(Boolean).join(' · ')} · usually every ${c.usual_gap} days`)} />
              {!data.at_risk.length && empty('Nobody at risk 🎉')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`}>
            <div className={css.ch}><div><div className={css.ct}>How customers pay</div><div className={css.cs}>Collected in {periodLabel?.toLowerCase()}</div></div></div>
            <div className={css.cb}>
              {data.payment_modes.map((m) => (
                <div key={m.mode} style={{ padding: '7px 0' }}>
                  <Group justify="space-between" wrap="nowrap"><Text size="sm"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: MODE_COLORS[m.mode] || '#868e96', marginRight: 7 }} />{m.mode === 'Upi' ? 'UPI' : m.mode}</Text><Text size="sm"><b className={css.num}>{lakh(m.amount)}</b> <span className={css.sub}>{modeTotal ? Math.round((Math.max(m.amount, 0) / modeTotal) * 100) : 0}%</span></Text></Group>
                  <div className={css.bar}><i style={{ width: `${modeTotal ? (Math.max(m.amount, 0) / modeTotal) * 100 : 0}%`, background: MODE_COLORS[m.mode] || '#868e96' }} /></div>
                </div>
              ))}
              {!data.payment_modes.length && empty('No collections in this period.')}
            </div>
          </Paper>

          {data.area.show ? (
            <Paper className={`${css.card} ${css.s12}`}>
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
