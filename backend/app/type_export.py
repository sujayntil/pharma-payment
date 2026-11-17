"""Admin Dashboard "Export": customers by type, as one formatted workbook.

Sheet "Summary": one row per customer type (+ Total).
Then one sheet per type: every customer with invoices in the selected
dates, with totals (most pending first, + Total).
"""

from collections import defaultdict
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import models
from .excel_export import _IST, _safe, to_ist

TYPE_ORDER = ["Distributor", "Chemist", "Doctor", "Hospital"]
OTHER = "Other"

# ₹ with Indian grouping: ₹2,53,531 / ₹1,23,45,678.
RUPEES = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0'
GREEN = PatternFill("solid", fgColor="2F9E44")
TOTAL_FILL = PatternFill("solid", fgColor="EBFBEE")
AMBER = PatternFill("solid", fgColor="FFF3BF")
RED_FILL = PatternFill("solid", fgColor="FFE3E3")
THIN = Side(style="thin", color="B2F2BB")


def type_label(raw: str | None) -> str:
    text = (raw or "").strip().lower()
    for name in TYPE_ORDER:
        if text == name.lower():
            return name
    return OTHER


def collect_rows(db: Session, conditions, type_filter) -> dict[str, list[dict]]:
    """Customers (with invoices in the dates) grouped by type, with totals."""
    query = (
        db.query(models.Invoice)
        .outerjoin(models.Customer, models.Invoice.customer_id == models.Customer.id)
        .options(joinedload(models.Invoice.customer).joinedload(models.Customer.mr))
    )
    query = type_filter(query)
    for condition in conditions:
        query = query.filter(condition)
    invoices = query.all()

    ids = [invoice.id for invoice in invoices]
    last_paid: dict[int, datetime] = {}
    for start in range(0, len(ids), 500):
        for invoice_id, paid_at in (
            db.query(models.Payment.invoice_id, func.max(models.Payment.payment_date))
            .filter(models.Payment.invoice_id.in_(ids[start:start + 500]), models.Payment.amount > 0)
            .group_by(models.Payment.invoice_id)
        ):
            last_paid[invoice_id] = paid_at

    customers: dict[int | None, dict] = {}
    for invoice in invoices:
        customer = invoice.customer
        key = customer.id if customer else None
        row = customers.get(key)
        if row is None:
            row = customers[key] = {
                "type": type_label(customer.type if customer else None),
                "name": customer.name if customer else "(No customer)",
                "mr": customer.mr.name if customer and customer.mr else "Unassigned",
                "phone": (customer.phone if customer else None) or "",
                "invoices": 0, "billed": 0.0, "collected": 0.0, "pending": 0.0,
                "oldest": None, "last": None,
            }
        row["invoices"] += 1
        row["billed"] += float(invoice.total_amount or 0)
        row["collected"] += float(invoice.paid_amount or 0)
        pending = float(invoice.pending_amount or 0)
        row["pending"] += pending
        if pending > 0 and invoice.invoice_date and (row["oldest"] is None or invoice.invoice_date < row["oldest"]):
            row["oldest"] = invoice.invoice_date
        paid_at = last_paid.get(invoice.id)
        if paid_at and (row["last"] is None or paid_at > row["last"]):
            row["last"] = paid_at

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in customers.values():
        grouped[row["type"]].append(row)
    for rows in grouped.values():
        rows.sort(key=lambda r: (-r["pending"], r["name"].lower()))
    return grouped


def _header(ws, title: str, subtitle: str, headers: list[str], widths: list[int]):
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14, color="1B5E20")
    ws["A2"] = subtitle
    ws["A2"].font = Font(size=10, color="868E96")
    ws.append([])
    ws.append(headers)
    for cell in ws[4]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = GREEN
        cell.alignment = Alignment(vertical="center", horizontal="left" if cell.column <= 3 else "right")
    ws.row_dimensions[4].height = 22
    ws.freeze_panes = "A5"
    # Prints landscape, one page wide, header row repeated on every page.
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "4:4"
    ws.sheet_view.showGridLines = False
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width


def _total_row(ws, values: list, money_cols: set[int]):
    ws.append(values)
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)
        cell.fill = TOTAL_FILL
        cell.border = Border(top=Side(style="medium", color="2F9E44"))
        if cell.column in money_cols:
            cell.number_format = RUPEES


