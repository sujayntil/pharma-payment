"""Customer-level 40-day outstanding reminders."""

import logging
import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .database import SessionLocal
from .push import send_admin_notification

log = logging.getLogger(__name__)
_IST = timezone(timedelta(hours=5, minutes=30))
_OVERDUE_DAYS = 40
_REMINDER_INTERVAL_DAYS = 2
_CLAIM_TIMEOUT = timedelta(minutes=15)


def overdue_customer_summaries(db: Session, today: date | None = None) -> list[dict]:
    today = today or datetime.now(_IST).date()
    cutoff = today - timedelta(days=_OVERDUE_DAYS)
    rows = (
        db.query(models.Invoice, models.Customer, models.User)
        .join(models.Customer, models.Invoice.customer_id == models.Customer.id)
        .outerjoin(models.User, models.Invoice.mr_id == models.User.id)
        .filter(
            models.Invoice.pending_amount > 0,
            models.Invoice.invoice_date.isnot(None),
            models.Invoice.invoice_date <= cutoff,
        )
        .order_by(models.Customer.name, models.Invoice.invoice_date, models.Invoice.id)
        .all()
    )
    grouped: dict[int, dict] = {}
    for invoice, customer, mr in rows:
        summary = grouped.setdefault(customer.id, {
            "customer_id": customer.id,
            "customer": customer.name,
            "mr": mr.name if mr else None,
            "oldest_invoice_id": invoice.id,
            "oldest_invoice_number": invoice.invoice_number,
            "oldest_invoice_date": invoice.invoice_date,
            "invoice_count": 0,
            "overdue_amount": 0,
        })
        summary["invoice_count"] += 1
        summary["overdue_amount"] += invoice.pending_amount or 0

    for summary in grouped.values():
        summary["days_overdue"] = (today - summary["oldest_invoice_date"]).days
    return sorted(grouped.values(), key=lambda item: (-item["overdue_amount"], item["customer"].lower()))


def _claim_reminder(db: Session, customer_id: int, invoice_id: int, reminder_date: date, now: datetime) -> int | None:
    query = db.query(models.CustomerOverdueReminder).filter_by(
        customer_id=customer_id,
        anchor_invoice_id=invoice_id,
        reminder_date=reminder_date,
    )
    reminder = query.with_for_update().first()
    if reminder is None:
        reminder = models.CustomerOverdueReminder(
            customer_id=customer_id,
            anchor_invoice_id=invoice_id,
            reminder_date=reminder_date,
        )
        db.add(reminder)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    reminder = query.with_for_update().first()
    if not reminder or reminder.sent_at:
        return None
    if reminder.attempted_at and now - reminder.attempted_at < _CLAIM_TIMEOUT:
        return None
    reminder.attempted_at = now
    db.commit()
    return reminder.id


def process_due_overdue_reminders() -> None:
    if not all(os.getenv(key) for key in ("VAPID_PRIVATE_KEY", "VAPID_SUBJECT")):
        log.warning("40-day push reminders are inactive: configure VAPID_PRIVATE_KEY and VAPID_SUBJECT")
        return
    today = datetime.now(_IST).date()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with SessionLocal() as db:
        summaries = overdue_customer_summaries(db, today)

    for summary in summaries:
        crossed_date = summary["oldest_invoice_date"] + timedelta(days=_OVERDUE_DAYS)
        elapsed = (today - crossed_date).days
        reminder_date = crossed_date + timedelta(
            days=(elapsed // _REMINDER_INTERVAL_DAYS) * _REMINDER_INTERVAL_DAYS
        )
        with SessionLocal() as db:
            try:
                reminder_id = _claim_reminder(
                    db,
                    summary["customer_id"],
                    summary["oldest_invoice_id"],
                    reminder_date,
                    now,
                )
            except Exception:
                db.rollback()
                log.exception("Could not claim overdue reminder for customer %s", summary["customer_id"])
                continue
        if reminder_id is None:
            continue

        payload = {
            "title": "40-day outstanding reminder",
            "body": (
                f"{summary['customer']} has ₹{summary['overdue_amount']:,.2f} outstanding "
                f"across {summary['invoice_count']} overdue invoice(s)."
            ),
            "url": "admin.html",
            "tag": f"overdue-{summary['customer_id']}-{reminder_date.isoformat()}",
        }
        sent = send_admin_notification(payload, ttl=24 * 60 * 60)
        with SessionLocal() as db:
            reminder = db.get(models.CustomerOverdueReminder, reminder_id)
            if reminder:
                reminder.sent_at = now if sent else None
                reminder.attempted_at = now if sent else None
                db.commit()
