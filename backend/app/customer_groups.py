"""Customer type groups as Insights counts them (Distributor / Chemist /
Doctor / Hospital / Other), as an SQL filter on invoices."""
from fastapi import HTTPException
from sqlalchemy import func, or_

from . import models
from .insights import TYPE_GROUPS


def invoice_type_filter(db, customer_type: str):
    """Condition on Invoice: its customer is in that group. "Other" also
    covers any other type, no type, and invoices with no customer."""
    group = next((g for g in TYPE_GROUPS if g.lower() == (customer_type or "").strip().lower()), None)
    if group is None:
        raise HTTPException(422, "customer_type must be Distributor, Chemist, Doctor, Hospital or Other")
    normalized = func.lower(func.trim(func.coalesce(models.Customer.type, "")))
    if group == "Other":
        named = [g.lower() for g in TYPE_GROUPS if g != "Other"]
        ids = db.query(models.Customer.id).filter(~normalized.in_(named))
        return or_(models.Invoice.customer_id.is_(None), models.Invoice.customer_id.in_(ids))
    return models.Invoice.customer_id.in_(db.query(models.Customer.id).filter(normalized == group.lower()))
