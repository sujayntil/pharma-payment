import { MONTH_CLEARED_EVENT } from '../../utils/appEvents';

/** Shows the "month cleared" pill (call after the collection celebration). */
export function announceMonthsCleared(months) {
  if (months?.length) window.dispatchEvent(new CustomEvent(MONTH_CLEARED_EVENT, { detail: months }));
}
