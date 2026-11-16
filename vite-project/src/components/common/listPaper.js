/** Lists sit in a bordered panel on desktop; on phones the cards stand on their own. */
export const listPaperProps = (isMobile) => (isMobile ? { p: 0, bg: 'transparent' } : { withBorder: true, p: 'md' });

/**
 * While a list reloads (filter, page, after saving) keep the current rows on
 * screen, dimmed, instead of blanking to a spinner. Spread on the list's Paper.
 */
// Set while an automatic background refresh runs: the list then updates in
// place without dimming (it happens every 20 seconds and must not flicker).
let quietReload = false;
export const setQuietReload = (value) => { quietReload = value; };

export const reloadingStyle = (rawReloading) => {
  const reloading = rawReloading && !quietReload;
  return {
  style: { opacity: reloading ? 0.55 : 1, transition: 'opacity 150ms ease', pointerEvents: reloading ? 'none' : undefined },
  'aria-busy': reloading || undefined,
  };
};
