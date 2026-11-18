// Credit period: a bill is overdue once it is this many days old.
// Same rule as the server (backend/app/credit.py): 40 days, 60 for distributors.
export const DEFAULT_CREDIT_DAYS = 40;
export const creditDaysFor = (customerType) => (/distributor/i.test(customerType || '') ? 60 : DEFAULT_CREDIT_DAYS);
