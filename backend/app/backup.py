"""Admin backups you download from the app.

Two files:
* Excel  - the data in readable sheets (customers, invoices, payments ...),
           for a pen drive or the accountant. Not used for restoring.
* Full   - every table, every column, as gzipped JSON. ``restore_backup.py``
           rebuilds an empty database from it. It holds login password
           hashes, so treat it as private.
"""

import gzip
import json
from datetime import date, datetime, timezone
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import Date, DateTime, func, select, text
from sqlalchemy.orm import Session

from . import models
from .database import Base
from .excel_export import _safe, to_ist

FORMAT = "pharma-backup"
VERSION = 1
# Short-lived housekeeping, not business data: rebuilt on their own.
SKIP_TABLES = {"login_attempts", "revoked_tokens", "push_subscriptions"}


def backup_tables():
    """Tables in the full backup, parents before children (restore order)."""
    return [t for t in Base.metadata.sorted_tables if t.name not in SKIP_TABLES]


def _plain(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if hasattr(value, "value") and not isinstance(value, (str, int, float, bool)):
        return value.value  # enum
    return value


def full_backup(db: Session) -> tuple[bytes, dict]:
    """Every backed-up table as gzipped JSON, plus row counts."""
    tables, counts = {}, {}
    for table in backup_tables():
        order = list(table.primary_key.columns) or list(table.columns)[:1]
        rows = db.execute(select(table).order_by(*order)).all()
        tables[table.name] = {
            "columns": [c.name for c in table.columns],
            "rows": [[_plain(v) for v in row] for row in rows],
        }
        counts[table.name] = len(rows)
    payload = {
        "format": FORMAT,
        "version": VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "tables": tables,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    return gzip.compress(raw, compresslevel=9, mtime=0), counts


def _from_plain(column, value):
    if value is None:
        return None
    if isinstance(column.type, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(column.type, Date):
        return date.fromisoformat(value)
    return value


def restore(conn, data: dict) -> dict:
    """Load a full backup into an EMPTY database (tables already created).
    Refuses when users, customers or invoices already exist."""
    if data.get("format") != FORMAT:
        raise ValueError("This is not a Full backup file from the app.")
    for guard in (models.User.__table__, models.Customer.__table__, models.Invoice.__table__):
        if conn.execute(select(func.count()).select_from(guard)).scalar():
            raise ValueError(f"The target database already has {guard.name}. Restore only into an empty database.")
    done = {}
    for table in backup_tables():
        part = data["tables"].get(table.name)
        if not part or not part["rows"]:
            continue
        pairs = [(table.c[name], i) for i, name in enumerate(part["columns"]) if name in table.c]
        rows = [{c.name: _from_plain(c, row[i]) for c, i in pairs} for row in part["rows"]]
        for start in range(0, len(rows), 1000):
            conn.execute(table.insert(), rows[start:start + 1000])
        done[table.name] = len(rows)
    if conn.dialect.name == "postgresql":
        # New rows continue after the restored ids.
        for table in backup_tables():
            pk = list(table.primary_key.columns)
            if len(pk) == 1 and pk[0].name == "id":
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table.name}), 0) + 1, false)"))
    return done


# ---------------------------------------------------------------- Excel ----

_HEAD_FILL = PatternFill("solid", fgColor="E8F5E9")


def _sheet(wb: Workbook, title: str, headers: list[str], rows, widths: list[int], money: set[int] = frozenset()):
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = _HEAD_FILL
        cell.alignment = Alignment(vertical="center")
    count = 0
    for row in rows:
        ws.append([_safe(v) for v in row])
        count += 1
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for i, cell in enumerate(row):
            if isinstance(cell.value, datetime):
                cell.number_format = "dd-mmm-yyyy hh:mm"
            elif isinstance(cell.value, date):
                cell.number_format = "dd-mmm-yyyy"
            elif i in money and isinstance(cell.value, (int, float)):
                cell.number_format = "₹#,##0.00"
    ws.freeze_panes = "A2"
    if count:
        ws.auto_filter.ref = ws.dimensions
    return count


