"""Admin: turn a list already on screen (Insights lists, Margin calculator)
into the standard Excel or PDF report: title, filters, who exported it,
"Confidential – for internal use only", the rows and a Total row.

The page sends the rows it shows; the server only formats them, so the file
matches the screen exactly. Every download is written to the audit log."""
from datetime import datetime
from typing import Literal, Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .. import models
from ..audit import write_audit
from ..database import get_db
from ..deps import require_admin
from ..excel_export import EXPORT_MAX_ROWS
from ..reports import Col, Report, Sheet, file_name, report_response

router = APIRouter(prefix="/admin/reports", tags=["reports"])

Cell = Union[str, float, int, None]


class ColumnIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    header: str = Field(max_length=40)
    kind: Literal["text", "money", "money0", "int", "pct", "date", "datetime"] = "text"
    width: int = Field(14, ge=4, le=60)
    total: bool = False


class TableIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(max_length=80)
    filters: list[str] = Field(default_factory=list, max_length=12)
    note: Optional[str] = Field(None, max_length=200)
    columns: list[ColumnIn] = Field(min_length=1, max_length=20)
    rows: list[list[Cell]] = Field(default_factory=list, max_length=EXPORT_MAX_ROWS)
    format: Literal["xlsx", "pdf"] = "xlsx"


def _cell(value: Cell, kind: str):
    """Text is capped; dates arrive as 'YYYY-MM-DD' (or ISO date-time)."""
    if isinstance(value, str):
        value = value[:300]
        if kind in ("date", "datetime") and value:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", ""))
                return parsed.date() if kind == "date" else parsed
            except ValueError:
                return value
        if kind in ("money", "money0", "int", "pct") and value:
            try:
                return float(value)
            except ValueError:
                return value
    return value


@router.post("/table")
def table_report(body: TableIn, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    columns = [Col(c.header, c.kind, c.width, c.total) for c in body.columns]
    width = len(columns)
    rows = [[_cell(v, c.kind) for v, c in zip((row + [None] * width)[:width], columns)] for row in body.rows]
    filters = [f[:160] for f in body.filters if f and f.strip()]
    write_audit(db, "report_exported", user, new={"title": body.title, "rows": len(rows), "format": body.format, "filters": filters})
    db.commit()
    report = Report(body.title, filters, user.name, [Sheet(body.title, columns, rows, note=body.note)])
    return report_response(report, file_name(body.title, *filters[:2], ext=body.format), body.format)
