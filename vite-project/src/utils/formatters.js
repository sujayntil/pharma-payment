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
 * Readable message from an API error. FastAPI validation errors arrive as
 * an array of objects, which React cannot render directly.
 */
export function errorText(err, fallback = 'Something went wrong.') {
  const detail = err?.detail ?? err?.message;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join(' ');
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail);
  return detail || fallback;
}

/** Date + time in India, e.g. "8 Nov 2026, 4:05 pm". */
export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}

/** Short date for YYYY-MM-DD strings, e.g. "8 Nov 2026". */
export function shortDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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


/**
 * Saves an Excel (or any file) response from the API. Uses the file name the
 * server sent in Content-Disposition, falling back to `fallbackName`.
 */
export function saveDownload(response, fallbackName) {
  const header = response.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Error text from a failed file download (the error body arrives as a Blob). */
export async function downloadErrorText(err, fallback = 'Could not export.') {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).detail || fallback; } catch { return fallback; }
  }
  return errorText(err, fallback);
}
