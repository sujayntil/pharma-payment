import { createContext, useContext } from 'react';

/**
 * App-wide "refresh" signal. The refresh button (Admin, MR on laptop) and
 * pull-to-refresh (MR on phone) bump refreshKey; every page adds it to the
 * effect that loads its data, so the page reloads in place and keeps its
 * filters, search, tab, page and open panel.
 */
export const AppRefreshContext = createContext({ refreshKey: 0, refreshing: false, lastUpdated: null, refresh: () => {} });

/** The current refresh key: put it in a data-loading effect's dependencies. */
export function useAppRefresh() {
  return useContext(AppRefreshContext).refreshKey;
}

/** refresh(), refreshing and lastUpdated, for the refresh controls. */
export function useAppRefreshControl() {
  return useContext(AppRefreshContext);
}
