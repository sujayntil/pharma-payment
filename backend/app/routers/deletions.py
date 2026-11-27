"""Deleted items: one place to track what was removed (invoices, customers,
users, undone collections), who removed it, when and why, and to restore an
invoice or customer within 30 days.

Built on the audit log: every delete already saves a full copy there first.
A restore is a new audit row ("invoice_restored" / "customer_restored") that
points back at the deletion, so the log itself is never edited."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from .. import models
from ..audit import write_audit
from ..collection_info import mode_label
from ..database import get_db
from ..deps import require_admin
from ..excel_export import EXPORT_MAX_ROWS, to_ist
from ..reports import Col, Report, Sheet, check_format, describe, file_name, report_response
from ..utils import compute_status

router = APIRouter(prefix="/admin/deletions", tags=["deletions"])

IST = timezone(timedelta(hours=5, minutes=30))
RESTORE_DAYS = 30
KINDS = {"invoice_deleted": "invoice", "customer_deleted": "customer", "user_deleted": "user", "payment_undone": "undone"}
RESTORES = {"invoice_restored", "customer_restored"}


def _utc(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _restored_map(db: Session) -> dict[int, tuple]:
    """deletion audit id -> (restore row, restorer name)."""
    rows = (
        db.query(models.AuditLog, models.User.name)
        .outerjoin(models.User, models.User.id == models.AuditLog.user_id)
        .filter(models.AuditLog.action.in_(RESTORES)).all()
    )
    out = {}
    for row, name in rows:
        src = (row.new_value or {}).get("restored_from")
        if src:
            out[int(src)] = (row, name)
    return out


def restored_deletion_ids(db: Session) -> set[int]:
    return set(_restored_map(db))


def _why_not(db: Session, row: models.AuditLog, kind: str, restored) -> str | None:
    """None when it can be restored, else a short reason."""
    if kind not in ("invoice", "customer"):
        return "Can't be restored"
    if restored:
        return "Already restored"
    when = _utc(row.timestamp)
    if when and datetime.now(timezone.utc) - when > timedelta(days=RESTORE_DAYS):
        return f"Older than {RESTORE_DAYS} days"
    old = row.old_value or {}
    if kind == "invoice":
        if not old.get("invoice_number"):
            return "Not enough detail was saved"
        if old.get("customer_id") and not db.get(models.Customer, old["customer_id"]):
            return "Its customer was deleted — restore the customer first"
        clash = db.query(models.Invoice.id).filter(models.Invoice.invoice_number == old["invoice_number"])
        clash = clash.filter(models.Invoice.customer_id == old.get("customer_id")) if old.get("customer_id") else clash
        if clash.first():
            return f"{old['invoice_number']} was added again since"
        if old.get("external_key") and db.query(models.Invoice.id).filter(models.Invoice.external_key == old["external_key"]).first():
            return f"{old['invoice_number']} was imported again since"
        return None
    name = (old.get("name") or "").strip()
    if not name:
        return "Not enough detail was saved"
    from sqlalchemy import func
    if db.query(models.Customer.id).filter(func.lower(func.trim(models.Customer.name)) == name.lower()).first():
        return f"A customer named “{name}” exists now"
    return None


def _row(db: Session, row: models.AuditLog, by_name: str | None, restored_map: dict, names: dict) -> dict:
    kind = KINDS[row.action]
    old = row.old_value or {}
    new = row.new_value or {}
    restored = restored_map.get(row.id)
    out = {
        "id": row.id, "kind": kind, "at": _utc(row.timestamp), "by": by_name, "by_id": row.user_id,
        "reason": new.get("reason"), "bulk": bool(new.get("bulk_id")),
        "restored": {"at": _utc(restored[0].timestamp), "by": restored[1]} if restored else None,
    }
    if kind == "invoice":
        payments = old.get("payments") or []
        out.update(title=old.get("invoice_number"), customer=old.get("customer_name"), customer_id=old.get("customer_id"),
                   mr=names.get(old.get("mr_id")), date=old.get("invoice_date"), amount=old.get("total_amount") or 0,
                   collected=round(max(old.get("paid_amount") or 0, 0), 2), payments=len(payments), status=old.get("status"))
    elif kind == "customer":
        out.update(title=old.get("name"), customer=old.get("name"), mr=names.get(old.get("mr_id")),
                   type=old.get("type"), phone=old.get("phone"), area=old.get("area"), amount=None, collected=0)
    elif kind == "user":
        out.update(title=old.get("name"), code=old.get("employee_code"), role=old.get("role"), amount=None, collected=0)
    else:  # undone collection(s): from the Undo bar right after saving
        parts = old.get("payments") or []
        numbers = [p.get("invoice_number") for p in parts if p.get("invoice_number")]
        out.update(title=numbers[0] if len(numbers) == 1 else (", ".join(numbers[:2]) + (f" +{len(numbers) - 2}" if len(numbers) > 2 else "")),
                   amount=round(sum(p.get("amount") or 0 for p in parts), 2), collected=0,
                   mode=mode_label(parts[0].get("mode")) if parts else None, payments=len(parts))
    why = _why_not(db, row, kind, restored)
    out["can_restore"] = why is None
    out["restore_note"] = why
    return out


def _query_rows(db, date_from, date_to, kind, by_id, search):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    if kind and kind not in KINDS.values():
        raise HTTPException(422, "kind must be invoice, customer, user or undone")
    actions = [a for a, k in KINDS.items() if not kind or k == kind]
    q = (
        db.query(models.AuditLog, models.User.name)
        .outerjoin(models.User, models.User.id == models.AuditLog.user_id)
        .filter(models.AuditLog.action.in_(actions))
    )
    if date_from:
        q = q.filter(models.AuditLog.timestamp >= datetime.combine(date_from, time.min, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None))
    if date_to:
        q = q.filter(models.AuditLog.timestamp < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None))
    if by_id:
        q = q.filter(models.AuditLog.user_id == by_id)
    rows = q.order_by(models.AuditLog.id.desc()).limit(EXPORT_MAX_ROWS).all()
    restored_map = _restored_map(db)
    names = dict(db.query(models.User.id, models.User.name).all())
    items = [_row(db, row, by_name, restored_map, names) for row, by_name in rows]
    term = (search or "").strip().lower()
    if term:
        items = [r for r in items if any(term in str(r.get(f) or "").lower() for f in ("title", "customer", "mr", "reason", "by", "code"))]
    return items


def _totals(items):
    live = [r for r in items if not r["restored"]]
    return {
        "total_count": len(items),
        "invoices": sum(1 for r in live if r["kind"] == "invoice"),
        "customers": sum(1 for r in live if r["kind"] == "customer"),
        "users": sum(1 for r in live if r["kind"] == "user"),
        "undone": sum(1 for r in live if r["kind"] == "undone"),
        # Money that dropped out of the collection totals with deleted invoices.
        "collections_removed": round(sum(r["collected"] or 0 for r in live if r["kind"] == "invoice"), 2),
        "restored": sum(1 for r in items if r["restored"]),
    }


@router.get("")
def list_deletions(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    kind: Optional[str] = None,
    by_id: Optional[int] = None,
    search: Optional[str] = Query(default=None, max_length=80),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    items = _query_rows(db, date_from, date_to, kind, by_id, search)
    size = min(max(limit, 1), 100)
    start = max(offset, 0)
    deleters = sorted({(r["by_id"], r["by"]) for r in items if r["by_id"]}, key=lambda x: x[1] or "")
    return {**_totals(items), "limit": size, "offset": start, "rows": items[start:start + size],
            "deleters": [{"id": i, "name": n} for i, n in deleters], "restore_days": RESTORE_DAYS}


@router.get("/summary")
def deletions_summary(days: int = 7, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """For the Dashboard's one-line note (last `days` days, restored ones left out)."""
    days = min(max(days, 1), 90)
    since = datetime.now(IST).date() - timedelta(days=days - 1)
    items = _query_rows(db, since, None, None, None, None)
    return {**_totals(items), "days": days, "since": since}


