import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import String, and_, func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, schemas
from ..collection_info import as_utc
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..month_clear import short_label

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/vapid-public-key")
def vapid_public_key(user: models.User = Depends(get_current_user)):
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key or not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        raise HTTPException(503, "Push notifications are not configured")
    return {"public_key": key}


@router.post("/subscriptions", status_code=204)
def save_subscription(
    payload: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    endpoint = str(payload.endpoint)
    if not endpoint.startswith("https://") or not payload.keys.get("p256dh") or not payload.keys.get("auth"):
        raise HTTPException(400, "Invalid push subscription")

    subscription = db.query(models.PushSubscription).filter_by(endpoint=endpoint).first()
    if subscription:
        subscription.user_id = user.id
        subscription.p256dh = payload.keys["p256dh"]
        subscription.auth = payload.keys["auth"]
    else:
        db.add(models.PushSubscription(
            user_id=user.id,
            endpoint=endpoint,
            p256dh=payload.keys["p256dh"],
            auth=payload.keys["auth"],
        ))
    db.commit()
    return Response(status_code=204)


@router.delete("/subscriptions", status_code=204)
def delete_subscription(
    payload: schemas.PushSubscriptionDelete,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    db.query(models.PushSubscription).filter_by(endpoint=str(payload.endpoint), user_id=user.id).delete()
    db.commit()
    return Response(status_code=204)


# ---- Admin bell: recent collections ----

def _not_mine(user: models.User):
    """Payments entered by someone else (an Admin's own entries are not news)."""
    return or_(
        and_(models.Payment.recorded_by.isnot(None), models.Payment.recorded_by != user.id),
        and_(models.Payment.recorded_by.is_(None), models.Payment.collected_by != user.id),
    )


def _last_day_cutoff():
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)


def _unread_filter(user: models.User):
    """New = after the newest payment seen; before the first open, the last day."""
    seen = user.notifications_seen_payment_id
    if seen is None:
        return models.Payment.payment_date >= _last_day_cutoff()
    return models.Payment.id > seen


def _group_key():
    """A split collection (same batch_id) counts as one entry."""
    return func.coalesce(models.Payment.batch_id, func.cast(models.Payment.id, String))


@router.get("/recent")
def recent_collections(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Newest collections and reversals for the Admin bell, with how many are
    new. A collection split over several invoices is one entry."""
    collector = aliased(models.User)
    recorder = aliased(models.User)
    rows = (
        db.query(models.Payment, models.Invoice, models.Customer, collector.name, recorder.name)
        .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
        .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
        .outerjoin(collector, collector.id == models.Payment.collected_by)
        .outerjoin(recorder, recorder.id == models.Payment.recorded_by)
        .order_by(models.Payment.id.desc())
        .limit(limit * 8)
        .all()
    )
    seen = user.notifications_seen_payment_id
    unread = (
        db.query(func.count(func.distinct(_group_key())))
        .filter(_not_mine(user), _unread_filter(user))
        .scalar() or 0
    )
    cutoff = _last_day_cutoff()
    groups: dict = {}
    order = []
    for payment, invoice, customer, collector_name, recorder_name in rows:
        key = payment.batch_id or f"p{payment.id}"
        if key not in groups:
            if len(order) == limit:
                continue
            order.append(key)
            groups[key] = {"payments": [], "customer": customer, "collector": collector_name, "recorder": recorder_name}
        groups[key]["payments"].append((payment, invoice))

    items = []
    for key in order:
        group = groups[key]
        parts = sorted(group["payments"], key=lambda pair: pair[0].id)
        first_payment, first_invoice = parts[0]
        newest = max(payment.id for payment, _ in parts)
        by_me = (first_payment.recorded_by or first_payment.collected_by) == user.id
        if seen is not None:
            new = not by_me and newest > seen
        else:
            new = not by_me and first_payment.payment_date is not None and first_payment.payment_date >= cutoff
        numbers = [invoice.invoice_number for _, invoice in parts]
        items.append({
            "payment_id": first_payment.id,
            "invoice_id": first_invoice.id,
            "invoice_number": numbers[0] if len(numbers) == 1 else f"{numbers[0]} +{len(numbers) - 1}",
            "invoice_count": len(numbers),
            "customer_name": group["customer"].name if group["customer"] else None,
            "amount": round(sum(payment.amount for payment, _ in parts), 2),
            "mode": first_payment.mode,
            "is_reversal": first_payment.reversal_of_id is not None,
            "mr_name": group["collector"],
            "recorded_by_name": group["recorder"] or group["collector"],
            "recorded_by_me": by_me,
            "payment_date": as_utc(first_payment.payment_date),  # stored as UTC; send with its zone
            "is_new": new,
        })
    months = _recent_months(db, user)
    unread += sum(1 for month in months if month["is_new"])
    return {"items": items, "months": months, "unread": unread}


MONTHS_IN_BELL = 3
MONTHS_BELL_DAYS = 14


def _recent_months(db: Session, user: models.User) -> list[dict]:
    """"🎉 Rahul cleared OCT" lines for the bell: months an MR cleared
    themselves in the last two weeks (newest first, at most three)."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=MONTHS_BELL_DAYS)
    rows = (
        db.query(models.MonthClearance, models.User.name)
        .join(models.User, models.User.id == models.MonthClearance.user_id)
        .filter(
            models.MonthClearance.undone_at.is_(None),
            models.MonthClearance.cleared_at >= since,
            or_(models.MonthClearance.cleared_by.is_(None), models.MonthClearance.cleared_by == models.MonthClearance.user_id),
        )
        .order_by(models.MonthClearance.cleared_at.desc(), models.MonthClearance.id.desc())
        .limit(MONTHS_IN_BELL)
        .all()
    )
    seen = user.notifications_seen_month_id
    cutoff = _last_day_cutoff()
    return [{
        "id": record.id,
        "mr_id": record.user_id,
        "mr_name": name,
        "month": record.month,
        "label": short_label(record.month),
        "invoices": record.invoice_count,
        "cleared_at": as_utc(record.cleared_at),
        "is_new": (record.id > seen) if seen is not None else record.cleared_at >= cutoff,
    } for record, name in rows]


@router.post("/seen", status_code=204)
def mark_seen(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """Opening the bell: everything up to the newest payment is now seen."""
    newest = db.query(func.max(models.Payment.id)).scalar()
    changed = False
    if newest is not None and (user.notifications_seen_payment_id or 0) < newest:
        user.notifications_seen_payment_id = newest
        changed = True
    newest_month = db.query(func.max(models.MonthClearance.id)).scalar()
    if newest_month is not None and (user.notifications_seen_month_id or 0) < newest_month:
        user.notifications_seen_month_id = newest_month
        changed = True
    if changed:
        db.commit()
    return Response(status_code=204)


# ---- MR bell: what the office did on my invoices ----

def _office_entries(user: models.User):
    """Collections and reversals someone else (the office) entered for this MR,
    after the last "Clear all"."""
    return and_(
        models.Payment.collected_by == user.id,
        models.Payment.recorded_by.isnot(None),
        models.Payment.recorded_by != user.id,
        models.Payment.id > (user.notifications_cleared_payment_id or 0),
    )


def clear_bell(db: Session, user: models.User) -> None:
    """Empty a person's "Updates from office" list (new updates still come)."""
    newest_payment = db.query(func.max(models.Payment.id)).scalar() or 0
    newest_audit = db.query(func.max(models.AuditLog.id)).scalar() or 0
    user.notifications_cleared_payment_id = newest_payment
    user.notifications_cleared_audit_id = newest_audit
    user.notifications_seen_payment_id = max(user.notifications_seen_payment_id or 0, newest_payment)
    user.notifications_seen_audit_id = max(user.notifications_seen_audit_id or 0, newest_audit)


@router.get("/mine")
def my_updates(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """MR bell: payments the office recorded or reversed on this MR's
    invoices, newest first, with how many are new. A split collection is one entry."""
    recorder = aliased(models.User)
    rows = (
        db.query(models.Payment, models.Invoice, models.Customer, recorder.name)
        .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
        .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
        .outerjoin(recorder, recorder.id == models.Payment.recorded_by)
        .filter(_office_entries(user))
        .order_by(models.Payment.id.desc())
        .limit(limit * 8)
        .all()
    )
    unread = (
        db.query(func.count(func.distinct(_group_key())))
        .filter(_office_entries(user), _unread_filter(user))
        .scalar() or 0
    )
    seen = user.notifications_seen_payment_id
    cutoff = _last_day_cutoff()
    groups: dict = {}
    order = []
    for payment, invoice, customer, recorder_name in rows:
        key = payment.batch_id or f"p{payment.id}"
        if key not in groups:
            if len(order) == limit:
                continue
            order.append(key)
            groups[key] = {"parts": [], "customer": customer, "recorder": recorder_name}
        groups[key]["parts"].append((payment, invoice))
    items = []
    for key in order:
        group = groups[key]
        parts = sorted(group["parts"], key=lambda pair: pair[0].id)
        first, first_invoice = parts[0]
        newest = max(payment.id for payment, _ in parts)
        is_new = newest > seen if seen is not None else (first.payment_date is not None and first.payment_date >= cutoff)
        numbers = [invoice.invoice_number for _, invoice in parts]
        items.append({
            "payment_id": first.id,
            "invoice_id": first_invoice.id,
            "invoice_number": numbers[0] if len(numbers) == 1 else f"{numbers[0]} +{len(numbers) - 1}",
            "customer_name": group["customer"].name if group["customer"] else None,
            "amount": round(sum(payment.amount for payment, _ in parts), 2),
            "mode": first.mode,
            "is_reversal": (first.amount or 0) < 0,
            "reason": first.reason,
            "recorded_by_name": group["recorder"],
            "payment_date": as_utc(first.payment_date),
            "is_new": is_new,
        })
    for item in items:
        item["kind"] = "reversed" if item["is_reversal"] else "received"
        item["key"] = f"p{item['payment_id']}"
        item["at"] = item["payment_date"]
    removed = _removed_invoices(db, user)
    unread += sum(1 for item in removed if item["is_new"])
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    merged = sorted(items + removed, key=lambda item: item["at"] or oldest, reverse=True)[:limit]
    return {"items": merged, "unread": unread}


REMOVED_DAYS = 30


def _removed_invoices(db: Session, user: models.User) -> list[dict]:
    """Invoices of this MR that the office deleted (last 30 days). A bulk
    delete is one line per customer. Undone deletes never reach the server."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=REMOVED_DAYS)
    rows = (
        db.query(models.AuditLog, models.User.name)
        .outerjoin(models.User, models.User.id == models.AuditLog.user_id)
        .filter(models.AuditLog.action == "invoice_deleted", models.AuditLog.timestamp >= since,
                models.AuditLog.id > (user.notifications_cleared_audit_id or 0))
        .order_by(models.AuditLog.id.desc())
        .limit(500)
        .all()
    )
    seen = user.notifications_seen_audit_id
    cutoff = _last_day_cutoff()
    groups: dict = {}
    for entry, by_name in rows:
        old = entry.old_value or {}
        if old.get("mr_id") != user.id or entry.user_id == user.id:
            continue
        bulk = (entry.new_value or {}).get("bulk_id")
        key = (bulk, old.get("customer_id")) if bulk else entry.id
        groups.setdefault(key, []).append((entry, old, by_name))
    items = []
    for parts in groups.values():
        entry, old, by_name = parts[0]
        newest = max(part[0].id for part in parts)
        numbers = [part[1].get("invoice_number") for part in parts]
        items.append({
            "kind": "removed",
            "key": f"a{newest}",
            "invoice_id": None,
            "invoice_number": numbers[0] if len(numbers) == 1 else ", ".join(numbers[:2]) + (f" +{len(numbers) - 2}" if len(numbers) > 2 else ""),
            "invoice_count": len(numbers),
            "customer_name": old.get("customer_name"),
            "amount": round(sum(part[1].get("total_amount") or 0 for part in parts), 2),
            "recorded_by_name": by_name,
            "at": as_utc(entry.timestamp),
            "is_new": newest > seen if seen is not None else entry.timestamp >= cutoff,
        })
    return items


@router.post("/mine/clear", status_code=204)
def clear_mine(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """The bell's "Clear all"."""
    clear_bell(db, user)
    db.commit()
    return Response(status_code=204)


@router.post("/mine/seen", status_code=204)
def mark_mine_seen(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    newest = db.query(func.max(models.Payment.id)).filter(_office_entries(user)).scalar()
    changed = False
    if newest is not None and (user.notifications_seen_payment_id or 0) < newest:
        user.notifications_seen_payment_id = newest
        changed = True
    newest_removed = db.query(func.max(models.AuditLog.id)).filter(models.AuditLog.action == "invoice_deleted").scalar()
    if newest_removed is not None and (user.notifications_seen_audit_id or 0) < newest_removed:
        user.notifications_seen_audit_id = newest_removed
        changed = True
    if changed:
        db.commit()
    return Response(status_code=204)