def build_workbook(grouped: dict[str, list[dict]], range_text: str) -> bytes:
    now = datetime.now(_IST)
    today = now.date()
    stamp = f"Invoice dates: {range_text}  ·  Exported {now.strftime('%d %b %Y, %I:%M %p').replace(' 0', ' ')}"
    order = [name for name in TYPE_ORDER + [OTHER] if grouped.get(name)]

    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    _header(summary, "Customers by type", stamp,
            ["Customer type", "Customers", "Invoices", "Billed", "Collected", "Pending", "Pending 40+ days", "% collected"],
            [18, 12, 11, 15, 15, 15, 17, 13])
    totals = defaultdict(float)
    for name in order:
        rows = grouped[name]
        billed = sum(r["billed"] for r in rows)
        collected = sum(r["collected"] for r in rows)
        pending = sum(r["pending"] for r in rows)
        old = sum(r["pending"] for r in rows if r["oldest"] and (today - r["oldest"]).days >= 40)
        values = [name, len(rows), sum(r["invoices"] for r in rows), billed, collected, pending, old,
                  collected / billed if billed else 0]
        summary.append(values)
        for key, value in zip(["customers", "invoices", "billed", "collected", "pending", "old"], values[1:7]):
            totals[key] += value
    for row in summary.iter_rows(min_row=5):
        for cell in row:
            if cell.column in (4, 5, 6, 7):
                cell.number_format = RUPEES
            elif cell.column == 8:
                cell.number_format = "0%"
        if row[5].value:
            row[5].font = Font(color="C92A2A")
        if row[6].value:
            row[6].font = Font(color="C92A2A")
    _total_row(summary, ["Total", totals["customers"], totals["invoices"], totals["billed"], totals["collected"],
                         totals["pending"], totals["old"],
                         totals["collected"] / totals["billed"] if totals["billed"] else 0], {4, 5, 6, 7})
    summary.cell(row=summary.max_row, column=8).number_format = "0%"
    if len(order) > 0:
        summary.auto_filter.ref = f"A4:H{summary.max_row - 1}"

    for name in order:
        rows = grouped[name]
        ws = wb.create_sheet(name[:31])
        _header(ws, f"{name} customers", stamp,
                ["Customer", "MR", "Phone", "Invoices", "Billed", "Collected", "Pending", "Oldest pending", "Days", "Last collection"],
                [34, 16, 15, 10, 15, 15, 15, 15, 8, 16])
        for row in rows:
            days = (today - row["oldest"]).days if row["oldest"] else None
            ws.append([_safe(row["name"]), _safe(row["mr"]), _safe(row["phone"]), row["invoices"], row["billed"],
                       row["collected"], row["pending"], row["oldest"], days,
                       to_ist(row["last"]).date() if row["last"] else None])
            line = ws[ws.max_row]
            for cell in line[4:7]:
                cell.number_format = RUPEES
            if row["pending"] > 0:
                line[6].font = Font(color="C92A2A", bold=True)
            line[7].number_format = line[9].number_format = "dd-mmm-yyyy"
            if days is not None and days >= 40:
                line[8].fill = RED_FILL
                line[8].font = Font(color="C92A2A", bold=True)
            elif days is not None and days >= 30:
                line[8].fill = AMBER
                line[8].font = Font(color="E67700", bold=True)
            for cell in line:
                cell.border = Border(bottom=THIN)
        ws.auto_filter.ref = f"A4:J{ws.max_row}"
        _total_row(ws, ["Total", None, None, sum(r["invoices"] for r in rows), sum(r["billed"] for r in rows),
                        sum(r["collected"] for r in rows), sum(r["pending"] for r in rows), None, None, None], {5, 6, 7})

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def range_label(date_from: date | None, date_to: date | None) -> str:
    fmt = lambda d: d.strftime("%d %b %Y").lstrip("0")  # noqa: E731
    if date_from and date_to:
        return f"{fmt(date_from)} – {fmt(date_to)}"
    if date_from:
        return f"From {fmt(date_from)}"
    if date_to:
        return f"Up to {fmt(date_to)}"
    return "All time"
