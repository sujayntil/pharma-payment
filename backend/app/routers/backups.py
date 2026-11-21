"""Admin › Backup: download the data (Excel to read, Full file to restore)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models
from ..audit import write_audit
from ..backup import excel_backup, full_backup
from ..database import get_db
from ..deps import require_admin
from ..excel_export import _XLSX

router = APIRouter(prefix="/admin/backup", tags=["backup"])

_IST = timezone(timedelta(hours=5, minutes=30))
ACTION = "backup_downloaded"
KINDS = {"excel": "Excel", "full": "Full"}
WAIT_SECONDS = 60


def _last(db: Session, kind: str | None = None):
    rows = db.query(models.AuditLog).filter(models.AuditLog.action == ACTION).order_by(models.AuditLog.id.desc()).limit(50)
    for row in rows:
        if kind is None or (row.new_value or {}).get("kind") == kind:
            return row
    return None


def _guard(db: Session, kind: str) -> None:
    """One download of each kind a minute: a double-click doesn't build it twice."""
    last = _last(db, kind)
    if last and last.timestamp and datetime.now(timezone.utc).replace(tzinfo=None) - last.timestamp < timedelta(seconds=WAIT_SECONDS):
        raise HTTPException(429, "That backup was just downloaded. Try again in a minute.")


def _stamp() -> str:
    return datetime.now(_IST).strftime("%Y-%m-%d %H%M")


@router.get("/status")
def backup_status(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    last = _last(db)
    if not last:
        return {"last": None}
    by = db.get(models.User, last.user_id) if last.user_id else None
    return {"last": {
        "at": last.timestamp.replace(tzinfo=timezone.utc).isoformat() if last.timestamp else None,
        "kind": (last.new_value or {}).get("kind"),
        "by": by.name if by else None,
    }}


@router.get("/excel")
def backup_excel(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    _guard(db, KINDS["excel"])
    content, counts = excel_backup(db, datetime.now(_IST).date())
    write_audit(db, ACTION, user, new={"kind": KINDS["excel"], "rows": sum(counts.values())})
    db.commit()
    return Response(content, media_type=_XLSX, headers={
        "Content-Disposition": f'attachment; filename="Pharma backup {_stamp()}.xlsx"',
        "Cache-Control": "no-store",
    })


@router.get("/full")
def backup_full(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    _guard(db, KINDS["full"])
    content, counts = full_backup(db)
    write_audit(db, ACTION, user, new={"kind": KINDS["full"], "rows": sum(counts.values())})
    db.commit()
    return Response(content, media_type="application/gzip", headers={
        "Content-Disposition": f'attachment; filename="Pharma full backup {_stamp()}.json.gz"',
        "Cache-Control": "no-store",
    })
