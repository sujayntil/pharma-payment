/** Customer types offered in forms and filters. */
export const CUSTOMER_TYPES = ['Distributor', 'Chemist', 'Doctor', 'Hospital'];

/** The list plus the customer's own type, if it is something else (older data). */
export function typeOptions(current) {
  return current && !CUSTOMER_TYPES.includes(current) ? [...CUSTOMER_TYPES, current] : CUSTOMER_TYPES;
}
