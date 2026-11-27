import { useEffect, useState } from 'react';
import { getToken, isKeptSignedIn } from '../utils/authToken';
import { decodeJwt } from '../utils/formatters';

/**
 * useState that a page remembers: leave the page and come back, and the
 * filters are as you left them, until you press Reset (or sign out).
 *
 * Kept per person (the signed-in user's id) and where the login is kept:
 * "Keep me signed in" -> this device; otherwise until the app is closed.
 * Signing out forgets them (utils/authToken.js clearToken).
 * `skip`: start from `initial` this time (e.g. opened from a link that
 * brings its own filters); the value is still remembered from then on.
 */
export const REMEMBER_PREFIX = 'remembered:';

function storage() {
  try { return isKeptSignedIn() ? localStorage : sessionStorage; } catch { return null; }
}

function keyFor(name) {
  const user = decodeJwt(getToken())?.sub || 'anon';
  return `${REMEMBER_PREFIX}${user}:${name}`;
}

export function useRememberedState(name, initial, { skip = false } = {}) {
  const [value, setValue] = useState(() => {
    const fallback = typeof initial === 'function' ? initial() : initial;
    if (skip) return fallback;
    try {
      const raw = storage()?.getItem(keyFor(name));
      return raw === null || raw === undefined ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  });
  useEffect(() => {
    try { storage()?.setItem(keyFor(name), JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }, [name, value]);
  return [value, setValue];
}

