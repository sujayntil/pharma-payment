import { useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { customersApi } from '../../api/customersApi';
import { adminApi } from '../../api/adminApi';
import { errorText } from '../../utils/formatters';
import CustomerFormModal from './CustomerFormModal';

/**
 * Admin "Edit details" for one customer from anywhere (ledger, Insights):
 * loads the customer's full details and the MR list, then shows the same
 * Edit customer form as the Customers page.
 *
 * customerId: the customer to edit, or null when closed.
 * onSaved(saved): after a successful save.
 */
export default function EditCustomerModal({ customerId, onClose, onSaved }) {
  const [loaded, setLoaded] = useState(null); // { id, customer, mrs }

  useEffect(() => {
    if (!customerId) return undefined;
    let active = true;
    Promise.all([customersApi.getCustomerLedger(customerId, { limit: 1 }), adminApi.getUsers()])
      .then(([ledger, users]) => {
        if (active) setLoaded({ id: customerId, customer: ledger.customer, mrs: users.filter((user) => user.role === 'MR') });
      })
      .catch((err) => {
        if (!active) return;
        notifications.show({ color: 'red', message: errorText(err, "Couldn't open the customer's details.") });
        onClose();
      });
    return () => { active = false; };
  }, [customerId, onClose]);

  const ready = loaded && loaded.id === customerId ? loaded : null;
  const mrOptions = useMemo(() => (ready ? ready.mrs.map((mr) => ({ value: String(mr.id), label: mr.name })) : []), [ready]);
  return (
    <CustomerFormModal
      customer={customerId && ready ? ready.customer : null}
      mrOptions={mrOptions}
      onClose={onClose}
      onSaved={(saved) => {
        notifications.show({ color: 'green', message: `${saved.name} updated` });
        onSaved?.(saved);
      }}
    />
  );
}