def excel_backup(db: Session, today: date) -> tuple[bytes, dict]:
    """The data in readable sheets. Names instead of ids; India time."""
    users = {u.id: u for u in db.query(models.User).all()}
    customers = {c.id: c for c in db.query(models.Customer).all()}
    invoices = {i.id: i for i in db.query(models.Invoice).all()}
    who = lambda uid: users[uid].name if uid in users else None  # noqa: E731

    wb = Workbook()
    wb.remove(wb.active)
    counts = {}

    counts["Customers"] = _sheet(wb, "Customers",
        ["Name", "Type", "Area", "Phone", "Alternate phone", "WhatsApp on", "Address", "GSTIN", "MR", "Added on"],
        ((c.name, c.type, c.area, c.phone, c.alternate_phone, c.whatsapp_on, c.address, c.gstin, who(c.mr_id), to_ist(c.created_at))
         for c in sorted(customers.values(), key=lambda c: (c.name or "").lower())),
        [32, 13, 18, 15, 15, 13, 40, 18, 16, 18])

    counts["Invoices"] = _sheet(wb, "Invoices",
        ["Invoice no.", "Date", "Customer", "Customer type", "MR", "Total", "Taxable", "Tax", "Paid", "Pending", "Status", "Remarks", "Added on"],
        ((i.invoice_number, i.invoice_date, customers[i.customer_id].name if i.customer_id in customers else None,
          customers[i.customer_id].type if i.customer_id in customers else None, who(i.mr_id),
          i.total_amount, i.taxable_amount, i.tax_amount, i.paid_amount, i.pending_amount, i.status, i.remarks, to_ist(i.created_at))
         for i in sorted(invoices.values(), key=lambda i: (i.invoice_date or date.min, i.id))),
        [16, 13, 32, 13, 16, 14, 14, 12, 14, 14, 10, 30, 18], money={5, 6, 7, 8, 9})

    def item_rows():
        for it in db.query(models.InvoiceItem).order_by(models.InvoiceItem.invoice_id, models.InvoiceItem.id):
            inv = invoices.get(it.invoice_id)
            yield (inv.invoice_number if inv else None, inv.invoice_date if inv else None, it.product_name, it.batch, it.expiry,
                   it.quantity, it.free_quantity, it.rate, it.discount, it.gst, it.amount)
    counts["Invoice items"] = _sheet(wb, "Invoice items",
        ["Invoice no.", "Invoice date", "Product", "Batch", "Expiry", "Qty", "Free", "Rate", "Discount", "GST %", "Amount"],
        item_rows(), [16, 13, 32, 12, 10, 8, 8, 12, 10, 8, 14], money={7, 10})

    def payment_rows():
        for p in db.query(models.Payment).order_by(models.Payment.payment_date, models.Payment.id):
            inv = invoices.get(p.invoice_id)
            cust = customers.get(inv.customer_id) if inv else None
            kind = "Reversal" if p.reversal_of_id or (p.amount or 0) < 0 else "Payment"
            yield (to_ist(p.payment_date), inv.invoice_number if inv else None, cust.name if cust else None, p.amount, p.mode, kind,
                   p.transaction_reference, who(p.collected_by), who(p.recorded_by), p.reason)
    counts["Payments"] = _sheet(wb, "Payments",
        ["Date & time", "Invoice no.", "Customer", "Amount", "Mode", "Kind", "Reference", "Collected by", "Recorded by", "Reason"],
        payment_rows(), [18, 16, 32, 14, 12, 10, 20, 16, 16, 30], money={3})

    counts["Products"] = _sheet(wb, "Products", ["Brand", "Product", "MRP", "GST %"],
        ((p.brand_name, p.product_name, p.mrp, p.gst_rate) for p in db.query(models.Product).order_by(models.Product.product_name)),
        [22, 36, 12, 8], money={2})

    counts["Team"] = _sheet(wb, "Team", ["Name", "Employee code", "Role", "Phone", "Added on"],
        ((u.name, u.employee_code, u.role, u.phone, to_ist(u.created_at)) for u in sorted(users.values(), key=lambda u: (u.role, u.name or ""))),
        [22, 16, 10, 15, 18])

    counts["MR targets"] = _sheet(wb, "MR targets", ["MR", "Month", "Sales target", "Collection target"],
        ((who(t.user_id), t.month, t.sales_target, t.collection_target)
         for t in db.query(models.MrTarget).order_by(models.MrTarget.month, models.MrTarget.user_id)),
        [18, 10, 16, 18], money={2, 3})

    def audit_rows():
        for a in db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc(), models.AuditLog.id.desc()):
            details = a.new_value if a.new_value is not None else a.old_value
            text = json.dumps(details, ensure_ascii=False, default=str) if details is not None else None
            yield (to_ist(a.timestamp), who(a.user_id), a.action.replace("_", " "), text[:2000] if text else None)
    counts["Audit log"] = _sheet(wb, "Audit log", ["When", "Who", "What", "Details"], audit_rows(), [18, 16, 22, 90])

    about = wb.create_sheet("About", 0)
    about.append(["Pharma portal - data backup"])
    about["A1"].font = Font(bold=True, size=14)
    about.append([f"Downloaded on {today.strftime('%d %b %Y')}"])
    about.append(["For reading only. To restore the app, use the Full backup file instead."])
    about.append([])
    about.append(["Sheet", "Rows"])
    about["A5"].font = about["B5"].font = Font(bold=True)
    for name, n in counts.items():
        about.append([name, n])
    about.column_dimensions["A"].width = 26
    about.column_dimensions["B"].width = 10

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue(), counts
