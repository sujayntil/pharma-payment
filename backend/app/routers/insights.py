"""Insights page (Admin): read-only figures, drill-down lists, customer
insights, and MR targets. Nothing here changes invoices or payments."""
from datetime import date, timedelta
from typing import Optional

from ..customer_groups import parse_types
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..audit import write_audit
from ..database import get_db
from ..deps import require_admin
from ..insights import (DUE_BUCKETS, Filters, customer_change, customer_insights, invoice_list, month_start,
                        save_targets, summary, targets_for, today_ist)

router = APIRouter(prefix="/admin/insights", tags=["insights"])

MAX_DAYS = 366 * 3


def _range(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    today = today_ist()
    start = date_from or month_start(today)
    end = date_to or today
    if end < start:
        raise HTTPException(422, "The end date is before the start date.")
    if (end - start).days > MAX_DAYS:
        raise HTTPException(422, "Choose up to three years.")
    return start, end


def _filters(customer_type: Optional[str], mr_id: Optional[int], area: Optional[str]) -> Filters:
    groups = tuple(parse_types(customer_type))  # several allowed: "Chemist,Doctor"
    if mr_id is not None and mr_id < 0:
        raise HTTPException(422, "mr_id must be 0 (no MR) or an MR")
    return Filters(customer_type=groups, mr_id=mr_id, area=(area or "").strip() or None)


@router.get("")
def insights_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    customer_type: Optional[str] = None,
    mr_id: Optional[int] = None,
    area: Optional[str] = Query(default=None, max_length=80),
    trend: str = Query(default="monthly", pattern="^(monthly|weekly)$"),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
    all_time: bool = False,
):
    if all_time:
        # Everything since the first invoice; nothing to compare with.
        return summary(db, None, today_ist(), _filters(customer_type, mr_id, area), trend)
    start, end = _range(date_from, date_to)
    return summary(db, start, end, _filters(customer_type, mr_id, area), trend)


@router.get("/customer-change")
def insights_customer_change(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    customer_type: Optional[str] = None,
    mr_id: Optional[int] = None,
    area: Optional[str] = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
    all_time: bool = False,
):
    """Active / started / stopped customers for the period (vs the compared one)."""
    start, end = (month_start(today_ist()), today_ist()) if all_time else _range(date_from, date_to)
    return customer_change(db, start, end, _filters(customer_type, mr_id, area), all_time)


@router.get("/records")
def insights_records(
    kind: str = Query(pattern="^(sales|collected|outstanding|active|age)$"),
    bucket: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    customer_type: Optional[str] = None,
    mr_id: Optional[int] = None,
    area: Optional[str] = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
    all_time: bool = False,
):
    if kind == "age" and bucket not in {label for label, _lo, _hi in DUE_BUCKETS}:
        raise HTTPException(422, "bucket must be 0-39, 40-59, 60-89 or 90+")
    start, end = (date(2000, 1, 1), today_ist()) if all_time else _range(date_from, date_to)
    return invoice_list(db, kind, start, end, _filters(customer_type, mr_id, area), bucket)


@router.get("/customers/{customer_id}")
def insights_customer(customer_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    result = customer_insights(db, customer_id)
    if result is None:
        raise HTTPException(404, "Customer not found")
    return result


@router.get("/targets")
def get_targets(
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    month = month or today_ist().strftime("%Y-%m")
    targets = targets_for(db, month)
    mrs = (db.query(models.User).filter(models.User.role == models.RoleEnum.MR.value)
           .order_by(models.User.name).all())
    return {"month": month, "mrs": [{"mr_id": m.id, "name": m.name, **targets.get(m.id, {})} for m in mrs]}


@router.put("/targets")
def put_targets(payload: schemas.MrTargetsSave, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    try:
        save_targets(db, payload.month, payload.targets)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    write_audit(db, "mr_targets_saved", user, new={"month": payload.month,
                "targets": [t.model_dump() for t in payload.targets]})
    db.commit()
    return get_targets(payload.month, db, user)
