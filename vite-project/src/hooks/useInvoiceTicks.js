import { useCallback, useMemo, useState } from 'react';
import { useBackClose } from './useBackClose';

const EMPTY = new Map();
// By default only pending invoices can be ticked (to collect them).
const isPending = (item) => Number(item.pending_amount) > 0;
// Lists name the invoice id differently (invoice_id on MR lists, id on Admin's).
const keyOf = (invoice) => invoice.invoice_id ?? invoice.id;

/** Ticked invoices grouped per customer, for the Collect sheets. */
export function groupByCustomer(invoices) {
  const groups = new Map();
  invoices.forEach((invoice) => {
    const customerId = invoice.customer_id;
    if (!groups.has(customerId)) groups.set(customerId, { customerId, customer: invoice.customer ?? invoice.customer_name ?? '—', invoices: [] });
    groups.get(customerId).invoices.push({ invoice_id: keyOf(invoice), invoice_number: invoice.invoice_number, pending_amount: invoice.pending_amount });
  });
  return [...groups.values()];
}

/**
 * Ticked pending invoices: the customer screen (key = customer id) or the
 * Invoices tab (a fixed key, so ticks stay while searching and filtering).
 * Ticks reset when the key changes; Back clears them first.
 * selectable(item): which rows can be ticked (default: pending invoices).
 */
export function useInvoiceTicks(customerId, { selectable = isPending } = {}) {
  // Kept per customer: another customer starts with nothing ticked.
  const [state, setState] = useState(() => ({ customerId, map: new Map() }));
  const ticked = state.customerId === customerId ? state.map : EMPTY;
  const clear = useCallback(() => setState({ customerId, map: new Map() }), [customerId]);
  useBackClose(ticked.size > 0, clear);
  const toggle = useCallback((invoice) => setState((current) => {
    const next = new Map(current.customerId === customerId ? current.map : EMPTY);
    if (next.has(keyOf(invoice))) next.delete(keyOf(invoice));
    else next.set(keyOf(invoice), invoice);
    return { customerId, map: next };
  }), [customerId]);
  // Adds every pending invoice in the list shown (earlier ticks stay);
  // with all of them already ticked it unticks just those.
  const selectAll = useCallback((invoices) => setState((current) => {
    const pending = invoices.filter(selectable);
    const next = new Map(current.customerId === customerId ? current.map : EMPTY);
    const all = pending.length > 0 && pending.every((invoice) => next.has(keyOf(invoice)));
    pending.forEach((invoice) => (all ? next.delete(keyOf(invoice)) : next.set(keyOf(invoice), invoice)));
    return { customerId, map: next };
  }), [customerId, selectable]);
  const total = useMemo(() => [...ticked.values()].reduce((sum, invoice) => sum + Number(invoice.pending_amount || 0), 0), [ticked]);
  const customers = useMemo(() => new Set([...ticked.values()].map((invoice) => invoice.customer_id)).size, [ticked]);
  return {
    ticked, toggle, selectAll, total, count: ticked.size, customers,
    invoices: () => [...ticked.values()],
    canTick: selectable,
    allTicked: (invoices) => { const pending = invoices.filter(selectable); return pending.length > 0 && pending.every((invoice) => ticked.has(keyOf(invoice))); },
    isTicked: (invoice) => ticked.has(keyOf(invoice)),
    ids: () => [...ticked.keys()],
    // After a save: wait for the Collect sheet's Back entry to go first.
    clearSoon: () => setTimeout(clear, 300),
    clear,
  };
}

