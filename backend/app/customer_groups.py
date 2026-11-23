"""Customer type groups, one definition for every screen:
Distributor / Chemist / Doctor / Hospital / Other (as Insights counts them).

A filter can hold several groups ("Chemist,Doctor"). "Other" covers any
other type, no type at all, and invoices with no customer.
"""
from fastapi import HTTPException
from sqlalchemy import false, func, or_, true

from . import models
from .insights import TYPE_GROUPS

NAMED = [g for g in TYPE_GROUPS if g != "Other"]
_MESSAGE = "customer_type must be one or more of Distributor, Chemist, Doctor, Hospital, Other (comma separated)"


def parse_types(value: str | None) -> list[str]:
    """ "chemist, Doctor" -> ["Chemist", "Doctor"]. Empty -> [] (all types). 422 on an unknown name."""
    out: list[str] = []
    for part in (value or "").split(","):
        part = part.strip().lower()
        if not part:
            continue
        group = next((g for g in TYPE_GROUPS if g.lower() == part), None)
        if group is None:
            raise HTTPException(422, _MESSAGE)
        if group not in out:
            out.append(group)
    return out


def customer_group_condition(types: list[str]):
    """Condition on models.Customer (outer-joined: a missing customer counts as Other)."""
    normalized = func.lower(func.trim(func.coalesce(models.Customer.type, "")))
    parts = []
    wanted = [g.lower() for g in types if g != "Other"]
    if wanted:
        parts.append(normalized.in_(wanted))
    if "Other" in types:
        parts.append(or_(models.Customer.id.is_(None), ~normalized.in_([g.lower() for g in NAMED])))
    return or_(*parts) if parts else false()


def invoice_type_filter(db, customer_type: str):
    """Condition on Invoice: its customer is in one of these groups."""
    types = parse_types(customer_type)
    if not types:
        return true()
    parts = []
    named = [t for t in types if t != "Other"]
    if named:
        parts.append(models.Invoice.customer_id.in_(db.query(models.Customer.id).filter(customer_group_condition(named))))
    if "Other" in types:
        normalized = func.lower(func.trim(func.coalesce(models.Customer.type, "")))
        others = db.query(models.Customer.id).filter(~normalized.in_([g.lower() for g in NAMED]))
        parts.append(or_(models.Invoice.customer_id.is_(None), models.Invoice.customer_id.in_(others)))
    return or_(*parts)
