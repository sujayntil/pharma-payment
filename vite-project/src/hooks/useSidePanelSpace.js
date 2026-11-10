import { useMediaQuery } from '@mantine/hooks';

/** Width of the desktop invoice side panel (InvoiceHistory) on wide screens. */
export const SIDE_PANEL_WIDTH = 480;
/** Narrower panel on laptops (1200–1439px) so the list keeps more room. */
export const SIDE_PANEL_WIDTH_LAPTOP = 400;

const OPTIONS = { getInitialValueInEffect: false };

/** Panel width for the current screen. */
export function useSidePanelWidth() {
  const wide = useMediaQuery('(min-width: 90em)', false, OPTIONS);
  return wide ? SIDE_PANEL_WIDTH : SIDE_PANEL_WIDTH_LAPTOP;
}

/**
 * From laptop width up (≥ 1200px) a list makes room for the open invoice
 * panel, so the two sit side by side and the panel never covers columns,
 * filters or the Reset button. The table scrolls inside the remaining space
 * and its action column stays pinned. On smaller screens the panel overlays
 * the right edge of the list instead (it does not block clicks).
 * Returns a style to spread on the page's root element.
 */
export function useSidePanelSpace(open) {
  const roomy = useMediaQuery('(min-width: 75em)', false, OPTIONS);
  const width = useSidePanelWidth();
  return open && roomy ? { paddingRight: width, transition: 'padding-right 200ms ease' } : { transition: 'padding-right 200ms ease' };
}
