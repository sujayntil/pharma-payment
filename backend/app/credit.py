"""Credit period: how many days a customer gets before a bill counts as overdue.

One place for the rule so the dashboard, reminders, exports and Insights agree.
A bill is overdue once it is `credit_days` old (40 days; 60 for distributors).
"""
from datetime import date

DEFAULT_CREDIT_DAYS = 40
CREDIT_DAYS_BY_TYPE = {"distributor": 60}


def credit_days(customer_type: str | None) -> int:
    return CREDIT_DAYS_BY_TYPE.get((customer_type or "").strip().lower(), DEFAULT_CREDIT_DAYS)


def days_past_credit(invoice_date: date | None, customer_type: str | None, today: date) -> int | None:
    """Days beyond the credit period: negative = not yet due, 0 or more = overdue."""
    if invoice_date is None:
        return None
    return (today - invoice_date).days - credit_days(customer_type)


def is_overdue(invoice_date: date | None, customer_type: str | None, today: date) -> bool:
    late = days_past_credit(invoice_date, customer_type, today)
    return late is not None and late >= 0
