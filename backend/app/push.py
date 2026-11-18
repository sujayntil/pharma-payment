import time
import json
import logging
import os

from . import models
from sqlalchemy.orm import aliased

from .database import SessionLocal

log = logging.getLogger(__name__)


def send_admin_notification(payload: dict, ttl: int = 60) -> bool:
    return _send(payload, ttl, role=models.RoleEnum.ADMIN.value)


def send_user_notification(user_id: int, payload: dict, ttl: int = 3600) -> bool:
    """Phone alert to one person's devices (an MR's)."""
    return _send(payload, ttl, user_id=user_id)


def _send(payload: dict, ttl: int, role=None, user_id=None) -> bool:
    private_key = os.getenv("VAPID_PRIVATE_KEY")
    subject = os.getenv("VAPID_SUBJECT")
    if not private_key or not subject:
        log.warning("Push skipped: VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured")
        return False

    with SessionLocal() as db:
        query = (
            db.query(models.PushSubscription)
            .join(models.User, models.User.id == models.PushSubscription.user_id)
        )
        if role is not None:
            query = query.filter(models.User.role == role)
        if user_id is not None:
            query = query.filter(models.User.id == user_id)
        subscriptions = query.all()
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
                log.exception("Could not send push notification")
        except Exception:
            log.exception("Could not send push notification")
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


def office_payment_payloads(db, payment_ids: list[int]) -> list[tuple[int, dict]]:
    """(MR id, alert) for collections or reversals the office entered on an
    MR's invoices. Parts of one split collection make one alert; entries
    undone in the meantime are gone and send nothing."""
    recorder = aliased(models.User)
    rows = (
        db.query(models.Payment, models.Invoice, models.Customer, models.User, recorder.name)
        .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
        .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
        .join(models.User, models.User.id == models.Payment.collected_by)
        .outerjoin(recorder, recorder.id == models.Payment.recorded_by)
        .filter(models.Payment.id.in_(payment_ids))
        .order_by(models.Payment.id.asc())
        .all()
    )
    groups: dict = {}
    for payment, invoice, customer, mr, recorder_name in rows:
        if mr.role != models.RoleEnum.MR.value or payment.recorded_by in (None, mr.id):
            continue  # only news when someone else entered it for this MR
        key = (mr.id, payment.batch_id or f"p{payment.id}")
        groups.setdefault(key, []).append((payment, invoice, customer, recorder_name))
    alerts = []
    for (mr_id, _key), parts in groups.items():
        payment, invoice, customer, recorder_name = parts[0]
        total = abs(sum(part[0].amount or 0 for part in parts))
        reversal = (payment.amount or 0) < 0
        who = customer.name if customer else invoice.invoice_number
        invoices = invoice.invoice_number if len(parts) == 1 else f"{len(parts)} invoices"
        if reversal:
            why = (payment.reason or "").strip()
            title = f"↩️ ₹{total:,.0f} reversed · {who}"
            body = " · ".join(part for part in (invoices, why, f"by {recorder_name or 'office'}") if part)
        else:
            title = f"₹{total:,.0f} received · {who}"
            body = " · ".join(part for part in (invoices, payment.mode, f"recorded by {recorder_name or 'office'}") if part)
        alerts.append((mr_id, {
            "title": title,
            "body": body,
            "url": f"/#/mr/invoices?invoice={invoice.id}",
            "tag": f"office-{payment.id}",
        }))
    return alerts


def send_office_payment_notification(payment_ids: list[int], delay: float = ALERT_DELAY_SECONDS):
    """Tells the MR when the office records or reverses a payment on their
    invoices (they didn't do it themselves, so it is news to them)."""
    if not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        return
    if delay:
        time.sleep(delay)
    with SessionLocal() as db:
        alerts = office_payment_payloads(db, payment_ids)
    for mr_id, payload in alerts:
        send_user_notification(mr_id, payload)


def month_alert_payloads(db, mr_id: int, months: list[str]) -> list[dict]:
    """Alerts due for these months (marks them sent; caller commits)."""
    from datetime import datetime, timezone

    from .month_clear import due_for_alert, short_label

    mr = db.get(models.User, mr_id)
    if mr is None:
        return []
    payloads = []
    for key in months:
        record = db.query(models.MonthClearance).filter_by(user_id=mr_id, month=key).first()
        if not due_for_alert(record):
            continue
        record.notified_at = datetime.now(timezone.utc).replace(tzinfo=None)
        payloads.append({
            "title": f"🎉 {mr.name} cleared {short_label(key)}",
            "body": f"All invoices of {short_label(key)} are collected",
            "url": "/#/admin/performance",
            "tag": f"month-{mr_id}-{key}",
        })
    return payloads


def send_month_cleared_notification(mr_id: int, months: list[str], delay: float = ALERT_DELAY_SECONDS):
    """"🎉 Rahul cleared OCT" to the Admins, once per MR and month, only when
    the MR cleared it (an undo within the delay cancels it)."""
    if not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        return  # phone alerts not set up: nothing to send (and no waiting)
    if delay:
        time.sleep(delay)
    with SessionLocal() as db:
        payloads = month_alert_payloads(db, mr_id, months)
        db.commit()
    for payload in payloads:
        send_admin_notification(payload, ttl=3600)


def send_weekly_summary_if_due(now=None) -> bool:
    """Monday morning summary to Admins: "Last week: ₹X sales · ₹Y collected".
    Once per Monday, after 9 am India time; the run is recorded so restarts
    or several server processes don't send it twice."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy.exc import IntegrityError

    from .insights import last_week_totals

    ist = timezone(timedelta(hours=5, minutes=30))
    now = now or datetime.now(ist)
    if now.weekday() != 0 or now.hour < 9:
        return False
    if not os.getenv("VAPID_PRIVATE_KEY") or not os.getenv("VAPID_SUBJECT"):
        return False
    key = f"weekly-summary-{now.date().isoformat()}"
    with SessionLocal() as db:
        if db.get(models.ScheduledRun, key) is not None:
            return False
        db.add(models.ScheduledRun(key=key))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return False   # another process took it
        _start, _end, sales, collected = last_week_totals(db)
    send_admin_notification(weekly_summary_payload(sales, collected), ttl=6 * 3600)
    return True


def _lakh(amount: float) -> str:
    if abs(amount) >= 100000:
        return f"₹{amount / 100000:.2f} L"
    return "₹" + f"{round(amount):,}"


def weekly_summary_payload(sales: float, collected: float) -> dict:
    return {
        "title": f"Last week: {_lakh(sales)} sales · {_lakh(collected)} collected",
        "body": "Tap to open Insights",
        "url": "/#/admin/insights",
        "tag": "weekly-summary",
    }
