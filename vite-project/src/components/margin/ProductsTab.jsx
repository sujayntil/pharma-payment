import { useState } from 'react';
import { Button, Checkbox, Group, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { calc, canPtr, canPts, filled, marginTone, missing, pct, pctShort, productName, rule, rupees, schemeName, units } from '../../utils/marginCalc';
import classes from './Margin.module.css';

const cx = (...names) => names.filter(Boolean).join(' ');
const tone = (v) => (v < -0.00005 ? classes.neg : '');

function Num({ label, value, onChange, suffix, decimals = true, ...rest }) {
  return (
    <NumberInput label={label} value={value ?? ''} hideControls allowNegative={false} decimalScale={decimals ? 4 : 0}
      allowDecimal={decimals} rightSection={suffix ? <Text size="sm" c="dimmed">{suffix}</Text> : null}
      rightSectionWidth={suffix && suffix.length > 1 ? 52 : 32} onChange={(v) => onChange(v === '' ? null : v)} {...rest} />
  );
}

function ResultDisplay({ product, scheme }) {
  const gaps = missing(product, scheme);
  if (gaps.length) {
    return (
      <div className={classes.disp}>
        <div className={classes.dhead}><h2>{schemeName(scheme)}</h2><span>{rule(scheme)}</span></div>
        <div className={classes.empty}>
          <span>Fill in to see the margin</span>
          <b>{gaps.join(' · ')}</b>
        </div>
      </div>
    );
  }
  const r = calc(product, scheme);
  const loss = r.per < -0.00005;
  const share = (v) => (r.get > 0 ? v / r.get : NaN);
  const keepColor = loss ? 'var(--d-red)' : 'var(--d-keep)';
  return (
    <div className={classes.disp}>
      <div className={classes.dhead}><h2>{schemeName(scheme)}</h2><span>{rule(scheme)}</span></div>
      <div className={classes.big}>
        <div><span>You keep / unit</span><b className={tone(r.per)}>{rupees(r.per)}</b></div>
        <div><span>Take home / batch</span><b className={tone(r.take)}>{rupees(r.take, 0)}</b></div>
      </div>
      <div className={classes.metr}>
        <div><span className={classes.ml}>Profit % of MRP</span><span className={cx(classes.mv, tone(r.pMrp))}>{pct(r.pMrp)}</span></div>
        <div>
          <span className={classes.ml}>Profit % of billing value</span>
          <div className={classes.pair}>
            <div><span className={cx(classes.mv, classes[marginTone(r.pAft)])}>{pct(r.pAft, 2)}</span><small>After GST paid · {rupees(r.per)}</small></div>
            <div><span className={cx(classes.mv, tone(r.pBef))}>{pct(r.pBef, 2)}</span><small>Before GST paid · {rupees(r.pre)}</small></div>
          </div>
        </div>
      </div>
      <div>
        <div className={classes.splitHead}><span>Billing value / unit</span><b className={classes.n}>{rupees(r.get)}</b></div>
        <div className={classes.sbar} aria-hidden="true">
          {loss || r.get <= 0
            ? <i style={{ width: '100%', background: 'var(--d-red)' }} />
            : <>
              <i style={{ width: `${share(r.cost) * 100}%`, background: '#6b7470' }} />
              <i style={{ width: `${share(r.gstGovt) * 100}%`, background: '#b8c0bc' }} />
              <i style={{ width: `${share(r.per) * 100}%`, background: 'var(--d-keep)' }} />
            </>}
        </div>
        <div className={classes.leg}>
          {[['#6b7470', 'Manufacturer', r.cost], ['#b8c0bc', 'GST to govt', r.gstGovt], [keepColor, 'You keep', r.per]].map(([color, label, v]) => (
            <div key={label}>
              <span className={classes.k}><span className={classes.dot} style={{ background: color }} />{label}</span>
              <span><b className={label === 'You keep' ? tone(v) : ''}>{rupees(v)}</b><em>{pct(share(v))}</em></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BatchPanel({ product, scheme }) {
  if (missing(product, scheme).length) return null;
  const r = calc(product, scheme);
  if (!filled(product.batch)) {
    return <Paper withBorder p="md" radius="lg"><Text size="sm" c="dimmed">Enter a batch size to see take home per batch.</Text></Paper>;
  }
  const loss = r.per < -0.00005;
  const notes = [r.free && 'Free units are in the batch, billed on the same invoice.', loss && 'Loss: the price does not cover your cost.'].filter(Boolean);
  return (
    <Paper withBorder p="md" radius="lg">
      <Title order={2} fz={15} mb={6}>Batch · {units(r.Q)} units</Title>
      <div className={classes.lines}>
        <div><span>Customers pay you</span><span className={classes.n}>{rupees(r.received, 0)}</span></div>
        <div><span>− GST to govt</span><span className={classes.n}>{rupees(r.gstBatch, 0)}</span></div>
        <div><span>− Next batch</span><span className={classes.n}>{rupees(r.next, 0)}</span></div>
        <div className={classes.total}><span>Take home</span><span className={cx(classes.n, tone(r.take))}>{rupees(r.take, 0)}</span></div>
      </div>
      {notes.length > 0 && <Text size="xs" c={loss ? 'red' : 'dimmed'} mt={6}>{notes.join(' ')}</Text>}
    </Paper>
  );
}

function Compare({ product, selectedId, onPick, onCopy, onDelete }) {
  const rank = (x) => (x.ok && Number.isFinite(x.r.take) ? x.r.take : x.ok ? x.r.per : -Infinity);
  const list = product.schemes.map((s) => ({ s, ok: !missing(product, s).length, r: calc(product, s) })).sort((x, y) => rank(y) - rank(x));
  const max = Math.max(1, ...list.filter((x) => x.ok && Number.isFinite(x.r.take)).map((x) => Math.abs(x.r.take)));
  const bestId = list.length > 1 && list[0].ok && list[0].r.take > 0 ? list[0].s.id : null;
  const one = product.schemes.length < 2;
  return (
    <Paper withBorder p="md" radius="lg">
      <Group justify="space-between" mb="sm"><Title order={2} fz={15}>Compare schemes</Title><Text size="xs" c="dimmed">Ranked by take home</Text></Group>
      <div className={cx(classes.crow, classes.chead)} aria-hidden="true">
        <span className={classes.cn}>Scheme</span><span className={classes.hb} /><span className={classes.r}>Keep / unit</span>
        <span className={cx(classes.r, classes.hp)}>% MRP</span><span className={classes.r}>Take home</span><span />
      </div>
      <Stack gap={4}>
        {list.map(({ s, ok, r }) => {
          const best = s.id === bestId;
          const neg = ok && r.take < -0.5;
          const dash = (v) => (ok ? v : '—');
          return (
            <div key={s.id} role="button" tabIndex={0} aria-label={`Edit ${schemeName(s)}`}
              className={cx(classes.crow, classes.row, s.id === selectedId && classes.sel)}
              onClick={() => onPick(s.id)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(s.id); } }}>
              <div className={classes.cn}>
                <div className={classes.nm}>{schemeName(s)}{best && <Text span size="xs" fw={600} c="green" ml={6}>Best</Text>}</div>
                <div className={classes.rl}>{rule(s)}</div>
              </div>
              <div className={classes.hb}><div className={classes.tbar}><i className={neg ? classes.negBar : best ? classes.best : ''} style={{ width: `${ok && Number.isFinite(r.take) ? (Math.abs(r.take) / max) * 100 : 0}%` }} /></div></div>
              <div className={cx(classes.r, ok && tone(r.per))}>{dash(rupees(r.per))}</div>
              <div className={cx(classes.r, classes.hp, ok && tone(r.pMrp))}>{dash(pct(r.pMrp))}</div>
              <div className={cx(classes.r, ok && tone(r.take))} style={{ fontWeight: 600 }}>{dash(rupees(r.take, 0))}</div>
              <div className={cx(classes.acts, classes.ca)}>
                <Button size="compact-sm" variant="default" onClick={(e) => { e.stopPropagation(); onCopy(s); }}>Copy</Button>
                <Button size="compact-sm" variant="subtle" color="red" disabled={one} onClick={(e) => { e.stopPropagation(); onDelete(s); }}>Delete</Button>
              </div>
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

/**
 * Products & schemes: inputs on the left, the result display on the right,
 * every scheme of the product compared below.
 */
export default function ProductsTab({ products, productId, onProductId, schemeId, onSchemeId, actions }) {
  const [freeOpen, setFreeOpen] = useState({}); // scheme id -> free-goods boxes shown
  const product = products.find((p) => p.id === productId) || products[0];

  if (!product) {
    return (
      <Paper withBorder p="xl" radius="lg">
        <Stack align="center" gap="sm" py="lg">
          <Text c="dimmed">Add a product to start working out scheme margins.</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={actions.addProduct}>Product</Button>
        </Stack>
      </Paper>
    );
  }

  const scheme = product.schemes.find((s) => s.id === schemeId) || product.schemes[0];
  const r = calc(product, scheme);
  const setP = (field) => (value) => actions.updateProduct(product.id, { [field]: value });
  const setS = (field) => (value) => actions.updateScheme(product.id, scheme.id, { [field]: value });
  const freeOn = freeOpen[scheme.id] ?? Number(scheme.free) > 0;
  const ready = !missing(product, scheme).length;
  // Total discount incl. free goods; a price above PTR/PTS is simply left out.
  const totals = [[r.totMrp, 'MRP', true], [r.totPtr, 'PTR', canPtr(product)], [r.totPts, 'PTS', canPts(product)]]
    .filter(([v, , ok]) => ok && Number.isFinite(v) && v >= 0)
    .map(([v, label]) => `${pctShort(v)} off ${label}`);

  return (
    <Stack gap="md">
      <Group gap="xs" wrap="wrap">
        <Select aria-label="Product" data={products.map((p) => ({ value: String(p.id), label: productName(p) }))}
          value={String(product.id)} onChange={(v) => v && onProductId(Number(v))} allowDeselect={false} searchable w={260} maw="100%" />
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={actions.addProduct}>Product</Button>
        <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => actions.deleteProduct(product.id)}>Delete</Button>
        <Text size="sm" c="dimmed" ml="auto">{product.schemes.length} {product.schemes.length === 1 ? 'scheme' : 'schemes'}{filled(product.batch) ? ` · batch of ${units(product.batch)} units` : ''}</Text>
      </Group>

      <div className={classes.cols}>
        <div className={classes.stack}>
          <Paper withBorder p="md" radius="lg">
            <Title order={2} fz={15} mb="sm">Product</Title>
            <TextInput label="Name" placeholder="Product name" value={product.name} maxLength={80} onChange={(e) => setP('name')(e.currentTarget.value)} />
            <div className={classes.group}>Selling · incl. GST</div>
            <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs" verticalSpacing={8}>
              <Num label="MRP" value={product.mrp} onChange={setP('mrp')} suffix="₹" />
              <Num label="GST" value={product.gst} onChange={setP('gst')} suffix="%" />
              <Num label="Retailer" value={product.retailer_margin} onChange={setP('retailer_margin')} suffix="%" />
              <Num label="Stockist" value={product.stockist_margin} onChange={setP('stockist_margin')} suffix="%" />
            </SimpleGrid>
            <div className={classes.group}>Buying · incl. GST</div>
            <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="xs" verticalSpacing={8}>
              <Num label="Cost / unit" value={product.cost} onChange={setP('cost')} suffix="₹" />
              <Num label="GST" value={product.purchase_gst} onChange={setP('purchase_gst')} suffix="%" />
              <Num label="Batch" value={product.batch} onChange={setP('batch')} suffix="units" decimals={false} />
            </SimpleGrid>
            <div className={classes.strip}>
              <div><span>PTR (inc GST)</span><b>{canPtr(product) ? rupees(r.ptr) : '—'}</b></div>
              <div><span>PTS (inc GST)</span><b>{canPts(product) ? rupees(r.pts) : '—'}</b></div>
              <div><span>Cost / MRP</span><b>{filled(product.mrp) && filled(product.cost) && Number(product.mrp) > 0 ? pct(r.costPct) : '—'}</b></div>
            </div>
          </Paper>

          <Paper withBorder p="md" radius="lg">
            <Group justify="space-between" mb="sm">
              <Title order={2} fz={15}>Scheme</Title>
              <Button size="xs" color="dark" leftSection={<IconPlus size={14} />} onClick={() => actions.addScheme(product.id)}>New scheme</Button>
            </Group>
            <TextInput label="Name" placeholder="e.g. Diwali offer" value={scheme.name || ''} maxLength={80} onChange={(e) => setS('name')(e.currentTarget.value)} />
            <Group gap="xs" mt="sm" align="flex-end" wrap="nowrap">
              <Stack gap={4} style={{ flex: 1.6, minWidth: 0 }}>
                <Text size="sm" fw={500}>Sell at</Text>
                <SegmentedControl fullWidth value={scheme.sell_at || ''} onChange={setS('sell_at')}
                  data={[{ value: 'mrp', label: 'MRP' }, { value: 'ptr', label: 'PTR' }, { value: 'pts', label: 'PTS' }]} />
              </Stack>
              <Num label="Discount" placeholder="0 = full price" value={scheme.discount} onChange={setS('discount')} suffix="%" style={{ flex: 1, minWidth: 0 }} max={100} />
            </Group>
            <Checkbox mt="md" label="Free goods, same invoice" checked={freeOn}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setFreeOpen((m) => ({ ...m, [scheme.id]: on }));
                if (!on) actions.updateScheme(product.id, scheme.id, { buy: null, free: null });
              }} />
            {freeOn && (
              <Group grow gap="xs" mt="sm">
                <Num label="Buy" placeholder="e.g. 10" value={scheme.buy} onChange={setS('buy')} decimals={false} />
                <Num label="Get free" placeholder="e.g. 1" value={scheme.free} onChange={setS('free')} decimals={false} />
              </Group>
            )}
            {ready && (
              <p className={classes.hint}>
                <b className={classes.n}>{rupees(r.paidInc)}</b> per paid unit
                {r.free && <> · <b>{units(r.a + r.b)}</b> shipped per <b>{units(r.a)}</b> paid</>}
                {totals.length > 0 && <><br />Total discount: <b>{totals.join(' · ')}</b></>}
              </p>
            )}
          </Paper>
        </div>

        <Stack gap="md">
          <ResultDisplay product={product} scheme={scheme} />
          <BatchPanel product={product} scheme={scheme} />
        </Stack>
      </div>

      <Compare product={product} selectedId={scheme.id} onPick={onSchemeId}
        onCopy={(s) => actions.addScheme(product.id, { name: `${schemeName(s)} copy`.slice(0, 80), sell_at: s.sell_at, discount: s.discount, buy: s.buy, free: s.free })}
        onDelete={(s) => actions.deleteScheme(product.id, s.id)} />

    </Stack>
  );
}
