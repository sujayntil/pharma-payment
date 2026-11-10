/** Lists sit in a bordered panel on desktop; on phones the cards stand on their own. */
export const listPaperProps = (isMobile) => (isMobile ? { p: 0, bg: 'transparent' } : { withBorder: true, p: 'md' });

/**
 * While a list reloads (filter, page, after saving) keep the current rows on
 * screen, dimmed, instead of blanking to a spinner. Spread on the list's Paper.
 */
export const reloadingStyle = (reloading) => ({
  style: { opacity: reloading ? 0.55 : 1, transition: 'opacity 150ms ease', pointerEvents: reloading ? 'none' : undefined },
  'aria-busy': reloading || undefined,
});
