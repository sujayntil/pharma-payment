/* Colours and number format shared by the Insights page. */

export const TYPE_COLORS = { Distributor: '#f08c00', Chemist: '#2f9e44', Doctor: '#1c7ed6', Hospital: '#7048e8', Other: '#868e96' };
export const MR_COLORS = ['#2f9e44', '#1c7ed6', '#f08c00', '#7048e8', '#e64980', '#0ca678', '#d6336c', '#5c7cfa'];
export const MODE_COLORS = { Upi: '#7048e8', Cash: '#2f9e44', Cheque: '#f08c00', Bank: '#1c7ed6' };
export const AGE_COLORS = { '0-30': '#2f9e44', '31-60': '#fab005', '61-90': '#f76707', '90+': '#e03131' };

/** ₹5.26 L / ₹95,700 */
export function lakh(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(Math.abs(n) >= 1000000 ? 1 : 2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
