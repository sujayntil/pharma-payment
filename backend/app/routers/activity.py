"""Admin "Audit log": one read-only timeline of what everyone did.

It merges three records that already exist:
  * audit_log       changes (customers, invoices, users, MR mapping, phone
                    numbers, undo), sign-ins / sign-outs, imports, exports
  * invoice_events  money: collections and reversals (with who and when)
Every Admin sees everyone's entries (all MRs and all Admins). Nothing here
can change or delete an entry.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session, aliased

from .. import models
from ..collection_info import as_utc
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/admin/audit", tags=["audit"])

_IST = timezone(timedelta(hours=5, minutes=30))

# Filter "Type" -> audit_log actions it covers.
AUDIT_TYPES = {
    "reversals": ["payment_undone"],
    "invoices": ["invoice_created", "invoice_updated", "invoice_deleted", "invoice_restored"],
    "customers": ["customer_created", "customer_updated", "customer_deleted", "customer_restored", "customer_mr_changed", "customer_contact_updated"],
    "users": ["user_created", "user_updated", "user_deleted"],
    "sign_ins": ["signed_in", "sign_in_failed", "signed_out"],
    "files": ["invoices_imported", "invoices_exported", "collections_exported", "customers_exported", "ledger_exported", "deletions_exported", "backup_downloaded"],
}
# Filter "Type" -> invoice_events types it covers.
EVENT_TYPES = {
    "collections": [models.InvoiceEventType.COLLECTED.value],
    "reversals": [models.InvoiceEventType.REVERSED.value],
}
# Never shown as a change (ids and figures that follow from other fields).
_HIDDEN_FIELDS = {"customer_id", "invoice_id", "user_id", "paid_amount", "pending_amount", "status", "payments"}


def _bounds(date_from: Optional[date], date_to: Optional[date]):
    """India-time day range -> stored (UTC) timestamps."""
    start = datetime.combine(date_from, time.min, tzinfo=_IST).astimezone(timezone.utc).replace(tzinfo=None) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=_IST).astimezone(timezone.utc).replace(tzinfo=None) if date_to else None
    return start, end


def _actor(user):
    return {"id": user.id, "name": user.name, "role": user.role} if user else None


@router.get("")
def audit_log(
    user_id: Optional[int] = None,
    role: Optional[str] = None,
    type: Optional[str] = None,  # noqa: A002 - matches the filter name in the app
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0, le=20000),
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    if type and type not in AUDIT_TYPES and type not in EVENT_TYPES:
        raise HTTPException(422, "Unknown type")
    if role and role not in ("ADMIN", "MR"):
        raise HTTPException(422, "role must be ADMIN or MR")
    start, end = _bounds(date_from, date_to)
    term = f"%{search.strip()}%" if search and search.strip() else None
    need = offset + limit

    # ---- changes, sign-ins, files (audit_log) ----
    audit_rows, audit_total = [], 0
    actions = AUDIT_TYPES.get(type) if type else [a for group in AUDIT_TYPES.values() for a in group]
    if actions:
        actor = aliased(models.User)
        q = db.query(models.AuditLog, actor).outerjoin(actor, actor.id == models.AuditLog.user_id).filter(models.AuditLog.action.in_(actions))
        if user_id:
            q = q.filter(models.AuditLog.user_id == user_id)
        if role:
            q = q.filter(actor.role == role)
        if start:
            q = q.filter(models.AuditLog.timestamp >= start)
        if end:
            q = q.filter(models.AuditLog.timestamp < end)
        if term:
            q = q.filter(or_(cast(models.AuditLog.old_value, String).ilike(term), cast(models.AuditLog.new_value, String).ilike(term), actor.name.ilike(term)))
        audit_total = q.count()
        audit_rows = q.order_by(models.AuditLog.timestamp.desc(), models.AuditLog.id.desc()).limit(need).all()

    # ---- money (invoice_events) ----
    event_rows, event_total = [], 0
    kinds = EVENT_TYPES.get(type) if type else [k for group in EVENT_TYPES.values() for k in group]
    if kinds:
        actor = aliased(models.User)
        q = (
            db.query(models.InvoiceEvent, models.Invoice, models.Customer, actor)
            .join(models.Invoice, models.Invoice.id == models.InvoiceEvent.invoice_id)
            .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
            .outerjoin(actor, actor.id == models.InvoiceEvent.actor_id)
            .filter(models.InvoiceEvent.event_type.in_(kinds))
        )
        if user_id:
            q = q.filter(models.InvoiceEvent.actor_id == user_id)
        if role:
            q = q.filter(actor.role == role)
        if start:
            q = q.filter(models.InvoiceEvent.created_at >= start)
        if end:
            q = q.filter(models.InvoiceEvent.created_at < end)
        if term:
            q = q.filter(or_(models.Invoice.invoice_number.ilike(term), models.Customer.name.ilike(term), actor.name.ilike(term)))
        event_total = q.count()
        event_rows = q.order_by(models.InvoiceEvent.created_at.desc(), models.InvoiceEvent.id.desc()).limit(need).all()

    # MR names for "changed MR: Rahul -> Faiyaz" and similar.
    user_ids = set()
    for row, _ in audit_rows:
        for value in (row.old_value, row.new_value):
            if isinstance(value, dict) and value.get("mr_id"):
                user_ids.add(value["mr_id"])
    names = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()} if user_ids else {}

    items = [_audit_item(row, actor, names) for row, actor in audit_rows]
    items += [_event_item(event, invoice, customer, actor) for event, invoice, customer, actor in event_rows]
    items.sort(key=lambda item: (item["at"] or datetime.min.replace(tzinfo=timezone.utc), item["id"]), reverse=True)
    return {"items": items[offset:offset + limit], "total": audit_total + event_total, "limit": limit, "offset": offset}


def _audit_item(row: models.AuditLog, actor, names: dict) -> dict:
    old = row.old_value if isinstance(row.old_value, dict) else {}
    new = row.new_value if isinstance(row.new_value, dict) else {}
    both = {**old, **new}
    item = {
        "id": f"a{row.id}",
        "at": as_utc(row.timestamp),
        "actor": _actor(actor),
        "action": row.action,
        "invoice": None,
        "customer": None,
        "subject": None,
        "amount": None,
        "mode": None,
        "reference": None,
        "reason": None,
        "info": {},
        "changes": [],
    }
    if row.action.startswith("customer_"):
        item["customer"] = {"id": both.get("customer_id") if row.action != "customer_deleted" else None, "name": both.get("name")}
    elif row.action.startswith("invoice_") and row.action != "invoices_imported" and row.action != "invoices_exported":
        item["invoice"] = {"id": both.get("invoice_id") if row.action != "invoice_deleted" else None, "number": both.get("invoice_number")}
        item["customer"] = {"id": both.get("customer_id"), "name": both.get("customer_name")} if both.get("customer_name") else None
        item["amount"] = both.get("total_amount")
        if row.action == "invoice_deleted":
            item["reason"] = (row.new_value or {}).get("reason")
    elif row.action.startswith("user_"):
        item["subject"] = {"name": both.get("name"), "role": both.get("role"), "employee_code": both.get("employee_code")}
    elif row.action == "payment_undone":
        parts = old.get("payments") or []
        item["amount"] = round(sum(part.get("amount") or 0 for part in parts), 2)
        numbers = [part.get("invoice_number") for part in parts if part.get("invoice_number")]
        if parts:
            item["invoice"] = {"id": parts[0].get("invoice_id"), "number": numbers[0] if len(numbers) == 1 else f"{numbers[0]} +{len(numbers) - 1}"}
        item["mode"] = parts[0].get("mode") if parts else None
    elif row.action in ("signed_in", "sign_in_failed", "signed_out"):
        item["info"] = {key: new.get(key) for key in ("employee_code", "address") if new.get(key)}
    elif row.action in ("invoices_imported", "invoices_exported", "collections_exported", "customers_exported", "ledger_exported", "deletions_exported", "backup_downloaded"):
        item["info"] = {key: value for key, value in new.items() if value not in (None, "", {}, [])}

    if old and new and row.action.endswith(("_updated", "_changed")):
        for key in sorted(set(old) | set(new)):
            if key in _HIDDEN_FIELDS or old.get(key) == new.get(key):
                continue
            before, after = old.get(key), new.get(key)
            if key == "mr_id":
                key, before, after = "mr", names.get(before) if before else None, names.get(after) if after else None
            item["changes"].append({"field": key, "old": before, "new": after})
    return item


def _event_item(event: models.InvoiceEvent, invoice, customer, actor) -> dict:
    return {
        "id": f"e{event.id}",
        "at": as_utc(event.created_at),
        "actor": _actor(actor),
        "action": "collected" if event.event_type == models.InvoiceEventType.COLLECTED.value else "reversed",
        "invoice": {"id": invoice.id, "number": invoice.invoice_number},
        "customer": {"id": customer.id, "name": customer.name} if customer else None,
        "subject": None,
        "amount": abs(event.amount) if event.amount is not None else None,
        "mode": event.mode,
        "reference": event.reference,
        "reason": event.reason,
        "info": {},
        "changes": [],
    }
