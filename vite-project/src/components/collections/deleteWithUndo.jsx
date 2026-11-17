import { notifications } from '@mantine/notifications';
import axiosClient, { API_BASE } from '../../api/axiosClient';
import { errorText } from '../../utils/formatters';
import UndoCountdown from './UndoCountdown';

// Deletes waiting for their Undo bar to run out: id -> server path.
const pending = new Map();

// Closing, refreshing, updating the app, or putting it in the background
// (phone locked, home button, another app) sends waiting deletes right away:
// a phone freezes a backgrounded app, so the 15-second countdown can't be
// trusted to finish there.
function sendWaitingNow() {
  if (!pending.size) return;
  const token = localStorage.getItem('token') || localStorage.getItem('pharma_token');
  pending.forEach(({ path, method, body, undo }) => {
    try {
      fetch(`${API_BASE}${path}`, {
        method, keepalive: true,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { /* the page is going away; nothing more to do */ }
    undo?.();
  });
  pending.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', sendWaitingNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sendWaitingNow(); });
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
  // Sent early (app backgrounded): just close the bar; the delete is on its way.
  pending.set(id, { path, method, body, undo: () => notifications.hide(id) });

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
      // Stays until tapped, so a refused delete is never missed.
      notifications.show({ color: 'red', position: 'bottom-center', autoClose: false, withCloseButton: true, title: "Couldn't delete", message: errorText(err, 'Check your connection and try again.') });
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
