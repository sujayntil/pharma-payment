import { notifications } from '@mantine/notifications';
import axiosClient, { API_BASE } from '../../api/axiosClient';
import { errorText } from '../../utils/formatters';
import UndoCountdown from './UndoCountdown';

// Deletes waiting for their Undo bar to run out: id -> server path.
const pending = new Map();

// Closing, refreshing or updating the app sends waiting deletes right away,
// so a delete is never lost just because the app went away.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const token = localStorage.getItem('token') || localStorage.getItem('pharma_token');
    pending.forEach(({ path, method, body }) => {
      try {
        fetch(`${API_BASE}${path}`, {
          method, keepalive: true,
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch { /* the page is going away; nothing more to do */ }
    });
    pending.clear();
  });
}

/**
 * Delete with a 15-second Undo bar. The item leaves the list at once
 * (onHide); the server delete is only sent when the bar runs out. Undo puts
 * it back (onRestore) and nothing is sent. If the server refuses, the item
 * comes back with the reason.
 *
 * path: server path, e.g. "/invoices/12" (DELETE), or with method 'POST'
 *       and body for several at once ("/invoices/bulk-delete", { ids })
 * message: bar text, e.g. "INV-1081 deleted"
 * onDone(): after the server delete (reload the list)
 */
export function deleteWithUndo({ path, method = 'DELETE', body, message, onHide, onRestore, onDone }) {
  const id = `delete-${path}-${body ? JSON.stringify(body) : ''}`;
  onHide();
  pending.set(id, { path, method, body });

  const undo = () => {
    if (!pending.delete(id)) return;
    notifications.hide(id);
    onRestore();
  };
  const finish = async () => {
    if (!pending.delete(id)) return; // undone, or already sent on close
    notifications.hide(id);
    try {
      await axiosClient.request({ url: path, method, data: body });
      onDone?.();
    } catch (err) {
      onRestore();
      notifications.show({ color: 'red', position: 'bottom-center', message: errorText(err, "Couldn't delete. Check your connection.") });
    }
  };

  notifications.show({
    id,
    color: 'gray',
    autoClose: false,
    withCloseButton: false,
    position: 'bottom-center',
    message: <UndoCountdown message={message} onUndo={undo} onEnd={finish} />,
  });
}
