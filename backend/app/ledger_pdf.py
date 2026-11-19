"""Customer ledger as a simple, shareable PDF (not an official statement):
customer name, the three totals, then each invoice with its payments under it.
It lists exactly what the ledger screen shows, filters included."""
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .collection_info import REVERSAL_MODE, as_utc, mode_label

IST = timezone(timedelta(hours=5, minutes=30))
FONTS = Path(__file__).parent / "fonts"
_registered = False


def _fonts():
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont("Sans", str(FONTS / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("Sans-Bold", str(FONTS / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold")
        _registered = True


INK = colors.HexColor("#1f2328")
DIM = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")
SOFT = colors.HexColor("#f6f7f9")
GREEN = colors.HexColor("#2b8a3e")
RED = colors.HexColor("#e03131")
AMBER = colors.HexColor("#b35c00")


def money(value) -> str:
    """Indian grouping: ₹1,23,456 (paise only when there are some)."""
    value = float(value or 0)
    sign = "−" if value < 0 else ""
    value = abs(round(value, 2))
    rupees, paise = int(value), round((value - int(value)) * 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        digits = ",".join(parts + [tail])
    return f"{sign}₹{digits}" + (f".{paise:02d}" if paise else "")


def nice_date(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        value = as_utc(value).astimezone(IST).date()
    return f"{value.day} {value.strftime('%b %Y')}"


STATUS = {"PAID": ("Paid", GREEN), "PARTIAL": ("Part paid", AMBER), "UNPAID": ("Unpaid", RED)}


def build_ledger_pdf(customer, mr_name, invoices, payments_by_invoice, collectors, totals, scope, today=None) -> bytes:
    """invoices: in screen order. payments_by_invoice: {invoice_id: [Payment]}.
    collectors: {user_id: name}. totals: (invoiced, paid). scope: short lines
    describing the filters (e.g. "Unpaid only", "1 Apr – 19 Nov 2026")."""
    _fonts()
    today = today or datetime.now(IST).date()
    s = lambda size, color=INK, bold=False, align=0, leading=None: ParagraphStyle(  # noqa: E731
        "x", fontName="Sans-Bold" if bold else "Sans", fontSize=size, textColor=color,
        alignment=align, leading=leading or size * 1.3)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f"Ledger – {customer.name}", author="")
    width = A4[0] - 32 * mm
    story = []

    # Header: customer on the left, what this covers on the right.
    sub = " · ".join(x for x in [customer.type, customer.area, f"MR: {mr_name}" if mr_name else None, customer.phone] if x)
    left = [Paragraph(customer.name, s(17, bold=True, leading=21))]
    if sub:
        left.append(Paragraph(sub, s(9, DIM)))
    right = [Paragraph("LEDGER", s(8, DIM, bold=True, align=2)),
             Paragraph("<br/>".join(scope) if scope else "All invoices", s(9, INK, align=2))]
    head = Table([[left, right]], colWidths=[width * 0.66, width * 0.34])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 7 * mm)]

    # Totals strip.
    invoiced, paid = totals
    pending = (invoiced or 0) - (paid or 0)
    cell = lambda label, value, tone: [Paragraph(label, s(8, DIM)), Paragraph(money(value), s(14, tone, bold=True, leading=18))]  # noqa: E731
    strip = Table([[cell("Invoiced", invoiced, INK), cell("Collected", paid, GREEN), cell("Pending", pending, RED if pending > 0 else INK)]],
                  colWidths=[width / 3] * 3)
    strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEAFTER", (0, 0), (1, 0), 0.6, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story += [strip, Spacer(1, 6 * mm)]

    # Invoices, each followed by its payments in small grey lines.
    cols = [width * w for w in (0.20, 0.17, 0.15, 0.15, 0.15, 0.18)]
    num = lambda v, tone=INK, bold=False: Paragraph(money(v), s(9, tone, bold=bold, align=2))  # noqa: E731
    rows = [[Paragraph(h, s(8, DIM, bold=True, align=2 if i in (2, 3, 4) else 0))
             for i, h in enumerate(["Invoice", "Date", "Amount", "Paid", "Pending", "Status"])]]
    style = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for inv in invoices:
        label, tone = STATUS.get((inv.status or "").upper(), (inv.status or "—", DIM))
        if (inv.pending_amount or 0) > 0 and inv.invoice_date:
            label += f" · {(today - inv.invoice_date).days} d"
        rows.append([
            Paragraph(inv.invoice_number, s(9, bold=True)), Paragraph(nice_date(inv.invoice_date), s(9)),
            num(inv.total_amount), num(inv.paid_amount, GREEN if inv.paid_amount else DIM),
            num(inv.pending_amount, RED if (inv.pending_amount or 0) > 0 else DIM, bold=(inv.pending_amount or 0) > 0),
            Paragraph(label, s(8.5, tone, bold=True)),
        ])
        first = len(rows) - 1
        style.append(("LINEABOVE", (0, first), (-1, first), 0.5, LINE))
        for p in payments_by_invoice.get(inv.id, []):
            who = collectors.get(p.collected_by)
            if p.reversal_of_id is not None or (p.amount or 0) < 0 or p.mode == REVERSAL_MODE:
                text = f"↳ {nice_date(p.payment_date)} · Reversed" + (f" · {p.reason}" if p.reason else "")
                tone = RED
            else:
                bits = [nice_date(p.payment_date), mode_label(p.mode), who, p.transaction_reference and f"Ref {p.transaction_reference}"]
                text = "↳ " + " · ".join(b for b in bits if b)
                tone = DIM
            rows.append([Paragraph(text, s(8, tone, leading=10)), "", "", Paragraph(money(p.amount), s(8, tone, align=2, leading=10)), "", ""])
            r = len(rows) - 1
            style += [("SPAN", (0, r), (2, r)), ("TOPPADDING", (0, r), (-1, r), 0), ("BOTTOMPADDING", (0, r), (-1, r), 3),
                      ("LEFTPADDING", (0, r), (0, r), 10)]
    if not invoices:
        rows.append([Paragraph("No invoices match.", s(9, DIM)), "", "", "", "", ""])
        style.append(("SPAN", (0, 1), (-1, 1)))
    table = Table(rows, colWidths=cols, repeatRows=1)
    table.setStyle(TableStyle(style + [("LINEBELOW", (0, -1), (-1, -1), 0.5, LINE)]))
    story.append(table)

    count = len(invoices)
    footer_left = f"{count} invoice{'s' if count != 1 else ''} · Shared on {nice_date(today)}"

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Sans", 7.5)
        canvas.setFillColor(DIM)
        canvas.drawString(16 * mm, 9 * mm, footer_left)
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
