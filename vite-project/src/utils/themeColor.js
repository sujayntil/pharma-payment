const META = { light: '#2f6f4e', dark: '#1f1f1f' };
const KEY = 'mantine-color-scheme-value';

/** Keeps the phone's status bar (and the page behind overscroll) in step with the look in use. */
export function syncThemeColor(scheme = localStorage.getItem(KEY) || 'light') {
  const dark = scheme === 'dark' || (scheme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? META.dark : META.light);
  document.documentElement.style.background = dark ? META.dark : '';
}

/** "System" follows the phone: keep the status bar right when the phone switches. */
export function watchSystemTheme() {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncThemeColor());
}
