import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, schemas
from ..collection_info import as_utc
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/vapid-public-key")
def vapid_public_key(user: models.User = Depends(require_admin)):
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key or not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        raise HTTPException(503, "Push notifications are not configured")
    return {"public_key": key}


@router.post("/subscriptions", status_code=204)
def save_subscription(
    payload: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
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
    user: models.User = Depends(require_admin),
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


@router.get("/recent")
def recent_collections(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Newest collections and reversals for the Admin bell, with how many are new."""
    collector = aliased(models.User)
    recorder = aliased(models.User)
    rows = (
        db.query(models.Payment, models.Invoice, models.Customer, collector.name, recorder.name)
        .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
        .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
        .outerjoin(collector, collector.id == models.Payment.collected_by)
        .outerjoin(recorder, recorder.id == models.Payment.recorded_by)
        .order_by(models.Payment.id.desc())
        .limit(limit)
        .all()
    )
    seen = user.notifications_seen_payment_id
    unread = db.query(func.count(models.Payment.id)).filter(_not_mine(user), _unread_filter(user)).scalar() or 0
    items = []
    for payment, invoice, customer, collector_name, recorder_name in rows:
        by_me = (payment.recorded_by or payment.collected_by) == user.id
        new = not by_me and (payment.id > seen if seen is not None else False)
        items.append({
            "payment_id": payment.id,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "customer_name": customer.name if customer else None,
            "amount": payment.amount,
            "mode": payment.mode,
            "is_reversal": payment.reversal_of_id is not None,
            "mr_name": collector_name,
            "recorded_by_name": recorder_name or collector_name,
            "recorded_by_me": by_me,
            "payment_date": as_utc(payment.payment_date),  # stored as UTC; send with its zone
            "is_new": new,
        })
    if seen is None:
        # First time: the last day's entries (by others) are new, matching the count.
        cutoff = _last_day_cutoff()
        for item, (payment, *_rest) in zip(items, rows):
            item["is_new"] = not item["recorded_by_me"] and payment.payment_date is not None and payment.payment_date >= cutoff
    return {"items": items, "unread": unread}


@router.post("/seen", status_code=204)
def mark_seen(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    """Opening the bell: everything up to the newest payment is now seen."""
    newest = db.query(func.max(models.Payment.id)).scalar()
    if newest is not None and (user.notifications_seen_payment_id or 0) < newest:
        user.notifications_seen_payment_id = newest
        db.commit()
    return Response(status_code=204)
