"""Slows down password guessing on POST /auth/login.

Failed sign-ins are counted per employee code and per client address in the
``login_attempts`` table (so the limit survives restarts and works with more
than one server process). After too many failures inside the window, further
attempts for that code / address are refused with 429 until the lock expires.
A correct sign-in clears the count for that employee code.

Nothing here changes who can sign in or how tokens are issued.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models

WINDOW = timedelta(minutes=15)
LOCK_FOR = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
# Higher, because many people can share one office or mobile-network address.
MAX_FAILURES_PER_ADDRESS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def client_address(request: Request) -> str:
    """Best available client address (first X-Forwarded-For hop behind a proxy)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return (first or (request.client.host if request.client else "") or "unknown")[:64]


def _keys(employee_code: str, address: str) -> list[tuple[str, int]]:
    code = (employee_code or "").strip().lower()[:80]
    return [(f"user:{code}", MAX_FAILURES_PER_ACCOUNT), (f"ip:{address}", MAX_FAILURES_PER_ADDRESS)]


def ensure_not_locked(db: Session, employee_code: str, address: str) -> None:
    now = _now()
    for key, _limit in _keys(employee_code, address):
        row = db.query(models.LoginAttempt).filter_by(key=key).first()
        if row and row.locked_until and row.locked_until > now:
            minutes = max(1, int((row.locked_until - now).total_seconds() // 60) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
                headers={"Retry-After": str(int((row.locked_until - now).total_seconds()) + 1)},
            )


def record_failure(db: Session, employee_code: str, address: str) -> None:
    now = _now()
    for key, limit in _keys(employee_code, address):
        try:
            row = db.query(models.LoginAttempt).filter_by(key=key).first()
            if row is None:
                row = models.LoginAttempt(key=key, failures=0, window_started_at=now)
                db.add(row)
            if row.window_started_at is None or now - row.window_started_at > WINDOW:
                row.failures = 0
                row.window_started_at = now
                row.locked_until = None
            row.failures = (row.failures or 0) + 1
            if row.failures >= limit:
                row.locked_until = now + LOCK_FOR
            db.commit()
        except IntegrityError:
            # Two failures for a brand-new key at the same instant; the count
            # is only a throttle, so losing one increment is fine.
            db.rollback()


def record_success(db: Session, employee_code: str) -> None:
    key = _keys(employee_code, "")[0][0]
    if db.query(models.LoginAttempt).filter_by(key=key).delete():
        db.commit()
