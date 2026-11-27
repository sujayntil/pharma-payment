import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Center, Group, Loader, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconCheck, IconCloudOff } from '@tabler/icons-react';
import { marginApi } from '../../api/marginApi';
import ProductsTab from '../../components/margin/ProductsTab';
import CustomersTab from '../../components/margin/CustomersTab';
import { errorText } from '../../utils/formatters';
import { offerUndo } from '../../utils/undo';
import { productName, schemeName } from '../../utils/marginCalc';
import TitleBar from '../../components/common/TitleBar';

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

  // Before a delete: send that product's / scheme's waiting edits now.
  const flushFor = (pid, sids) => {
    [...(pid ? [`product:${pid}`] : []), ...sids.map((sid) => `scheme:${sid}`)].forEach((key) => {
      if (pending.current.has(key)) { clearTimeout(timers.current.get(key)); send(key); }
    });
  };

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
    // Deletes act at once with "Undo"; the server delete goes out when the
    // Undo message closes (about 6 seconds), so Undo needs no server call.
    deleteProduct: (id) => {
      const index = data.products.findIndex((p) => p.id === id);
      const product = data.products[index];
      if (!product) return;
      const links = data.links.filter((l) => l.product_id === id);
      flushFor(id, product.schemes.map((sc) => sc.id));
      const restore = () => {
        setData((d) => {
          const products = d.products.filter((p) => p.id !== id);
          products.splice(Math.min(index, products.length), 0, product);
          return { products, links: [...d.links.filter((l) => l.product_id !== id), ...links] };
        });
        setProductId(id);
      };
      setData((d) => ({ products: d.products.filter((p) => p.id !== id), links: d.links.filter((l) => l.product_id !== id) }));
      setProductId(data.products.find((p) => p.id !== id)?.id ?? null);
      offerUndo(`${productName(product)} deleted`, restore, {
        onExpire: () => marginApi.deleteProduct(id)
          .then(() => setSaveState('saved'))
          .catch((err) => { restore(); fail(err, 'Could not delete the product.'); }),
      });
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
    deleteScheme: (pid, sid) => {
      const product = data.products.find((p) => p.id === pid);
      const index = product ? product.schemes.findIndex((sc) => sc.id === sid) : -1;
      if (index < 0 || product.schemes.length < 2) return;
      const scheme = product.schemes[index];
      const links = data.links.filter((l) => l.scheme_id === sid);
      flushFor(null, [sid]);
      const restore = () => setData((d) => ({
        products: d.products.map((p) => {
          if (p.id !== pid) return p;
          const schemes = p.schemes.filter((sc) => sc.id !== sid);
          schemes.splice(Math.min(index, schemes.length), 0, scheme);
          return { ...p, schemes };
        }),
        links: [...d.links.filter((l) => l.scheme_id !== sid), ...links],
      }));
      setData((d) => ({
        products: d.products.map((p) => (p.id === pid ? { ...p, schemes: p.schemes.filter((sc) => sc.id !== sid) } : p)),
        links: d.links.filter((l) => l.scheme_id !== sid),
      }));
      offerUndo(`${schemeName(scheme)} deleted`, restore, {
        onExpire: () => marginApi.deleteScheme(sid)
          .then(() => setSaveState('saved'))
          .catch((err) => { restore(); fail(err, 'Could not delete the scheme.'); }),
      });
    },
  };

  const setLink = async (customerId, pid, sid, { undoable = true } = {}) => {
    const before = data.links;
    const previous = before.find((l) => l.customer_id === customerId && l.product_id === pid)?.scheme_id ?? null;
    setData((d) => ({
      ...d,
      links: [...d.links.filter((l) => !(l.customer_id === customerId && l.product_id === pid)),
        ...(sid ? [{ customer_id: customerId, product_id: pid, scheme_id: sid }] : [])],
    }));
    setSaveState('saving');
    try {
      await marginApi.setLink(customerId, pid, sid);
      setSaveState('saved');
      if (!sid && previous && undoable) offerUndo('Scheme removed', () => setLink(customerId, pid, previous, { undoable: false }));
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
      <TitleBar title="Margin calculator" left={(
        <>
          {saveState === 'saving' && <Text size="xs" c="dimmed">Saving…</Text>}
          {saveState === 'saved' && <Group gap={4} wrap="nowrap"><IconCheck size={14} color="var(--mantine-color-green-7)" /><Text size="xs" c="dimmed">Saved</Text></Group>}
          {saveState === 'error' && <Group gap={4} wrap="nowrap"><IconCloudOff size={14} color="var(--mantine-color-red-7)" /><Text size="xs" c="red">Not saved</Text></Group>}
        </>
      )}>
        <SegmentedControl value={tab} onChange={setTab}
          data={[{ value: 'products', label: 'Products & schemes' }, { value: 'customers', label: 'Customers' }]} />
      </TitleBar>
      {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      {loading ? <Center py="xl"><Loader size="sm" /></Center>
        : tab === 'products'
          ? <ProductsTab products={data.products} productId={productId} onProductId={setProductId}
              schemeId={schemeIds[productId]} onSchemeId={(sid) => setSchemeIds((m) => ({ ...m, [productId]: sid }))} actions={actions} />
          : <CustomersTab customers={customers} products={data.products} links={data.links} onLink={setLink} onNewScheme={newSchemeFor} />}
    </Stack>
  );
}
