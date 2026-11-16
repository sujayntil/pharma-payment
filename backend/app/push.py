import time
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


# Alerts wait this long so a collection undone from the Undo bar (a typing
# mistake) never reaches the Admin's phone.
ALERT_DELAY_SECONDS = 20


def send_payment_notification(payment_id: int, delay: float = ALERT_DELAY_SECONDS):
    """Phone alert for a collection an MR recorded. Tapping it opens that
    invoice (its history shows the new payment) in the Admin app."""
    if delay:
        time.sleep(delay)
    with SessionLocal() as db:
        row = (
            db.query(models.Payment, models.User, models.Invoice, models.Customer)
            .join(models.User, models.User.id == models.Payment.collected_by)
            .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
            .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
            .filter(models.Payment.id == payment_id)
            .first()
        )
        if not row:
            return  # undone in the meantime
        payment_row, collector, invoice, customer = row
        payload = payment_payload(payment_row, collector, invoice, customer)
    send_admin_notification(payload)


def send_batch_notification(batch_id: str, delay: float = ALERT_DELAY_SECONDS):
    """One alert for a collection split over several invoices."""
    if delay:
        time.sleep(delay)
    with SessionLocal() as db:
        rows = (
            db.query(models.Payment, models.User, models.Invoice, models.Customer)
            .join(models.User, models.User.id == models.Payment.collected_by)
            .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
            .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
            .filter(models.Payment.batch_id == batch_id)
            .order_by(models.Payment.id.asc())
            .all()
        )
        if not rows:
            return  # undone in the meantime
        payload = batch_payload(rows)
    send_admin_notification(payload)


def batch_payload(rows) -> dict:
    """Title, text and link of a split collection's alert."""
    first_payment, collector, first_invoice, customer = rows[0]
    total = sum(payment.amount for payment, *_ in rows)
    if len(rows) == 1:
        return payment_payload(first_payment, collector, first_invoice, customer)
    where = " · ".join(part for part in (customer.name if customer else None, f"{len(rows)} invoices") if part)
    return {
        "title": f"₹{total:,.0f} collected",
        "body": f"{where} · by {collector.name}",
        "url": f"/#/admin/invoices?invoice={first_invoice.id}",
        "tag": f"batch-{first_payment.batch_id}",
    }


def payment_payload(payment, collector, invoice, customer) -> dict:
    """Title, text and in-app link of a collection alert."""
    where = " · ".join(part for part in (customer.name if customer else None, invoice.invoice_number) if part)
    return {
        "title": f"₹{payment.amount:,.0f} collected",
        "body": f"{where} · by {collector.name}" if where else f"by {collector.name}",
        # Opens the Admin Invoices page with this invoice's panel open.
        "url": f"/#/admin/invoices?invoice={invoice.id}",
        "tag": f"payment-{payment.id}",
    }
