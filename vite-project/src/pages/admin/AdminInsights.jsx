import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, SegmentedControl, Select, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconMapPin, IconTarget, IconX } from '@tabler/icons-react';
import { insightsApi } from '../../api/insightsApi';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAppRefresh } from '../../hooks/useAppRefresh';
import PeriodPicker from '../../components/insights/PeriodPicker';
import { businessPeriods, describeRange, isCustomRange, shortRange } from '../../components/filters/dateRanges';
import { Donut, Spark, TrendChart } from '../../components/insights/charts';
import { AGE_COLORS, AGE_LABELS, lakh, MODE_COLORS, MR_COLORS, TYPE_COLORS } from '../../components/insights/insightsFormat';
import InsightsPanel from '../../components/insights/InsightsPanel';
import ShowMore from '../../components/insights/ShowMore';
import css from './AdminInsights.module.css';
import { shortDate } from '../../utils/formatters';

const TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital', 'Other'];
const NOT_SET = '__none__';

const initials = (name = '') => name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const FOLLOW_LABEL = { quiet: 'Not ordering', less: 'Buying less', late: 'Paying late' };
const pctLabel = (v) => (v === null || v === undefined ? '—' : `${Math.abs(v)}%`);

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
  const periodPicker = (
    <PeriodPicker value={range} firstDate={result.data?.first_invoice_date} label={periodLabel} fullWidth={isMobile} onPick={pickRange}
      isCustom={!allTime && isCustomRange(range)} chips={[{ id: 'all', label: 'All time', from: '', to: '', all: true }]} />
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

  const kpi = (key, label, value, { good = 'up', color, kind, suffix = '%', note, foot } = {}) => {
    const item = k?.[key];
    const change = item?.change;
    const better = change === null || change === undefined ? null : (good === 'up' ? change >= 0 : change <= 0);
    return (
      <button type="button" key={key} className={`${css.card} ${css.kpi} ${kind ? css.clickable : ''}`} onClick={kind ? () => openFresh({ kind: 'records', records: kind, title: label }) : undefined} style={kind ? undefined : { cursor: 'default' }}>
        <div className={css.kl}>{label}{kind && <IconChevronRight size={14} color="var(--app-faint)" />}</div>
        {loading && !data ? <Skeleton height={28} width={120} mt={6} /> : <div className={css.kv}>{value}</div>}
        {note && data && <div className={css.note}>{note}</div>}
        {foot ? <div className={css.kf}>{data && foot}</div> : <div className={css.kf}>
          <span>{change === null || change === undefined ? (allTime ? sinceText : 'no earlier data') : <><span className={better ? css.up : css.down}>{change >= 0 ? '↑' : '↓'} {suffix === '%' ? pctLabel(change) : `${Math.abs(change)}${suffix}`}</span></>}</span>
          <Spark values={item?.spark || []} color={color} />
        </div>}
        {!foot && data && change !== null && change !== undefined && <div className={css.vs}>vs {prevShort}</div>}
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
      <Text size="sm" c="dimmed" mt={-8}>Overview › <Text span fw={600} c="var(--app-ink)">{[periodLabel, type, mrId !== null && mrName(mrId), area && (area === NOT_SET ? 'No area' : area)].filter(Boolean).join(' › ')}</Text></Text>

      {error && <Alert color="red">{error}</Alert>}

      <div className={css.kpis}>
        {kpi('sales', 'Sales', lakh(k?.sales.value), { color: '#2f9e44', kind: 'sales' })}
        {kpi('collected', 'Collected', lakh(k?.collected.value), { color: '#1c7ed6', kind: 'collected' })}
        {kpi('outstanding', 'Owed to you today', lakh(k?.outstanding.value), { color: '#e03131', kind: 'outstanding',
          foot: k && <span><b className={css.down}>{lakh(k.outstanding.overdue)}</b> of it overdue</span> })}
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

          <Paper className={`${css.card} ${css.s6}`}>
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

          <Paper className={`${css.card} ${css.s6}`}>
            <div className={css.ch}><div><div className={css.ct}>Top customers</div><div className={css.cs}>Top 10 = <b style={{ color: 'var(--app-ink)' }}>{data.top_customers.top10_share}%</b> of sales</div></div></div>
            <div className={css.cb}>
              {data.top_customers.dependence && <div className={css.warn}>⚠️ <span><b>{data.top_customers.dependence.name}</b> alone is <b>{Math.round(data.top_customers.dependence.share)}%</b> of sales — a lot riding on one customer.</span></div>}
              <ShowMore key={listKey} items={data.top_customers.rows} initial={8} render={(c) => custRow(c, <span style={{ width: 120, textAlign: 'right' }}><b className={css.num}>{lakh(c.sales)}</b><div className={css.bar}><i style={{ width: `${(c.sales / data.top_customers.rows[0].sales) * 100}%`, background: TYPE_COLORS[c.type] }} /></div></span>)} />
              {!data.top_customers.rows.length && empty('No sales in this period.')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s12}`}>
            <div className={css.ch}><div><div className={css.ct}>Customers to follow up</div><div className={css.cs}>As of today · each compared with their own usual buying · biggest money first</div></div></div>
            <div className={css.cb}>
              <div className={css.fchips}>
                {[['all', 'All', data.follow_up.rows.length], ['quiet', 'Not ordering', data.follow_up.counts.quiet], ['less', 'Buying less', data.follow_up.counts.less], ['late', 'Paying late', data.follow_up.counts.late]].map(([kind, text, count]) => (
                  <UnstyledButton key={kind} className={css.fchip} data-on={followKind === kind || undefined} onClick={() => setFollowKind(kind)}>{text} <b>{count}</b></UnstyledButton>
                ))}
              </div>
              <ShowMore key={`${listKey}-${followKind}`} items={data.follow_up.rows.filter((r) => followKind === 'all' || r.reasons.some((x) => x.kind === followKind))} initial={6} render={(c) => {
                const shown = followKind === 'all' ? c.reasons : c.reasons.filter((x) => x.kind === followKind);
                const top = shown.reduce((m, x) => (x.amount > m.amount ? x : m), shown[0]);
                return custRow(c, (
                  <span className={css.stake}><b>{lakh(top.amount)}</b><small>{top.unit}</small></span>
                ), (
                  <>{[c.type, c.mr].filter(Boolean).join(' · ')}
                    {shown.map((x) => <div key={x.kind} className={css.why}><span className={css.tag} data-kind={x.kind}>{FOLLOW_LABEL[x.kind]}</span>{x.text}</div>)}
                  </>
                ));
              }} />
              {!data.follow_up.rows.length && empty('Nobody needs a follow-up right now 🎉')}
            </div>
          </Paper>

          <Paper className={`${css.card} ${css.s4}`}>
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
