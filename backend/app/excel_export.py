"""Small helper for Admin "Export to Excel" downloads (openpyxl, already a dependency)."""

from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

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


def workbook_response(filename: str, sheet_title: str, headers: list[str], rows, widths: list[int] | None = None) -> Response:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.freeze_panes = "A2"
    for row in rows:
        ws.append([_safe(value) for value in row])
    for index, header in enumerate(headers, start=1):
        width = widths[index - 1] if widths and index <= len(widths) else max(12, len(header) + 2)
        ws.column_dimensions[get_column_letter(index)].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, datetime):
                cell.number_format = "dd-mmm-yyyy hh:mm"
            elif isinstance(cell.value, date):
                cell.number_format = "dd-mmm-yyyy"
            elif isinstance(cell.value, float):
                cell.number_format = "#,##0.00"
    buffer = BytesIO()
    wb.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type=_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
