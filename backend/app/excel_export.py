"""Shared bits for the exports: row cap, India time, formula-safe text.
The files themselves are built by reports.py."""

from datetime import datetime, timedelta, timezone

# Hard cap so one export can never pull an unbounded result set into memory.
EXPORT_MAX_ROWS = 20000
_IST = timezone(timedelta(hours=5, minutes=30))
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def to_ist(value: datetime | None) -> datetime | None:
    """Stored timestamps are naive UTC; Excel gets naive India time."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(_IST).replace(tzinfo=None)


def _safe(value):
    """Text that starts like a formula is stored as plain text, so a customer
    name or reference can never run as a formula when the file is opened."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value
