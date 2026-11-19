"""Customer ledger as an Excel file (Admin): a short header with the customer
and totals, an Invoices sheet and a Payments sheet. Same rows as the screen."""
from datetime import date, datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .collection_info import REVERSAL_MODE, mode_label
from .excel_export import _safe, to_ist

# Indian grouping (₹7,43,950.00): Excel has no lakh separator, so the commas
# are placed by size.
RUPEE = '[>=10000000]"₹"#\\,##\\,##\\,##0.00;[>=100000]"₹"#\\,##\\,##0.00;"₹"#,##0.00'
NEGATIVE = '[Red]-"₹"#,##0.00;[Red]-"₹"#,##0.00'
HEAD_FILL = PatternFill("solid", fgColor="EEF1F4")
THIN = Side(style="thin", color="D0D5DB")
STATUS = {"PAID": "Paid", "PARTIAL": "Part paid", "UNPAID": "Unpaid"}


def _is_reversal(p):
    return p.reversal_of_id is not None or (p.amount or 0) < 0 or p.mode == REVERSAL_MODE


def _header(ws, customer, mr_name, scope, today, totals, ncols):
    ws.append([customer.name])
    ws["A1"].font = Font(bold=True, size=14)
    sub = " · ".join(x for x in [customer.type, customer.area, f"MR: {mr_name}" if mr_name else None, customer.phone] if x)
    ws.append([sub])
    ws.append([f"{', '.join(scope) if scope else 'All invoices'} · Downloaded {today.strftime('%d %b %Y')}"])
    for r in (2, 3):
        ws.cell(r, 1).font = Font(color="6B7280")
    ws.append([])
    invoiced, paid = totals
    ws.append(["Invoiced", "Collected", "Pending"])
    ws.append([float(invoiced or 0), float(paid or 0), float((invoiced or 0) - (paid or 0))])
    for c in range(1, 4):
        ws.cell(5, c).font = Font(color="6B7280", size=9)
        ws.cell(6, c).font = Font(bold=True, size=12, color={1: "1F2328", 2: "2B8A3E", 3: "E03131"}[c])
        ws.cell(6, c).number_format = RUPEE
    ws.append([])
    return 8  # table header row


def _table(ws, start, headers, rows, widths, money_cols, date_cols):
    for i, h in enumerate(headers, start=1):
        cell = ws.cell(start, i, h)
        cell.font = Font(bold=True)
        cell.fill = HEAD_FILL
        cell.border = Border(bottom=THIN)
        cell.alignment = Alignment(horizontal="right" if i in money_cols else "left", indent=0 if i in money_cols else 1)
    for r, row in enumerate(rows, start=start + 1):
        for i, value in enumerate(row, start=1):
            cell = ws.cell(r, i, _safe(value))
            if i in money_cols:
                # Reversals: red with a minus sign (the lakh format has no negative part).
                cell.number_format = NEGATIVE if isinstance(value, (int, float)) and value < 0 else RUPEE
                continue
            cell.alignment = Alignment(horizontal="left", indent=1)
            if i in date_cols and isinstance(value, (date, datetime)):
                cell.number_format = "dd-mmm-yyyy"
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(start + 1, 1)
    end = start + max(len(rows), 1)
    ws.auto_filter.ref = f"A{start}:{get_column_letter(len(headers))}{end}"


def build_ledger_xlsx(customer, mr_name, invoices, payments_by_invoice, collectors, totals, scope, today) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoices"
    start = _header(ws, customer, mr_name, scope, today, totals, 10)
    inv_rows = []
    for inv in invoices:
        pays = [p for p in payments_by_invoice.get(inv.id, []) if not _is_reversal(p)]
        last = pays[-1] if pays else None
        days_old = (today - inv.invoice_date).days if (inv.pending_amount or 0) > 0 and inv.invoice_date else None
        inv_rows.append([
            inv.invoice_number, inv.invoice_date, float(inv.total_amount or 0), float(inv.paid_amount or 0),
            float(inv.pending_amount or 0), STATUS.get((inv.status or "").upper(), inv.status), days_old,
            to_ist(last.payment_date).date() if last and last.payment_date else None,
            mode_label(last.mode) if last else None, collectors.get(last.collected_by) if last else None,
        ])
    _table(ws, start, ["Invoice", "Date", "Amount", "Paid", "Pending", "Status", "Days old", "Last payment", "Mode", "Collected by"],
           inv_rows, [16, 13, 15, 15, 15, 12, 10, 14, 12, 16], {3, 4, 5}, {2, 8})
    ws.column_dimensions["A"].width = max(16, min(40, len(customer.name or "") * 0.9))

    ps = wb.create_sheet("Payments")
    start = _header(ps, customer, mr_name, scope, today, totals, 6)
    number = {inv.id: inv.invoice_number for inv in invoices}
    pay_rows = []
    for inv in invoices:
        for p in payments_by_invoice.get(inv.id, []):
            rev = _is_reversal(p)
            pay_rows.append([
                to_ist(p.payment_date).date() if p.payment_date else None, number[inv.id], float(p.amount or 0),
                "Reversal" if rev else mode_label(p.mode),
                (p.reason or p.transaction_reference) if rev else p.transaction_reference,
                collectors.get(p.collected_by),
            ])
    pay_rows.sort(key=lambda r: (r[0] or date.min), reverse=True)
    _table(ps, start, ["Date", "Invoice", "Amount", "Mode", "Reference / reason", "Collected by"],
           pay_rows, [13, 16, 14, 14, 30, 16], {3}, {1})
    ps.column_dimensions["A"].width = max(16, min(40, len(customer.name or "") * 0.9))

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
