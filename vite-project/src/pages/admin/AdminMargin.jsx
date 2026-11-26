import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Center, Group, Loader, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconCloudOff } from '@tabler/icons-react';
import { marginApi } from '../../api/marginApi';
import ProductsTab from '../../components/margin/ProductsTab';
import CustomersTab from '../../components/margin/CustomersTab';
import { errorText } from '../../utils/formatters';

const SAVE_DELAY = 600;

/**
 * Margin calculator (Admin only). Products and schemes are typed in here and
 * saved as you type; customers are the app's real customers (name and type
 * only, no sales), each linked to one scheme per product.
 */
export default function AdminMargin() {
  const [data, setData] = useState({ products: [], links: [] });
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [tab, setTab] = useState('products');
  const [productId, setProductId] = useState(null);
  const [schemeIds, setSchemeIds] = useState({}); // product id -> selected scheme id

  // Typing is saved after a short pause, one request per product or scheme.
  const pending = useRef(new Map());
  const timers = useRef(new Map());
  const inFlight = useRef(0);

  useEffect(() => {
    let alive = true;
    Promise.all([marginApi.load(), marginApi.customers()])
      .then(([loaded, list]) => {
        if (!alive) return;
        setData(loaded);
        setCustomers(list);
        setProductId(loaded.products[0]?.id ?? null);
      })
      .catch((err) => alive && setError(errorText(err, 'Could not load the calculator.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const send = useCallback(async (key) => {
    const job = pending.current.get(key);
    pending.current.delete(key);
    timers.current.delete(key);
    if (!job) return;
    inFlight.current += 1;
    setSaveState('saving');
    try {
      if (job.kind === 'product') await marginApi.updateProduct(job.id, job.changes);
      else await marginApi.updateScheme(job.id, job.changes);
      inFlight.current -= 1;
      if (!inFlight.current && !pending.current.size) setSaveState('saved');
    } catch (err) {
      inFlight.current -= 1;
      setSaveState('error');
      setError(errorText(err, 'Could not save. Check the values and try again.'));
    }
  }, []);

  const queue = useCallback((kind, id, changes) => {
    // An emptied box is saved as empty (null), never as 0.
    const clean = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v === '' || v === undefined ? (k === 'name' ? '' : null) : v]));
    const key = `${kind}:${id}`;
    const prev = pending.current.get(key);
    pending.current.set(key, { kind, id, changes: { ...prev?.changes, ...clean } });
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => send(key), SAVE_DELAY));
    setSaveState('saving');
  }, [send]);

  // Leaving the page: send whatever is still waiting.
  useEffect(() => () => {
    const timerMap = timers.current;
    timerMap.forEach((t) => clearTimeout(t));
    [...pending.current.keys()].forEach((key) => { send(key); });
  }, [send]);

  const fail = (err, fallback) => { setSaveState('error'); setError(errorText(err, fallback)); };

  const actions = {
    addProduct: async () => {
      try {
        const product = await marginApi.addProduct();
        setData((d) => ({ ...d, products: [...d.products, product] }));
        setProductId(product.id);
        setSaveState('saved');
      } catch (err) { fail(err, 'Could not add the product.'); }
    },
    updateProduct: (id, changes) => {
      setData((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...changes } : p)) }));
      queue('product', id, changes);
    },
    deleteProduct: async (id) => {
      try {
        await marginApi.deleteProduct(id);
        setData((d) => ({ products: d.products.filter((p) => p.id !== id), links: d.links.filter((l) => l.product_id !== id) }));
        setProductId(data.products.find((p) => p.id !== id)?.id ?? null);
        setSaveState('saved');
      } catch (err) { fail(err, 'Could not delete the product.'); }
    },
    addScheme: async (pid, values = {}) => {
      try {
        const scheme = await marginApi.addScheme(pid, values);
        setData((d) => ({ ...d, products: d.products.map((p) => (p.id === pid ? { ...p, schemes: [...p.schemes, scheme] } : p)) }));
        setSchemeIds((m) => ({ ...m, [pid]: scheme.id }));
        setSaveState('saved');
        return scheme;
      } catch (err) { fail(err, 'Could not add the scheme.'); return null; }
    },
    updateScheme: (pid, sid, changes) => {
      setData((d) => ({ ...d, products: d.products.map((p) => (p.id !== pid ? p : { ...p, schemes: p.schemes.map((s) => (s.id === sid ? { ...s, ...changes } : s)) })) }));
      queue('scheme', sid, changes);
    },
    deleteScheme: async (pid, sid) => {
      try {
        await marginApi.deleteScheme(sid);
        setData((d) => ({
          products: d.products.map((p) => (p.id === pid ? { ...p, schemes: p.schemes.filter((s) => s.id !== sid) } : p)),
          links: d.links.filter((l) => l.scheme_id !== sid),
        }));
        setSaveState('saved');
      } catch (err) { fail(err, 'Could not delete the scheme.'); }
    },
  };

  const setLink = async (customerId, pid, sid) => {
    const before = data.links;
    setData((d) => ({
      ...d,
      links: [...d.links.filter((l) => !(l.customer_id === customerId && l.product_id === pid)),
        ...(sid ? [{ customer_id: customerId, product_id: pid, scheme_id: sid }] : [])],
    }));
    setSaveState('saving');
    try {
      await marginApi.setLink(customerId, pid, sid);
      setSaveState('saved');
    } catch (err) {
      setData((d) => ({ ...d, links: before }));
      fail(err, 'Could not save the scheme for this customer.');
    }
  };

  const newSchemeFor = async (pid) => {
    const scheme = await actions.addScheme(pid);
    if (scheme) { setProductId(pid); setTab('products'); }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" align="baseline">
          <Title order={1}>Margin calculator</Title>
          {saveState === 'saving' && <Text size="xs" c="dimmed">Saving…</Text>}
          {saveState === 'saved' && <Group gap={4}><IconCheck size={14} color="var(--mantine-color-green-7)" /><Text size="xs" c="dimmed">Saved</Text></Group>}
          {saveState === 'error' && <Group gap={4}><IconCloudOff size={14} color="var(--mantine-color-red-7)" /><Text size="xs" c="red">Not saved</Text></Group>}
        </Group>
        <SegmentedControl value={tab} onChange={setTab}
          data={[{ value: 'products', label: 'Products & schemes' }, { value: 'customers', label: 'Customers' }]} />
      </Group>
      {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      {loading ? <Center py="xl"><Loader size="sm" /></Center>
        : tab === 'products'
          ? <ProductsTab products={data.products} productId={productId} onProductId={setProductId}
              schemeId={schemeIds[productId]} onSchemeId={(sid) => setSchemeIds((m) => ({ ...m, [productId]: sid }))} actions={actions} />
          : <CustomersTab customers={customers} products={data.products} links={data.links} onLink={setLink} onNewScheme={newSchemeFor} />}
    </Stack>
  );
}
