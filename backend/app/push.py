import json
import logging
import os

from . import models
from .database import SessionLocal

log = logging.getLogger(__name__)


def send_admin_notification(payload: dict, ttl: int = 60) -> bool:
    private_key = os.getenv("VAPID_PRIVATE_KEY")
    subject = os.getenv("VAPID_SUBJECT")
    if not private_key or not subject:
        log.warning("Push skipped: VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured")
        return False

    with SessionLocal() as db:
        subscriptions = (
            db.query(models.PushSubscription)
            .join(models.User, models.User.id == models.PushSubscription.user_id)
            .filter(models.User.role == models.RoleEnum.ADMIN.value)
            .all()
        )
        targets = [
            (sub.id, {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}})
            for sub in subscriptions
        ]

    if not targets:
        return False

    from pywebpush import WebPushException, webpush

    delivered = False
    for subscription_id, subscription_info in targets:
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                ttl=ttl,
                timeout=10,
            )
            delivered = True
        except WebPushException as exc:
            if getattr(exc.response, "status_code", None) in (404, 410):
                with SessionLocal() as db:
                    db.query(models.PushSubscription).filter_by(id=subscription_id).delete()
                    db.commit()
            else:
                log.exception("Could not send admin push notification")
        except Exception:
            log.exception("Could not send admin push notification")
    return delivered


def send_payment_notification(payment_id: int):
    with SessionLocal() as db:
        payment = (
            db.query(models.Payment, models.User)
            .join(models.User, models.User.id == models.Payment.collected_by)
            .filter(models.Payment.id == payment_id)
            .first()
        )
        if not payment:
            return
        payment_row, collector = payment
        payload = {
            "title": "Payment received",
            "body": f"{collector.name} recorded ₹{payment_row.amount:,.0f}. Open the app for details.",
            "url": "admin.html",
            "tag": f"payment-{payment_row.id}",
        }
    send_admin_notification(payload)