@router.get("/export")
def export_deletions(
    request: Request,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    kind: Optional[str] = None,
    by_id: Optional[int] = None,
    search: Optional[str] = Query(default=None, max_length=80),
    fmt: str = Query("xlsx", alias="format"),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    fmt = check_format(fmt)
    items = _query_rows(db, date_from, date_to, kind, by_id, search)
    write_audit(db, "deletions_exported", user, new={"rows": len(items), "format": fmt, "filters": dict(request.query_params)})
    db.commit()
    label = {"invoice": "Invoice", "customer": "Customer", "user": "User", "undone": "Undone collection"}
    rows = [[
        to_ist(r["at"]), label[r["kind"]], r.get("title"), r.get("customer"), r.get("mr"),
        float(r["amount"]) if r.get("amount") is not None else None, float(r.get("collected") or 0) or None,
        r.get("reason"), r.get("by"),
        ("Restored " + to_ist(r["restored"]["at"]).strftime("%d %b %Y") + (f" by {r['restored']['by']}" if r["restored"]["by"] else "")) if r["restored"] else None,
    ] for r in items]
    by_name = None
    if by_id:
        person = db.get(models.User, by_id)
        by_name = person.name if person else str(by_id)
    filters = describe(db, date_from=date_from, date_to=date_to, date_word="Deleted on", search=search,
                       more=[f"What: {label.get(kind, kind)}" if kind else "", f"Deleted by: {by_name}" if by_name else ""])
    columns = [Col("Deleted on", "datetime", 18), Col("What", width=14), Col("Name / number", width=22), Col("Customer", width=26),
               Col("MR", width=14), Col("Amount", "money", 13, True), Col("Collected on it", "money", 13, True),
               Col("Reason", width=26), Col("Deleted by", width=16), Col("Restored", width=22)]
    report = Report("Deleted items", filters, user.name, [Sheet("Deleted", columns, rows)])
    return report_response(report, file_name("Deleted items", *filters[:2], ext=fmt), fmt)


@router.get("/{audit_id}")
def deletion_detail(audit_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    row = db.get(models.AuditLog, audit_id)
    if not row or row.action not in KINDS:
        raise HTTPException(404, "Not found")
    by = db.get(models.User, row.user_id).name if row.user_id and db.get(models.User, row.user_id) else None
    names = dict(db.query(models.User.id, models.User.name).all())
    item = _row(db, row, by, _restored_map(db), names)
    old = row.old_value or {}
    if item["kind"] == "invoice":
        item["details"] = {
            "invoice_date": old.get("invoice_date"), "total": old.get("total_amount"), "paid": old.get("paid_amount"),
            "pending": old.get("pending_amount"), "status": old.get("status"), "remarks": old.get("remarks"),
            "payments": [{
                "date": p.get("payment_date"), "amount": p.get("amount"),
                "mode": "Reversal" if (p.get("amount") or 0) < 0 else mode_label(p.get("mode")),
                "reference": p.get("transaction_reference"), "reason": p.get("reason"),
                "by": names.get(p.get("recorded_by") or p.get("collected_by")),
            } for p in old.get("payments") or []],
        }
    elif item["kind"] == "customer":
        item["details"] = {k: old.get(k) for k in ("type", "phone", "alternate_phone", "address", "area", "gstin")}
    elif item["kind"] == "user":
        item["details"] = {k: old.get(k) for k in ("employee_code", "role", "phone")}
    else:
        item["details"] = {"payments": [{
            "invoice_number": p.get("invoice_number"), "amount": p.get("amount"), "mode": mode_label(p.get("mode")),
            "reference": p.get("reference"),
        } for p in old.get("payments") or []]}
    return item


def _user_or_none(db, user_id):
    return user_id if user_id and db.get(models.User, user_id) else None


@router.post("/{audit_id}/restore")
def restore_deletion(audit_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """Puts a deleted invoice (with all its collections and history) or a
    deleted customer back, as it was. Within 30 days, and only if nothing
    has taken its place since (same invoice number, same customer name)."""
    row = db.query(models.AuditLog).filter(models.AuditLog.id == audit_id).with_for_update().first()
    if not row or row.action not in ("invoice_deleted", "customer_deleted"):
        raise HTTPException(404, "Not found")
    restored_map = _restored_map(db)
    why = _why_not(db, row, KINDS[row.action], restored_map.get(row.id))
    if why:
        raise HTTPException(409, why)
    old = row.old_value or {}

    if row.action == "customer_deleted":
        customer = models.Customer(
            # Same id when it's free (it always is on the live database).
            id=old.get("customer_id") if old.get("customer_id") and not db.get(models.Customer, old["customer_id"]) else None,
            name=old["name"].strip(), type=old.get("type"), phone=old.get("phone"),
            alternate_phone=old.get("alternate_phone"), whatsapp_on=old.get("whatsapp_on"), address=old.get("address"),
            area=old.get("area"), gstin=old.get("gstin"), mr_id=_user_or_none(db, old.get("mr_id")),
        )
        if _parse_dt(old.get("created_at")):
            customer.created_at = _parse_dt(old.get("created_at"))
        db.add(customer)
        db.flush()
        write_audit(db, "customer_restored", user, new={"restored_from": row.id, "customer_id": customer.id, "name": customer.name})
        db.commit()
        return {"kind": "customer", "customer_id": customer.id, "name": customer.name}

    invoice = models.Invoice(
        id=old.get("invoice_id") if old.get("invoice_id") and not db.get(models.Invoice, old["invoice_id"]) else None,
        invoice_number=old["invoice_number"], external_key=old.get("external_key"),
        invoice_date=_parse_date(old.get("invoice_date")), customer_id=old.get("customer_id"),
        mr_id=_user_or_none(db, old.get("mr_id")), total_amount=old.get("total_amount") or 0,
        taxable_amount=old.get("taxable_amount"), tax_amount=old.get("tax_amount"),
        payment_mode=old.get("payment_mode"), remarks=old.get("remarks"), image_path=old.get("image_path"),
        paid_amount=0, pending_amount=old.get("total_amount") or 0,
    )
    if _parse_dt(old.get("created_at")):
        invoice.created_at = _parse_dt(old.get("created_at"))
    db.add(invoice)
    db.flush()

    # Collections back with their own ids where free, so reversal links and
    # history lines still point at the right entry.
    id_map = {}
    payments = sorted(old.get("payments") or [], key=lambda p: p.get("payment_id") or 0)
    for p in payments:
        pid = p.get("payment_id")
        keep = pid if pid and not db.get(models.Payment, pid) else None
        payment = models.Payment(
            id=keep, invoice_id=invoice.id, amount=p.get("amount") or 0, mode=p.get("mode"),
            transaction_reference=p.get("transaction_reference"), payment_date=_parse_dt(p.get("payment_date")),
            collected_by=_user_or_none(db, p.get("collected_by")), recorded_by=_user_or_none(db, p.get("recorded_by")),
            reversal_of_id=id_map.get(p.get("reversal_of_id")), reason=p.get("reason"), batch_id=p.get("batch_id"),
        )
        db.add(payment)
        db.flush()
        if pid:
            id_map[pid] = payment.id
    paid = round(sum(p.get("amount") or 0 for p in payments), 2)
    invoice.paid_amount = paid
    invoice.status, invoice.pending_amount = compute_status(invoice.total_amount, paid)

    events = old.get("events")
    if events:
        for e in events:
            db.add(models.InvoiceEvent(
                invoice_id=invoice.id, event_type=e.get("event_type"), payment_id=id_map.get(e.get("payment_id")),
                amount=e.get("amount"), mode=e.get("mode"), reference=e.get("reference"), reason=e.get("reason"),
                actor_id=_user_or_none(db, e.get("actor_id")), actor_role=e.get("actor_role"),
                created_at=_parse_dt(e.get("created_at")),
            ))
    else:
        # Deleted before full copies were kept: rebuild the history from the collections.
        db.add(models.InvoiceEvent(invoice_id=invoice.id, event_type=models.InvoiceEventType.CREATED.value,
                                   amount=invoice.total_amount, created_at=invoice.created_at or datetime.utcnow()))
        for p in payments:
            amount = p.get("amount") or 0
            db.add(models.InvoiceEvent(
                invoice_id=invoice.id,
                event_type=(models.InvoiceEventType.REVERSED if amount < 0 else models.InvoiceEventType.COLLECTED).value,
                payment_id=id_map.get(p.get("payment_id")), amount=amount, mode=p.get("mode"),
                reference=p.get("transaction_reference"), reason=p.get("reason"),
                actor_id=_user_or_none(db, p.get("recorded_by") or p.get("collected_by")),
                created_at=_parse_dt(p.get("payment_date")),
            ))
    write_audit(db, "invoice_restored", user, new={
        "restored_from": row.id, "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
        "customer_id": invoice.customer_id, "customer_name": old.get("customer_name"), "total_amount": invoice.total_amount,
        "paid_amount": paid,
    })
    db.commit()
    return {"kind": "invoice", "invoice_id": invoice.id, "invoice_number": invoice.invoice_number, "collected": paid}
