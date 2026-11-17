import { Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { paymentsApi } from '../../api/paymentsApi';
import { errorText } from '../../utils/formatters';
import { REFRESH_NOW_EVENT } from '../../utils/appEvents';
import UndoCountdown from './UndoCountdown';

/**
 * Bottom bar for 15 seconds after a collection is saved:
 *   "₹5,000 collected · INV-1081      Undo 8"
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (fills left to right)
 * Undo removes it (a split collection together; several customers together)
 * and refreshes the page. This bar is the only place to undo; afterwards an
 * Admin reverses it.
 *
 * paymentId: one collection; paymentIds: one per customer (Invoices tab).
 */
export function showUndoBar({ paymentId, paymentIds, message }) {
  const ids = paymentIds?.length ? paymentIds : [paymentId];
  const id = `undo-${ids.join('-')}`;
  const undo = async () => {
    notifications.update({ id, loading: true, autoClose: false, withCloseButton: false, message: <Text size="sm">Undoing…</Text> });
    try {
      for (const payment of ids) await paymentsApi.undo(payment);
      notifications.update({ id, loading: false, color: 'gray', autoClose: 3000, withCloseButton: true, message: <Text size="sm">Collection undone.</Text> });
    } catch (err) {
      notifications.update({ id, loading: false, color: 'red', autoClose: 5000, withCloseButton: true, message: <Text size="sm">{errorText(err, "Couldn't undo. Check your connection.")}</Text> });
    } finally {
      window.dispatchEvent(new Event(REFRESH_NOW_EVENT));
    }
  };
  notifications.show({
    id,
    color: 'green',
    // Closed by the countdown itself, so touching the bar doesn't stretch it.
    autoClose: false,
    withCloseButton: false,
    position: 'bottom-center',
    message: <UndoCountdown message={message} onUndo={undo} onEnd={() => notifications.hide(id)} />,
  });
}
