/** The Overdue filter's options and labels (Invoices, MR Invoices, ledgers, Insights). */
export const DUE_OPTIONS = [
  { value: 'notdue', label: 'Not yet due' },
  { value: 'overdue', label: 'Overdue' },
];

/** Chip / scope text: "Overdue", "Overdue by more than 3 days", "Not yet due". */
export function dueLabel(due, days) {
  if (due === 'notdue') return 'Not yet due';
  if (due === 'overdue') return days !== '' && days != null ? `Overdue by more than ${days} ${Number(days) === 1 ? 'day' : 'days'}` : 'Overdue';
  return '';
}

/** API params for the filter. */
export function dueParams(due, days) {
  if (!due) return {};
  return { due, ...(due === 'overdue' && days !== '' && days != null && { overdue_days: Number(days) }) };
}

/** Client-side check for lists that already carry days_late (Insights panels). */
export function matchesDue(daysLate, due, days) {
  if (!due) return true;
  const late = daysLate == null ? null : Number(daysLate);
  if (due === 'notdue') return late !== null && late < 0;
  if (late === null || late < 0) return false;
  return days === '' || days == null ? true : late > Number(days);
}
