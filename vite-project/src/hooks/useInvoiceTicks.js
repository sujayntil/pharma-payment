import { useCallback, useMemo, useState } from 'react';
import { useBackClose } from './useBackClose';

const EMPTY = new Map();

/**
 * Ticked pending invoices on the customer screen.
 * Ticks reset when the customer changes; Back clears them first.
 */
export function useInvoiceTicks(customerId) {
  // Kept per customer: another customer starts with nothing ticked.
  const [state, setState] = useState(() => ({ customerId, map: new Map() }));
  const ticked = state.customerId === customerId ? state.map : EMPTY;
  const clear = useCallback(() => setState({ customerId, map: new Map() }), [customerId]);
  useBackClose(ticked.size > 0, clear);
  const toggle = useCallback((invoice) => setState((current) => {
    const next = new Map(current.customerId === customerId ? current.map : EMPTY);
    if (next.has(invoice.invoice_id)) next.delete(invoice.invoice_id);
    else next.set(invoice.invoice_id, Number(invoice.pending_amount || 0));
    return { customerId, map: next };
  }), [customerId]);
  // Every pending invoice in the list shown; again with all ticked clears.
  const selectAll = useCallback((invoices) => setState((current) => {
    const pending = invoices.filter((invoice) => Number(invoice.pending_amount) > 0);
    const map = current.customerId === customerId ? current.map : EMPTY;
    const all = pending.length > 0 && pending.every((invoice) => map.has(invoice.invoice_id));
    return { customerId, map: all ? new Map() : new Map(pending.map((invoice) => [invoice.invoice_id, Number(invoice.pending_amount)])) };
  }), [customerId]);
  const total = useMemo(() => [...ticked.values()].reduce((sum, value) => sum + value, 0), [ticked]);
  return {
    ticked, toggle, selectAll, total, count: ticked.size,
    allTicked: (invoices) => { const pending = invoices.filter((invoice) => Number(invoice.pending_amount) > 0); return pending.length > 0 && pending.every((invoice) => ticked.has(invoice.invoice_id)); },
    isTicked: (invoice) => ticked.has(invoice.invoice_id),
    ids: () => [...ticked.keys()],
    // After a save: wait for the Collect sheet's Back entry to go first.
    clearSoon: () => setTimeout(clear, 300),
    clear,
  };
}

