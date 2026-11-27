"""One look for every internal export (Excel and PDF).

Each file starts with the same three lines, so anyone opening it later knows
exactly what it is:
    1. Title                      e.g. "Invoices"
    2. Filters used               e.g. "Filters: 1–31 Oct 2026 · Distributor · Unpaid"
    3. Who exported it and when   + "Confidential – for internal use only"
then the column headers (frozen, with filter arrows in Excel), the rows, and a
Total row. PDFs carry the same header, and a footer on every page with the
confidentiality note and "Page x of y".

The customer ledger is shared with customers, so it keeps its own layout
(ledger_pdf.py / ledger_xlsx.py) without the internal-use note.
"""
from __future__ import annotations

import re
from urllib.parse import quote
from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO

from fastapi import HTTPException
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .excel_export import _safe
from .ledger_pdf import IST, _fonts, money, nice_date

CONFIDENTIAL = "Confidential – for internal use only"
PDF_MAX_ROWS = 3000  # Longer lists: Excel.
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# ₹ with Indian grouping in Excel (1,23,45,678.00).
INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00'
INR_WHOLE = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0'
FORMATS = {"money": INR, "money0": INR_WHOLE, "int": "#,##0", "pct": "0.0%", "date": "dd-mmm-yyyy", "datetime": "dd-mmm-yyyy hh:mm"}
NUMERIC = {"money", "money0", "int", "pct"}
KINDS = {"text", "date", "datetime"} | NUMERIC


@dataclass
class Col:
    header: str
    kind: str = "text"   # text | money | money0 | int | pct (0–1) | date | datetime
    width: int = 14      # Excel width; also the PDF's relative width
    total: bool = False  # summed in the Total row

    def __post_init__(self):
        if self.kind not in KINDS:
            raise ValueError(f"Unknown column kind {self.kind!r} for {self.header!r}")


@dataclass
class Sheet:
    name: str
    columns: list[Col]
    rows: list[list]
    heading: str | None = None   # shown above the table (PDF section / Excel note)
    note: str | None = None      # one muted line under the heading
    totals: bool = True


@dataclass
class Report:
    title: str
    filters: list[str]
    exported_by: str | None
    sheets: list[Sheet] = field(default_factory=list)


# ---------- the header lines ----------

def filters_line(filters: list[str]) -> str:
    shown = [f for f in filters if f]
    return "Filters: " + (" · ".join(shown) if shown else "none (everything)")


def exported_line(by: str | None) -> str:
    now = datetime.now(IST)
    when = f"{now.day} {now.strftime('%b %Y')}, {now.strftime('%I:%M %p').lstrip('0')}"
    return f"Exported {when}" + (f" by {by}" if by else "") + f" · {CONFIDENTIAL}"


def date_range(date_from: date | None, date_to: date | None, word: str = "") -> str:
    """'1–31 Oct 2026', 'from 1 Oct 2026', 'up to 31 Oct 2026' or '' (all
    dates), led by `word` when given: 'Invoice date: 1–31 Oct 2026'."""
    if date_from and date_to:
        if date_from == date_to:
            text = nice_date(date_from)
        elif (date_from.year, date_from.month) == (date_to.year, date_to.month):
            text = f"{date_from.day}–{date_to.day} {date_to.strftime('%b %Y')}"
        else:
            text = f"{nice_date(date_from)} – {nice_date(date_to)}"
    elif date_from:
        text = f"from {nice_date(date_from)}"
    elif date_to:
        text = f"up to {nice_date(date_to)}"
    else:
        return ""
    return f"{word}: {text}" if word else text[0].upper() + text[1:]


def file_name(*parts: str, ext: str) -> str:
    """'Invoices - Oct 2026 - Distributor.xlsx' (safe characters only)."""
    text = " - ".join(p for p in parts if p)
    text = re.sub(r"[^\w .,()&+–-]", "", text).strip()[:110] or "Export"
    return f"{text}.{ext}"


# ---------- cells ----------

