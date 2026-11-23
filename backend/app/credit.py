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


# ---- "Overdue" filter for invoice lists (Invoices, MR Invoices, ledgers) ----
# due = "overdue": past the due date (bill date + credit period);
#       with more_than = N: more than N days past it.
# due = "notdue": still within the credit period.
# Only bills with money still due; paid bills are never overdue.

def due_filter_condition(due: str | None, more_than: int | None, today: date):
    """SQL condition on Invoice for the overdue filter, or None for "All bills".
    Uses the same rule as days_past_credit, so totals agree with Insights."""
    from datetime import timedelta

    from sqlalchemy import and_, func, or_, select

    from . import models

    if not due:
        return None
    if due not in ("overdue", "notdue"):
        raise ValueError("due must be overdue or notdue")
    if more_than is not None and (more_than < 0 or more_than > 999):
        raise ValueError("overdue_days must be 0 to 999")
    normalized = func.lower(func.trim(func.coalesce(models.Customer.type, "")))
    parts, special = [], []
    for name, days in CREDIT_DAYS_BY_TYPE.items():
        ids = select(models.Customer.id).where(normalized == name)
        special.append(models.Invoice.customer_id.in_(ids))
        parts.append((models.Invoice.customer_id.in_(ids), days))
    default = or_(models.Invoice.customer_id.is_(None), *[~s for s in special]) if special else True
    parts.append((default, DEFAULT_CREDIT_DAYS))

    shift = (more_than + 1) if (due == "overdue" and more_than is not None) else 0
    branches = []
    for who, days in parts:
        cutoff = today - timedelta(days=days + shift)   # overdue: billed on or before this day
        if due == "overdue":
            branches.append(and_(who, models.Invoice.invoice_date <= cutoff))
        else:
            branches.append(and_(who, models.Invoice.invoice_date > today - timedelta(days=days)))
    return and_(models.Invoice.pending_amount > 0.009, models.Invoice.invoice_date.isnot(None), or_(*branches))
