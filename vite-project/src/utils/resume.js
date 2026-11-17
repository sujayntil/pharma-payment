/**
 * "Pick up where I left off" for MRs: the tab and the open customer, kept on
 * this phone. If the app is reopened within 30 minutes (after a call,
 * WhatsApp, or the phone closing it in the background) it goes back there;
 * after longer it starts on Home as usual.
 */
const KEY = 'mr-resume';
const RESUME_WITHIN_MS = 30 * 60 * 1000;

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

/** Merge into the saved place and stamp the time. userId keeps MRs apart on a shared phone. */
export function saveResume(userId, patch) {
  if (!userId) return;
  try {
    const current = read();
    const base = current && current.userId === userId ? current : { userId };
    localStorage.setItem(KEY, JSON.stringify({ ...base, ...patch, userId, at: Date.now() }));
  } catch { /* storage unavailable */ }
}

/** Where to reopen, or null when it is too old, another user's, or just Home. */
export function resumePlace(userId) {
  const saved = read();
  if (!saved || saved.userId !== userId || !saved.path || saved.path === '/mr') return null;
  if (Date.now() - (saved.at || 0) > RESUME_WITHIN_MS) return null;
  return { path: saved.path, customer: saved.path === '/mr/customers' ? saved.customer || null : null };
}
