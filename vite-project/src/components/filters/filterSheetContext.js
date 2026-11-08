import { createContext, useContext } from 'react';

/**
 * True for filters rendered inside the mobile bottom sheet. Dropdowns there
 * sit in a fixed, animated container, so they use fixed positioning and skip
 * Mantine's "hide when detached" check, which otherwise toggles the dropdown
 * on and off (flicker) while the sheet settles.
 */
export const FilterSheetContext = createContext(false);

export const useInFilterSheet = () => useContext(FilterSheetContext);

/** Popover/Combobox props for dropdowns opened from inside the sheet. */
export const SHEET_DROPDOWN_PROPS = { hideDetached: false, floatingStrategy: 'fixed' };
