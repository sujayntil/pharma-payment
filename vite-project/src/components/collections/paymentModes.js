/** Modes behind "More ▾" in the payment chips. */
export const MORE_MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'Other'];

/** The optional box under the chips for each mode (none for Cash). */
export const REFERENCE_LABEL = {
  UPI: 'UTR / reference',
  Cheque: 'Cheque number',
  'Bank Transfer': 'UTR / reference',
  NEFT: 'UTR / reference',
  RTGS: 'UTR / reference',
  Other: 'Reference / note',
};

const LAST_MODE_KEY = 'last-payment-mode';

/** The mode this person used last on this phone (UPI the first time). */
export function lastPaymentMode() {
  try {
    const saved = localStorage.getItem(LAST_MODE_KEY);
    return saved && (saved in REFERENCE_LABEL || saved === 'Cash') ? saved : 'UPI';
  } catch {
    return 'UPI';
  }
}

export function rememberPaymentMode(mode) {
  try { localStorage.setItem(LAST_MODE_KEY, mode); } catch { /* storage unavailable */ }
}

/** Reference to send: dropped for Cash, trimmed otherwise. */
export function referenceFor(mode, reference) {
  return mode === 'Cash' ? null : (reference || '').trim() || null;
}
