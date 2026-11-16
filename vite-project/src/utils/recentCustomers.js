/**
 * The customers this person opened most recently, kept on their phone
 * (newest first, at most 5). Shown as the "Recent" row on My customers.
 */
const KEY = 'recent-customers';
const MAX = 5;

export function recentCustomers() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => item && item.id && item.name).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberCustomer(customer) {
  if (!customer?.id || !customer?.name) return;
  try {
    const rest = recentCustomers().filter((item) => item.id !== customer.id);
    localStorage.setItem(KEY, JSON.stringify([{ id: customer.id, name: customer.name }, ...rest].slice(0, MAX)));
  } catch { /* storage unavailable */ }
}
