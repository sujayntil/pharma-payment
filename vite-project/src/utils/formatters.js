/**
 * Formats a numeric value into Indian Rupee currency format (₹).
 * @param {number|string} n
 * @returns {string}
 */
export function money(n) {
  const value = Number(n || 0);
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Formats a date string or Date object into YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
export function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns a Date object n days in the past.
 * @param {number} n
 * @returns {Date}
 */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Escapes HTML characters for safe rendering.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Safely decodes a JWT token payload without external libraries.
 * @param {string} token
 * @returns {object|null}
 */
export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to decode JWT:', err);
    return null;
  }
}

/**
 * Checks if a JWT token is expired.
 * @param {string} token
 * @returns {boolean}
 */
export function isTokenExpired(token) {
  const decoded = decodeJwt(token);
  if (!decoded || !decoded.exp) return true;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return decoded.exp < nowInSeconds;
}

