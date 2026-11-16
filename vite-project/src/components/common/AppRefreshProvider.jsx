import { useCallback, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { failureCount, whenIdle } from '../../api/axiosClient';
import { AppRefreshContext } from '../../hooks/useAppRefresh';

const MIN_SPIN_MS = 600;

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

  const value = useMemo(() => ({ refreshKey, refreshing, lastUpdated, refresh }), [refreshKey, refreshing, lastUpdated, refresh]);
  return <AppRefreshContext.Provider value={value}>{children}</AppRefreshContext.Provider>;
}