def _total_row(sheet: Sheet) -> list | None:
    if not sheet.totals or not any(c.total for c in sheet.columns) or not sheet.rows:
        return None
    out = []
    for index, col in enumerate(sheet.columns):
        if col.total:
            out.append(round(sum(float(r[index] or 0) for r in sheet.rows if isinstance(r[index], (int, float))), 2))
        else:
            out.append(None)
    # "Total" goes in the first text column.
    for index, col in enumerate(sheet.columns):
        if not col.total and col.kind not in NUMERIC:
            out[index] = "Total"
            break
    return out


def _xl_value(value):
    # Times arrive already in India time (to_ist) from the export code.
    return _safe(value)


# ---------- Excel ----------

INK = "1F2328"
DIM = "6B7280"
HEAD_FILL = PatternFill("solid", fgColor="F1F3F5")
TOTAL_FILL = PatternFill("solid", fgColor="F8F9FA")
THIN = Side(style="thin", color="D0D4D9")


def build_xlsx(report: Report) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    used = set()
    for sheet in report.sheets:
        name = re.sub(r"[\[\]:*?/\\]", "", sheet.name)[:31] or "Sheet"
        while name in used:
            name = name[:28] + f" {len(used)}"
        used.add(name)
        ws = wb.create_sheet(name)
        ncols = max(len(sheet.columns), 1)

        ws.append([sheet.heading or report.title])
        ws["A1"].font = Font(size=14, bold=True, color=INK)
        ws.append([filters_line(report.filters)])
        ws["A2"].font = Font(size=10, color=INK)
        ws.append([exported_line(report.exported_by)])
        ws["A3"].font = Font(size=9, italic=True, color=DIM)
        ws.append([sheet.note] if sheet.note else [])
        if sheet.note:
            ws["A4"].font = Font(size=9, color=DIM)

        header_row = 5
        ws.append([c.header for c in sheet.columns])
        for index, col in enumerate(sheet.columns, start=1):
            cell = ws.cell(row=header_row, column=index)
            cell.font = Font(bold=True, color=INK)
            cell.fill = HEAD_FILL
            cell.border = Border(bottom=THIN)
            cell.alignment = Alignment(horizontal="right" if col.kind in NUMERIC else "left", vertical="center", wrap_text=True)
            ws.column_dimensions[get_column_letter(index)].width = col.width

        for row in sheet.rows:
            ws.append([_xl_value(v) for v in row])
        last_data = header_row + len(sheet.rows)
        for index, col in enumerate(sheet.columns, start=1):
            fmt = FORMATS.get(col.kind)
            if fmt:
                for (cell,) in ws.iter_rows(min_row=header_row + 1, max_row=last_data, min_col=index, max_col=index):
                    cell.number_format = fmt

        total = _total_row(sheet)
        if total:
            ws.append([_xl_value(v) for v in total])
            for index, col in enumerate(sheet.columns, start=1):
                cell = ws.cell(row=last_data + 1, column=index)
                cell.font = Font(bold=True, color=INK)
                cell.fill = TOTAL_FILL
                cell.border = Border(top=THIN)
                if FORMATS.get(col.kind):
                    cell.number_format = FORMATS[col.kind]
        if not sheet.rows:
            ws.append(["No rows match these filters."])
            ws.cell(row=header_row + 1, column=1).font = Font(italic=True, color=DIM)

        ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
        if sheet.rows:
            ws.auto_filter.ref = f"A{header_row}:{get_column_letter(ncols)}{last_data}"
        # Printing: landscape, fit to the page width, header row on every page.
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.print_title_rows = f"{header_row}:{header_row}"
        ws.oddFooter.left.text = CONFIDENTIAL
        ws.oddFooter.right.text = "Page &P of &N"
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ---------- PDF ----------

PINK = colors.HexColor("#1f2328")
PDIM = colors.HexColor("#6b7280")
PLINE = colors.HexColor("#e5e7eb")
PSOFT = colors.HexColor("#f6f7f9")
PRED = colors.HexColor("#c92a2a")


