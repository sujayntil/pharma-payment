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


# ---------- trophies ----------
# Every cleared month is a trophy. It belongs to the financial year (Apr-Mar)
# of the month the bills were made, even when the last payment comes later.
# The counter shows this FY's trophies, plus last FY's until every one of
# last FY's bills (for that MR) is paid; then last FY moves to the list only.

def fy_of(key: str) -> int:
    year, month = map(int, key.split("-"))
    return year if month >= 4 else year - 1


def fy_label(fy: int) -> str:
    return f"FY {fy}–{str(fy + 1)[2:]}"


def _fy_open(db: Session, mr_id: int, fy: int) -> bool:
    """Any of this MR's bills from that financial year still unpaid?"""
    return db.query(models.Invoice.id).filter(
        models.Invoice.mr_id == mr_id,
        models.Invoice.invoice_date >= date(fy, 4, 1),
        models.Invoice.invoice_date < date(fy + 1, 4, 1),
        models.Invoice.pending_amount > OPEN,
    ).first() is not None


def backfill_trophies(db: Session, mr_id: int, today: date | None = None) -> None:
    """Months fully paid before trophies existed: give them their trophy
    quietly (no celebration, no Admin alert). Last month is left to
    claim_unseen, which celebrates it; the running month never counts."""
    today = today or _today()
    last = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    have = {m for (m,) in db.query(models.MonthClearance.month).filter_by(user_id=mr_id).all()}
    by_month: dict[str, list] = {}
    for inv in db.query(models.Invoice).filter(models.Invoice.mr_id == mr_id, models.Invoice.invoice_date < last).all():
        by_month.setdefault(_key(inv.invoice_date.year, inv.invoice_date.month), []).append(inv)
    now = _now_utc()
    added = False
    for key, rows in by_month.items():
        if key in have or not _all_paid(rows):
            continue
        last_paid = (db.query(func.max(models.Payment.payment_date))
                     .filter(models.Payment.invoice_id.in_([r.id for r in rows]), models.Payment.amount > 0).scalar())
        db.add(models.MonthClearance(user_id=mr_id, month=key, on_time=_on_time(db, rows), invoice_count=len(rows),
                                     cleared_at=last_paid or now, shown_at=now, notified_at=now, cleared_by=None))
        added = True
    if added:
        db.commit()


def trophy_summary(db: Session, mr_id: int, today: date | None = None) -> dict:
    today = today or _today()
    backfill_trophies(db, mr_id, today)
    current_fy = today.year if today.month >= 4 else today.year - 1
    carry = _fy_open(db, mr_id, current_fy - 1)
    records = (
        db.query(models.MonthClearance)
        .filter(models.MonthClearance.user_id == mr_id, models.MonthClearance.undone_at.is_(None))
        .order_by(models.MonthClearance.month.desc())
        .all()
    )
    counted = [r for r in records if fy_of(r.month) == current_fy or (carry and fy_of(r.month) == current_fy - 1)]
    groups: dict[int, list] = {}
    for r in records:
        year, month = map(int, r.month.split("-"))
        groups.setdefault(fy_of(r.month), []).append({
            "month": r.month, "label": f"{_MONTHS[month - 1]} {year}",
            "cleared_on": r.cleared_at.replace(tzinfo=timezone.utc).astimezone(IST).date().isoformat() if r.cleared_at else None,
        })
    return {
        "count": len(counted),
        "counted_months": [r.month for r in counted],
        "fy": current_fy, "fy_label": fy_label(current_fy),
        "carry_fy_label": fy_label(current_fy - 1) if carry and any(fy_of(r.month) == current_fy - 1 for r in records) else None,
        "groups": [{"fy": fy, "label": fy_label(fy), "months": months} for fy, months in sorted(groups.items(), reverse=True)],
    }


def _note_fy_closed(db: Session, mr_id: int, items: list[dict]) -> list[dict]:
    """Mark the celebration that closed last financial year for this MR:
    "FY 2026-27 closed with 12 trophies"; the counter then starts fresh."""
    today = _today()
    last_fy = (today.year if today.month >= 4 else today.year - 1) - 1
    mine = [i for i in items if fy_of(i["month"]) == last_fy]
    if mine and not _fy_open(db, mr_id, last_fy):
        total = db.query(models.MonthClearance.id).filter(
            models.MonthClearance.user_id == mr_id, models.MonthClearance.undone_at.is_(None),
            models.MonthClearance.month >= f"{last_fy}-04", models.MonthClearance.month <= f"{last_fy + 1}-03").count()
        mine[-1]["fy_closed"] = {"label": fy_label(last_fy), "trophies": total}
    return items


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
    return _note_fy_closed(db, user.id, result) if result else result


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
    return _note_fy_closed(db, mr.id, shown), noticed


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
