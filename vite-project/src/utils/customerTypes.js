/** Customer types offered in forms and filters. */
export const CUSTOMER_TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital'];

/** The list plus the customer's own type, if it is something else (older data). */
export function typeOptions(current) {
  return current && !CUSTOMER_TYPES.includes(current) ? [...CUSTOMER_TYPES, current] : CUSTOMER_TYPES;
}

/** Customer type groups for filters (as Insights counts them). "Other" =
 * any other type, no type, or no customer. */
export const TYPE_GROUPS = ['Distributor', 'Chemist', 'Doctor', 'Hospital', 'Other'];

/** "Chemist,Doctor" -> "Chemist, Doctor" for filter chips and titles. */
export const listLabel = (value) => String(value || '').split(',').filter(Boolean).join(', ');