def _pdf_text(value, kind: str) -> str:
    if value is None or value == "":
        return ""
    if kind in ("money", "money0") and isinstance(value, (int, float)):
        return money(round(value) if kind == "money0" else value)
    if kind == "int" and isinstance(value, (int, float)):
        return f"{int(value):,}"
    if kind == "pct" and isinstance(value, (int, float)):
        return f"{value * 100:.1f}%"
    if isinstance(value, datetime):  # already India time
        return f"{value.day} {value.strftime('%b %Y')}, {value.strftime('%I:%M %p').lstrip('0')}"
    if isinstance(value, date):
        return nice_date(value)
    return str(value)


class _NumberedCanvas(pdf_canvas.Canvas):
    """Draws 'Page x of y' once the page count is known."""

    def __init__(self, *args, footer_left: str = "", **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []
        self._footer_left = footer_left

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        count = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            width, _height = self._pagesize
            self.setFont("Sans", 7.5)
            self.setFillColor(PDIM)
            self.drawString(14 * mm, 8 * mm, self._footer_left)
            self.drawRightString(width - 14 * mm, 8 * mm, f"Page {self._pageNumber} of {count}")
            super().showPage()
        super().save()


def build_pdf(report: Report) -> bytes:
    _fonts()
    rows_total = sum(len(s.rows) for s in report.sheets)
    if rows_total > PDF_MAX_ROWS:
        raise HTTPException(413, f"{rows_total} rows is too long for a PDF. Narrow the filters to {PDF_MAX_ROWS} or fewer, or download Excel.")
    wide = max((len(s.columns) for s in report.sheets), default=0) > 6
    pagesize = landscape(A4) if wide else A4
    style = lambda size, color=PINK, bold=False, align=0, leading=None: ParagraphStyle(  # noqa: E731
        "r", fontName="Sans-Bold" if bold else "Sans", fontSize=size, textColor=color, alignment=align, leading=leading or size * 1.3)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=pagesize, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=13 * mm, bottomMargin=15 * mm,
                            title=report.title, author="Portal")
    usable = pagesize[0] - 28 * mm
    story = [
        Paragraph(report.title, style(16, bold=True, leading=20)),
        Spacer(1, 3),
        Paragraph(filters_line(report.filters), style(9)),
        Spacer(1, 2),
        Paragraph(exported_line(report.exported_by), style(8, PDIM)),
        Spacer(1, 8),
    ]
    cell = style(8.2, leading=10.5)
    cell_r = style(8.2, align=2, leading=10.5)
    head = style(7.8, PDIM, bold=True, leading=10)
    head_r = style(7.8, PDIM, bold=True, align=2, leading=10)
    bold = style(8.4, bold=True, leading=10.5)
    bold_r = style(8.4, bold=True, align=2, leading=10.5)

    for n, sheet in enumerate(report.sheets):
        block = []
        if len(report.sheets) > 1 or sheet.heading:
            block.append(Paragraph(sheet.heading or sheet.name, style(11.5, bold=True, leading=15)))
        if sheet.note:
            block.append(Paragraph(sheet.note, style(8, PDIM)))
        if block:
            block.append(Spacer(1, 5))
        cols = sheet.columns
        weights = [max(c.width, 6) for c in cols]
        scale = usable / sum(weights)
        widths = [w * scale for w in weights]
        data = [[Paragraph(c.header, head_r if c.kind in NUMERIC else head) for c in cols]]
        for row in sheet.rows:
            data.append([Paragraph(_pdf_text(v, c.kind).replace("&", "&amp;").replace("<", "&lt;"),
                                   cell_r if c.kind in NUMERIC else cell) for v, c in zip(row, cols)])
        total = _total_row(sheet)
        if total:
            data.append([Paragraph(_pdf_text(v, c.kind), bold_r if c.kind in NUMERIC else bold) for v, c in zip(total, cols)])
        if not sheet.rows:
            data.append([Paragraph("No rows match these filters.", style(8.2, PDIM))] + [""] * (len(cols) - 1))
        table = Table(data, colWidths=widths, repeatRows=1)
        commands = [
            ("BACKGROUND", (0, 0), (-1, 0), PSOFT),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, PLINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]
        for r in range(1, len(sheet.rows) + 1):
            commands.append(("LINEBELOW", (0, r), (-1, r), 0.4, PLINE))
        if total:
            commands += [("BACKGROUND", (0, -1), (-1, -1), PSOFT), ("LINEABOVE", (0, -1), (-1, -1), 0.8, PDIM)]
        if not sheet.rows:
            commands.append(("SPAN", (0, 1), (-1, 1)))
        table.setStyle(TableStyle(commands))
        if block:
            story.append(KeepTogether(block + [table]) if len(sheet.rows) < 18 else block[0])
            if len(sheet.rows) >= 18:
                story += block[1:] + [table]
        else:
            story.append(table)
        if n < len(report.sheets) - 1:
            story.append(PageBreak() if len(sheet.rows) > 25 else Spacer(1, 14))

    footer = f"{CONFIDENTIAL} · {report.title}"
    doc.build(story, canvasmaker=lambda *a, **k: _NumberedCanvas(*a, footer_left=footer, **k))
    return buf.getvalue()


