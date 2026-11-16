import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { paymentsApi } from '../../api/paymentsApi';
import { errorText } from '../../utils/formatters';
import { REFRESH_NOW_EVENT } from '../../utils/appEvents';

const UNDO_BAR_MS = 10000;

/**
 * Bottom bar for 10 seconds after a collection is saved:
 *   "₹5,000 collected · INV-1081   [Undo]"
 * Undo removes it (a split collection together) and refreshes the page.
 * This bar is the only place to undo; afterwards an Admin reverses it.
 */
export function showUndoBar({ paymentId, message }) {
  const id = `undo-${paymentId}`;
  const undo = async () => {
    notifications.update({ id, loading: true, autoClose: false, withCloseButton: false, message: <Text size="sm">Undoing…</Text> });
    try {
      await paymentsApi.undo(paymentId);
      notifications.update({ id, loading: false, color: 'gray', autoClose: 3000, withCloseButton: true, message: <Text size="sm">Collection undone.</Text> });
      window.dispatchEvent(new Event(REFRESH_NOW_EVENT));
    } catch (err) {
      notifications.update({ id, loading: false, color: 'red', autoClose: 5000, withCloseButton: true, message: <Text size="sm">{errorText(err, "Couldn't undo. Check your connection.")}</Text> });
    }
  };
  notifications.show({
    id,
    color: 'green',
    autoClose: UNDO_BAR_MS,
    withCloseButton: false,
    position: 'bottom-center',
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm" fw={600}>{message}</Text>
        <Button size="compact-sm" variant="subtle" color="green" onClick={undo}>Undo</Button>
      </Group>
    ),
  });
}
