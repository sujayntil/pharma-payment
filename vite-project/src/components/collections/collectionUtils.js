import { useAuth } from '../../hooks/useAppStore';

// Plain words for the stored status codes (codes and filters are unchanged).
export const STATUS_LABELS = { PAID: 'Paid', PARTIAL: 'Part paid', UNPAID: 'Unpaid' };

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS', 'Other'];

/**
 * Normalises the different invoice shapes the API returns (invoice list,
 * outstanding list, ledger, collections ledger) into one.
 */
export function toCollectionTarget(row) {
  if (!row) return null;
  return {
    invoiceId: row.invoice_id ?? row.id,
    invoiceNumber: row.invoice_number,
    customer: row.customer_name ?? row.customer ?? null,
    mrName: row.mr_name ?? row.mr ?? null,
    pending: Number(row.pending_amount || 0),
    paid: Number(row.paid_amount || 0),
  };
}

/**
 * Who recorded a ledger row (payment rows) or an invoice's latest entry
 * (invoice rows), as { id, name, role }.
 */
export function recorderOf(row) {
  if (!row) return null;
  if ('recorded_by' in row || 'recorded_by_id' in row) {
    if (!row.recorded_by && row.recorded_by_id == null) return null;
    return { id: row.recorded_by_id, name: row.recorded_by, role: row.recorded_by_role || (row.recorded_by_admin ? 'ADMIN' : 'MR') };
  }
  if (!row.last_collection_at && !row.last_collection_by) return null;
  return { id: row.last_collection_by_id, name: row.last_collection_by, role: row.last_collection_by_role || (row.last_collection_by_admin ? 'ADMIN' : 'MR') };
}

/**
 * The one display rule for "who":
 *  - MR viewing their own entry: "You"
 *  - an Admin's entry: "Admin - <Name>"
 *  - an MR's entry seen by anyone else: the MR's plain name
 */
export function actorLabel(actor, viewer) {
  if (!actor || (!actor.name && actor.id == null)) return '—';
  if (viewer?.role === 'MR' && actor.id != null && viewer.id != null && Number(actor.id) === Number(viewer.id)) return 'You';
  if (actor.role === 'ADMIN') return `Admin - ${actor.name || 'Admin'}`;
  return actor.name || '—';
}

export function useActorLabel() {
  const { user, role } = useAuth();
  const viewer = { id: user?.id, role };
  return (actor) => actorLabel(actor, viewer);
}
