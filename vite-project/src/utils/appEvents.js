/** Window event: reload the Admin bell now (a payment alert just arrived). */
export const BELL_REFRESH_EVENT = 'bell:refresh';

/** Window event: refresh the current page now, quietly (e.g. after an Undo). */
export const REFRESH_NOW_EVENT = 'app:refresh-now';

/** Window event: an MR's collection cleared a whole month; detail = [{ month, label, invoices, on_time }]. */
export const MONTH_CLEARED_EVENT = 'collect:month-cleared';

/** Window event: the month-cleared trophy has landed in the top-bar counter (reload it, bump, confetti). */
export const TROPHY_LANDED_EVENT = 'trophy:landed';

/** Window event: a month-cleared celebration started; detail = month keys whose trophies are still "in the air" (not shown in the counter yet). */
export const TROPHY_PENDING_EVENT = 'trophy:pending';