def check_format(fmt: str | None) -> str:
    fmt = (fmt or "xlsx").strip().lower()
    if fmt not in ("xlsx", "pdf"):
        raise HTTPException(422, "format must be xlsx or pdf")
    return fmt


def report_response(report: Report, name: str, fmt: str = "xlsx") -> Response:
    fmt = check_format(fmt)
    if fmt == "pdf":
        content, media = build_pdf(report), "application/pdf"
    else:
        content, media = build_xlsx(report), _XLSX
    filename = name if name.endswith(f".{fmt}") else f"{name}.{fmt}"
    return Response(content=content, media_type=media, headers={"Content-Disposition": disposition(filename)})


def disposition(filename: str) -> str:
    """Plain-ASCII name for old browsers, plus the exact UTF-8 name (–, ₹)."""
    plain = filename.replace("–", "-").replace("·", "-").encode("ascii", "ignore").decode() or "Export"
    return f'attachment; filename="{plain}"; filename*=UTF-8\'\'{quote(filename)}'


# ---------- filter wording shared by the exports ----------

STATUS_WORDS = {"PAID": "Paid", "PARTIAL": "Part paid", "UNPAID": "Unpaid", "REVERSED": "Reversed"}


def describe(db, *, date_from=None, date_to=None, date_word="", mr_id=None, customer_id=None,
             customer_type=None, status=None, search=None, area=None, due=None, overdue_days=None,
             more: tuple | list = ()) -> list[str]:
    """Plain words for the filters in force, in a fixed order."""
    from . import models  # local: keeps this module light to import

    out = [date_range(date_from, date_to, date_word)]
    if mr_id == 0:
        out.append("No MR")
    elif mr_id:
        user = db.get(models.User, mr_id)
        out.append(f"MR: {user.name if user else mr_id}")
    if customer_id:
        customer = db.get(models.Customer, customer_id)
        out.append(f"Customer: {customer.name if customer else customer_id}")
    if customer_type:
        types = [t.strip() for t in str(customer_type).split(",") if t.strip()]
        out.append(("Type: " if len(types) == 1 else "Types: ") + ", ".join(types))
    if area:
        out.append(f"Area: {area}")
    if status:
        out.append(f"Status: {STATUS_WORDS.get(str(status).upper(), status)}")
    if due:
        if str(due).lower() == "notdue":
            out.append("Not yet due")
        elif overdue_days not in (None, ""):
            out.append(f"Overdue by more than {overdue_days} day{'s' if int(overdue_days) != 1 else ''}")
        else:
            out.append("Overdue")
    out += list(more)
    if search:
        out.append(f'Search: "{search}"')
    return [x for x in out if x]
