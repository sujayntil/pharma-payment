"""Admin Dashboard "Export": customers by type (Excel or PDF).

One type picked: a single sheet listing every customer of that type.
Several types: "Summary" (one row per type + Total), then one sheet per type
with every customer that has invoices in the selected dates (most pending
first, + Total).
"""

from collections import defaultdict
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import models
from .credit import is_overdue
from .excel_export import _IST, to_ist
from .reports import Col, Report, Sheet

TYPE_ORDER = ["Distributor", "Chemist", "Doctor", "Hospital"]
OTHER = "Other"



def type_label(raw: str | None) -> str:
    text = (raw or "").strip().lower()
    for name in TYPE_ORDER:
        if text == name.lower():
            return name
    return OTHER


def collect_rows(db: Session, conditions, type_filter) -> dict[str, list[dict]]:
    """Customers (with invoices in the dates) grouped by type, with totals."""
    today = datetime.now(_IST).date()
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
                "oldest": None, "last": None, "overdue": 0.0,
            }
        row["invoices"] += 1
        row["billed"] += float(invoice.total_amount or 0)
        row["collected"] += float(invoice.paid_amount or 0)
        pending = float(invoice.pending_amount or 0)
        row["pending"] += pending
        if pending > 0 and is_overdue(invoice.invoice_date, customer.type if customer else None, today):
            row["overdue"] += pending
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


def build_report(grouped: dict[str, list[dict]], filters: list[str], exported_by: str | None) -> Report:
    """One type picked: a single sheet with every customer of that type.
    Several types: a Summary sheet first, then one sheet per type."""
    today = datetime.now(_IST).date()
    order = [name for name in TYPE_ORDER + [OTHER] if grouped.get(name)]
    customer_cols = [Col("Customer", width=32), Col("MR", width=16), Col("Phone", width=14), Col("Invoices", "int", 9, True),
                     Col("Billed", "money0", 14, True), Col("Collected", "money0", 14, True), Col("Pending", "money0", 14, True),
                     Col("Overdue", "money0", 14, True), Col("Oldest pending", "date", 14), Col("Days old", "int", 9),
                     Col("Last collection", "date", 14)]

    def customer_rows(rows):
        return [[r["name"], r["mr"], r["phone"], r["invoices"], r["billed"], r["collected"], r["pending"], r["overdue"],
                 r["oldest"], (today - r["oldest"]).days if r["oldest"] else None,
                 to_ist(r["last"]).date() if r["last"] else None] for r in rows]

    sheets = []
    if len(order) > 1:
        summary_rows = []
        for name in order:
            rows = grouped[name]
            billed = sum(r["billed"] for r in rows)
            collected = sum(r["collected"] for r in rows)
            summary_rows.append([name, len(rows), sum(r["invoices"] for r in rows), billed, collected,
                                 sum(r["pending"] for r in rows), sum(r["overdue"] for r in rows),
                                 collected / billed if billed else 0])
        sheets.append(Sheet(
            "Summary",
            [Col("Customer type", width=18), Col("Customers", "int", 11, True), Col("Invoices", "int", 10, True),
             Col("Billed", "money0", 15, True), Col("Collected", "money0", 15, True), Col("Pending", "money0", 15, True),
             Col("Overdue", "money0", 15, True), Col("% collected", "pct", 12)],
            summary_rows, heading="Customers by type · Summary",
            note="Each customer is listed on the sheet of their type: " + ", ".join(order) + ".",
        ))
    for name in order:
        rows = grouped[name]
        sheets.append(Sheet(name, customer_cols, customer_rows(rows), heading=f"{name} customers",
                            note=f"{len(rows)} customer{'s' if len(rows) != 1 else ''} with invoices in these dates · most pending first"))
    if not order:
        sheets.append(Sheet("Customers", customer_cols, [], heading="Customers by type"))
    return Report("Customers by type", filters, exported_by, sheets)
