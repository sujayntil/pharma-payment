import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { failureCount, whenIdle } from '../../api/axiosClient';
import { AppRefreshContext } from '../../hooks/useAppRefresh';
import { setQuietReload } from './listPaper';
import { REFRESH_NOW_EVENT } from '../../utils/appEvents';

const MIN_SPIN_MS = 600;
const AUTO_EVERY_MS = 20000;   // quiet check while the app is on screen (every 20 s)
const AWAY_MS = 20000;         // coming back after this long refreshes at once

/** Someone is typing in a box: don't move things under their fingers. */
const typing = () => {
  const el = document.activeElement;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
};

/** Holds the app-wide refresh key; see useAppRefresh. */
export default function AppRefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return; // a second tap while loading does nothing
    busy.current = true; setRefreshing(true);
    const failedBefore = failureCount();
    const started = Date.now();
    setRefreshKey((key) => key + 1);
    await whenIdle();
    const left = MIN_SPIN_MS - (Date.now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
    if (failureCount() > failedBefore) {
      notifications.show({ id: 'refresh-failed', color: 'red', message: "Couldn't refresh. Check your connection." });
    } else {
      setLastUpdated(Date.now());
    }
    busy.current = false; setRefreshing(false);
  }, []);

  // Automatic, silent refresh: every 20 seconds while the app is on screen, and
  // straight away when the user comes back to it after 20 seconds or more
  // (e.g. from WhatsApp or a call). No spinner, no dimming, no error
  // message; skipped while offline, while typing, or during another refresh.
  const quietRefresh = useCallback(async () => {
    if (busy.current || document.hidden || navigator.onLine === false || typing()) return;
    busy.current = true;
    setQuietReload(true);
    setRefreshKey((key) => key + 1);
    await whenIdle();
    setQuietReload(false);
    setLastUpdated(Date.now());
    busy.current = false;
  }, []);

  useEffect(() => {
    let hiddenAt = document.hidden ? Date.now() : null;
    const timer = setInterval(quietRefresh, AUTO_EVERY_MS);
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) quietRefresh();
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Something changed the data on purpose (an Undo): reload right away.
    const now = () => { busy.current = false; quietRefresh(); };
    window.addEventListener(REFRESH_NOW_EVENT, now);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(REFRESH_NOW_EVENT, now);
    };
  }, [quietRefresh]);

  const value = useMemo(() => ({ refreshKey, refreshing, lastUpdated, refresh }), [refreshKey, refreshing, lastUpdated, refresh]);
  return <AppRefreshContext.Provider value={value}>{children}</AppRefreshContext.Provider>;
}
