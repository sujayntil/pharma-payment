"""'Month cleared' moments for MRs.

When the last open invoice of an invoice month (by invoice date, among the
invoices assigned to one MR) is paid, that MR gets a small celebration:
"Shabaash! Rahul / All invoices cleared for SEPT".

* The MR collected it: shown straight away (returned with the collection).
* An Admin collected it (or marked it paid): saved for the MR, shown the
  next time they open the app (claim_unseen).
* Only months that are over (the running month can still get invoices);
  a month cleared while it was running is picked up once it has ended.
* Once per MR and month (month_clearances). An undo / reversal / "mark
  unpaid" that opens the month again marks the record; clearing it again
  within a few minutes (an undo-and-redo) stays quiet, later it counts again.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

IST = timezone(timedelta(hours=5, minutes=30))
ON_TIME_DAYS = 40
REDO_QUIET = timedelta(minutes=10)
OPEN = 0.004  # anything above this is still pending

_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"]


def _now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _today():
    return datetime.now(IST).date()


def _bounds(year: int, month: int):
    start = date(year, month, 1)
    end = date(year + (month == 12), month % 12 + 1, 1)
    return start, end


def _key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _label(year: int, month: int, today: date) -> str:
    return _MONTHS[month - 1] + ("" if year == today.year else f" {year}")


def _item(record: models.MonthClearance, today: date) -> dict:
    year, month = map(int, record.month.split("-"))
    return {"month": record.month, "label": _label(year, month, today), "invoices": record.invoice_count, "on_time": record.on_time}


def _month_invoices(db: Session, mr_id: int, year: int, month: int):
    start, end = _bounds(year, month)
    return (
        db.query(models.Invoice)
        .filter(models.Invoice.mr_id == mr_id, models.Invoice.invoice_date >= start, models.Invoice.invoice_date < end)
        .all()
    )


def _all_paid(rows) -> bool:
    return bool(rows) and all((inv.pending_amount or 0) <= OPEN for inv in rows)


def _on_time(db: Session, rows) -> bool:
    """Every invoice paid within 40 days of its invoice date (kept for reports;
    the celebration is the same either way)."""
    ids = [inv.id for inv in rows]
    paid = {}
    for invoice_id, when in (
        db.query(models.Payment.invoice_id, func.max(models.Payment.payment_date))
        .filter(models.Payment.invoice_id.in_(ids), models.Payment.amount > 0)
        .group_by(models.Payment.invoice_id)
        .all()
    ):
        if when is not None:
            paid[invoice_id] = (when if when.tzinfo else when.replace(tzinfo=timezone.utc)).astimezone(IST).date()
    return all(inv.id not in paid or (paid[inv.id] - inv.invoice_date).days <= ON_TIME_DAYS for inv in rows)


def _mark_cleared(db: Session, mr_id: int, year: int, month: int, rows, show_now: bool, actor_id=None) -> bool:
    """Save the month as cleared for this MR. True when it should be
    celebrated right now (show_now and not already celebrated)."""
    now = _now_utc()
    on_time = _on_time(db, rows)
    record = db.query(models.MonthClearance).filter_by(user_id=mr_id, month=_key(year, month)).first()
    if record is None:
        db.add(models.MonthClearance(user_id=mr_id, month=_key(year, month), on_time=on_time, invoice_count=len(rows),
                                     cleared_at=now, shown_at=now if show_now else None, cleared_by=actor_id))
        return show_now
    if record.undone_at is None:
        return False  # already cleared (and celebrated, or waiting to be)
    redo = now - record.undone_at <= REDO_QUIET  # an undo-and-redo stays quiet
    record.undone_at = None
    record.on_time, record.invoice_count, record.cleared_at = on_time, len(rows), now
    record.cleared_by = actor_id
    if redo:
        return False
    record.shown_at = now if show_now else None
    record.notified_at = None  # cleared again much later: the Admins may hear about it again
    return show_now


def months_cleared(db: Session, user: models.User, invoices) -> list[dict]:
    """Call after recording collections (before commit). Saves every finished
    month these invoices completed, per MR; returns the ones to celebrate now
    (only when that MR is the one collecting)."""
    db.flush()
    today = _today()
    current = (today.year, today.month)
    months = sorted({
        (inv.mr_id, inv.invoice_date.year, inv.invoice_date.month)
        for inv in invoices
        if inv.invoice_date is not None and inv.mr_id is not None and (inv.pending_amount or 0) <= OPEN
    })
    is_mr = user.role == models.RoleEnum.MR.value
    result = []
    for mr_id, year, month in months:
        if (year, month) >= current:
            continue
        rows = _month_invoices(db, mr_id, year, month)
        if not _all_paid(rows):
            continue
        show_now = is_mr and mr_id == user.id
        if _mark_cleared(db, mr_id, year, month, rows, show_now, actor_id=user.id):
            result.append({"month": _key(year, month), "label": _label(year, month, today), "invoices": len(rows), "on_time": _on_time(db, rows)})
    return result


def finished_month_keys(invoices) -> list[str]:
    """Finished months these invoices belong to (for the Admin alert check)."""
    today = _today()
    return sorted({
        _key(inv.invoice_date.year, inv.invoice_date.month)
        for inv in invoices
        if inv.invoice_date is not None and (inv.invoice_date.year, inv.invoice_date.month) < (today.year, today.month)
    })


def claim_unseen(db: Session, mr: models.User) -> tuple[list[dict], list[str]]:
    """Months waiting to be shown to this MR (an Admin cleared them, or the
    month was cleared while still running and has now ended). Each is
    returned once. Also returns the month just noticed as ended-and-cleared
    (the Admins get told about that one)."""
    today = _today()
    last = (today.replace(day=1) - timedelta(days=1))
    noticed = []
    if db.query(models.MonthClearance.id).filter_by(user_id=mr.id, month=_key(last.year, last.month)).first() is None:
        rows = _month_invoices(db, mr.id, last.year, last.month)
        if _all_paid(rows):
            _mark_cleared(db, mr.id, last.year, last.month, rows, show_now=False)
            db.flush()
            noticed.append(_key(last.year, last.month))
    waiting = (
        db.query(models.MonthClearance)
        .filter(models.MonthClearance.user_id == mr.id, models.MonthClearance.shown_at.is_(None), models.MonthClearance.undone_at.is_(None))
        .order_by(models.MonthClearance.month)
        .all()
    )
    now = _now_utc()
    shown = []
    for record in waiting:
        # Claimed by exactly one request even if two tabs ask at once.
        taken = (
            db.query(models.MonthClearance)
            .filter(models.MonthClearance.id == record.id, models.MonthClearance.shown_at.is_(None))
            .update({"shown_at": now}, synchronize_session=False)
        )
        if taken:
            shown.append(_item(record, today))
    db.commit()
    return shown, noticed


def reopen_months(db: Session, invoices) -> None:
    """After an undo / reversal / "mark unpaid": mark cleared months that are open again."""
    db.flush()
    seen = set()
    for inv in invoices:
        if inv.invoice_date is None or inv.mr_id is None:
            continue
        key = (inv.mr_id, inv.invoice_date.year, inv.invoice_date.month)
        if key in seen:
            continue
        seen.add(key)
        mr_id, year, month = key
        record = db.query(models.MonthClearance).filter_by(user_id=mr_id, month=_key(year, month)).first()
        if record is None or record.undone_at is not None:
            continue
        if not _all_paid(_month_invoices(db, mr_id, year, month)):
            record.undone_at = _now_utc()


SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC"]


def short_label(key: str) -> str:
    """"2026-09" -> "SEPT" ("SEPT 2025" for another year)."""
    year, month = map(int, key.split("-"))
    return SHORT[month - 1] + ("" if year == _today().year else f" {year}")


def due_for_alert(record: models.MonthClearance) -> bool:
    """Admins hear "Rahul cleared OCT" once, when the MR did it (their own
    collection, or noticed when the month ended), and it is still cleared."""
    return (
        record is not None
        and record.undone_at is None
        and record.notified_at is None
        and (record.cleared_by is None or record.cleared_by == record.user_id)
    )
