import { toCollectionTarget } from './collectionUtils';
import CustomerCollectModal from './CustomerCollectModal';

/**
 * "Collect" on an invoice, used by both MRs and Admins. It opens the one
 * Collect sheet with only this invoice ticked; the customer's other pending
 * invoices are listed too, to tick if the shop pays more. When an Admin
 * collects for a customer with an assigned MR, the collection is saved under
 * that MR and the Admin is stored as who recorded it.
 *
 * invoice: the invoice row from any list, panel or customer screen.
 */
export default function RecordCollectionModal({ invoice, onClose, onSaved }) {
  const target = toCollectionTarget(invoice);
  return (
    <CustomerCollectModal
      invoice={target && { invoiceId: target.invoiceId, invoiceNumber: target.invoiceNumber, customer: target.customer }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
