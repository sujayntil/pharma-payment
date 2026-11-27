/**
 * Where the login (token) is kept, in one place.
 *
 * "Keep me signed in" on  -> localStorage: survives closing the app; the
 *                            server renews it for 30 days while it is used.
 * "Keep me signed in" off -> sessionStorage: gone when the browser / app is
 *                            closed, and the server ends it after 12 hours.
 * "pharma_token" is an older key, still read and always cleaned up.
 */
const KEY = 'token';
const LEGACY = 'pharma_token';
const CODE_KEY = 'last-employee-code';

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export function getToken() {
  return safe(() => localStorage.getItem(KEY) || localStorage.getItem(LEGACY) || sessionStorage.getItem(KEY));
}

export function saveToken(token, remember) {
  clearToken();
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, token));
}

export function clearToken() {
  safe(() => { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY); sessionStorage.removeItem(KEY); });
  // Remembered page filters belong to the person signing out.
  safe(() => [localStorage, sessionStorage].forEach((s) => Object.keys(s)
    .filter((k) => k.startsWith('remembered:')).forEach((k) => s.removeItem(k))));
}

/** True when the login is kept on this device (localStorage), i.e. it may be renewed. */
export function isKeptSignedIn() {
  return Boolean(safe(() => localStorage.getItem(KEY) || localStorage.getItem(LEGACY)));
}

/** Employee code filled in on the login page (only remembered with "Keep me signed in"). */
export function rememberedCode() {
  return safe(() => localStorage.getItem(CODE_KEY)) || '';
}
export function rememberCode(code, remember) {
  safe(() => (remember ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY)));
}
