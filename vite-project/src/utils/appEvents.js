/** Window event: reload the Admin bell now (a payment alert just arrived). */
export const BELL_REFRESH_EVENT = 'bell:refresh';

/** Window event: refresh the current page now, quietly (e.g. after an Undo). */
export const REFRESH_NOW_EVENT = 'app:refresh-now';

/** Window event: an MR's collection cleared a whole month; detail = [{ month, label, invoices, on_time }]. */
export const MONTH_CLEARED_EVENT = 'collect:month-cleared';
