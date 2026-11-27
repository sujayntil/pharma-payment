/* Colours and number format shared by the Insights page. */

// Customer types use calm, distinct tones; green / amber / red stay for money status only.
export const TYPE_COLORS = { Distributor: '#364fc7', Chemist: '#1098ad', Doctor: '#7950f2', Hospital: '#5c7cfa', Other: '#868e96' };
export const MR_COLORS = ['#2f9e44', '#1c7ed6', '#f08c00', '#7048e8', '#e64980', '#0ca678', '#d6336c', '#5c7cfa'];
export const MODE_COLORS = { UPI: '#7048e8', Cash: '#2f9e44', Cheque: '#f08c00', NEFT: '#1c7ed6', RTGS: '#1864ab', IMPS: '#4dabf7', 'Bank Transfer': '#74c0fc', Other: '#868e96', Reversal: '#e03131' };
// Money owed today, by days past the credit period (40 days; 60 for distributors).
export const AGE_COLORS = { '0-39': '#2f9e44', '40-59': '#fab005', '60-89': '#f76707', '90+': '#e03131' };
export const AGE_LABELS = { '0-39': 'Under 40 days old', '40-59': '40–60 days old', '60-89': '60–90 days old', '90+': 'Over 90 days old' };

/** ₹5.26 L / ₹95,700 */
export function lakh(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(Math.abs(n) >= 1000000 ? 1 : 2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
