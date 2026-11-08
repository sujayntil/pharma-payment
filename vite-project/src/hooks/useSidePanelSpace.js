import { useMediaQuery } from '@mantine/hooks';

/** Width of the desktop invoice side panel (InvoiceHistory). */
export const SIDE_PANEL_WIDTH = 480;

/**
 * On wide screens (≥ 1440px) a list makes room for the open invoice panel so
 * both sit side by side and no column is hidden. On smaller laptops the panel
 * overlays the right edge of the list instead (it does not block clicks).
 * Returns a style to spread on the page's root element.
 */
export function useSidePanelSpace(open) {
  const wide = useMediaQuery('(min-width: 90em)', false, { getInitialValueInEffect: false });
  return open && wide ? { paddingRight: SIDE_PANEL_WIDTH, transition: 'padding-right 200ms ease' } : { transition: 'padding-right 200ms ease' };
}
