"""One customer's profile: summary, statement, collections, schemes, activity.

Read-only. Uses the same overdue rule as Insights and the invoice lists
(credit.py), so "Overdue" here always matches the rest of the app.
"""
from collections import defaultdict
from datetime import date, datetime, time as dtime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models
from .credit import credit_days, days_past_credit
from .insights import IST, ist_date, today_ist

STATEMENT_MAX = 400
ACTIVITY_MAX = 120
# Audit rows that can be about one customer (customer_id in old/new value).
CUSTOMER_ACTIONS = (
    "customer_created", "customer_updated", "customer_contact_updated", "customer_mr_changed",
    "customer_restored", "invoice_updated", "invoice_deleted", "invoice_restored", "invoice_created",
    "ledger_exported", "payment_mode_changed",
)


def _months_back(today: date, n: int) -> list[date]:
    first = today.replace(day=1)
    out = []
    for _ in range(n):
        out.append(first)
        first = (first - timedelta(days=1)).replace(day=1)
    return list(reversed(out))


def _fy_start(today: date) -> date:
    return date(today.year if today.month >= 4 else today.year - 1, 4, 1)


def _about(row: models.AuditLog, customer: models.Customer, invoice_ids: set[int]) -> bool:
    for value in (row.old_value, row.new_value):
        if not isinstance(value, dict):
            continue
        if value.get("customer_id") == customer.id or value.get("invoice_id") in invoice_ids:
            return True
        if row.action == "ledger_exported" and value.get("customer") == customer.name:
            return True
    return False


AUDIT_TEXT = {
    "customer_created": "Customer added",
    "customer_updated": "Details edited",
    "customer_contact_updated": "Phone numbers updated",
    "customer_mr_changed": "MR changed",
    "customer_restored": "Customer restored",
    "invoice_created": "Invoice added by hand",
    "invoice_updated": "Invoice edited",
    "invoice_deleted": "Invoice deleted",
    "invoice_restored": "Invoice restored",
    "ledger_exported": "Ledger shared",
    "payment_mode_changed": "Payment mode changed",
}


def build_profile(db: Session, user: models.User, customer: models.Customer) -> dict:
    is_admin = user.role == models.RoleEnum.ADMIN.value
    today = today_ist()
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.customer_id == customer.id)
        .order_by(models.Invoice.invoice_date.asc(), models.Invoice.id.asc())
        .all()
    )
    by_id = {i.id: i for i in invoices}
    payments = (
        db.query(models.Payment)
        .filter(models.Payment.invoice_id.in_(list(by_id) or [0]))
        .order_by(models.Payment.payment_date.asc(), models.Payment.id.asc())
        .all()
    )
    people_ids = {p.collected_by for p in payments if p.collected_by} | {p.recorded_by for p in payments if p.recorded_by}
    people = dict(db.query(models.User.id, models.User.name).filter(models.User.id.in_(people_ids)).all()) if people_ids else {}

    # ---- summary ----
    credit = credit_days(customer.type)
    owed = sum(max(i.pending_amount or 0, 0) for i in invoices)
    overdue = [i for i in invoices if (i.pending_amount or 0) > 0
               and (days_past_credit(i.invoice_date, customer.type, today) or -1) >= 0]
    year_ago = today - timedelta(days=365)
    fy = _fy_start(today)
    real = [p for p in payments if not p.reversal_of_id and (p.amount or 0) > 0]
    last_paid = real[-1] if real else None
    paid_by = defaultdict(lambda: None)
    for p in real:
        paid_by[p.invoice_id] = ist_date(p.payment_date)
    days_to_pay = [
        (paid_by[i.id] - i.invoice_date).days
        for i in invoices
        if (i.pending_amount or 0) <= 0 and (i.total_amount or 0) > 0 and i.invoice_date
        and paid_by[i.id] and i.invoice_date >= year_ago
    ]
    summary = {
        "owed": round(owed, 2),
        "credit_days": credit,
        "overdue": round(sum(i.pending_amount for i in overdue), 2),
        "overdue_bills": len(overdue),
        "oldest_overdue_days": max((days_past_credit(i.invoice_date, customer.type, today) for i in overdue), default=None),
        "open_bills": sum(1 for i in invoices if (i.pending_amount or 0) > 0),
        "bills": len(invoices),
        "billed_12m": round(sum(i.total_amount or 0 for i in invoices if i.invoice_date and i.invoice_date > year_ago), 2),
        "billed_fy": round(sum(i.total_amount or 0 for i in invoices if i.invoice_date and i.invoice_date >= fy), 2),
        "avg_days_to_pay": round(sum(days_to_pay) / len(days_to_pay)) if days_to_pay else None,
        "last_paid": {"date": ist_date(last_paid.payment_date), "amount": last_paid.amount} if last_paid else None,
        "first_bill": invoices[0].invoice_date if invoices else None,
    }

    # ---- 12 months: billed vs collected ----
    months = _months_back(today, 12)
    billed, collected, recovered = defaultdict(float), defaultdict(float), defaultdict(float)
    for i in invoices:
        if i.invoice_date:
            billed[i.invoice_date.replace(day=1)] += i.total_amount or 0
            recovered[i.invoice_date.replace(day=1)] += i.paid_amount or 0
    for p in payments:
        d = ist_date(p.payment_date)
        if d:
            collected[d.replace(day=1)] += p.amount or 0
    monthly = [{"month": m, "billed": round(billed[m], 2), "recovered": round(recovered[m], 2),
                "collected": round(collected[m], 2)} for m in months]

    # ---- statement: bills and payments with a running balance ----
    entries = []
    for i in invoices:
        entries.append((i.invoice_date or ist_date(i.created_at), 0, i.id, {
            "kind": "bill", "invoice_id": i.id, "ref": i.invoice_number, "debit": i.total_amount or 0, "credit": 0,
        }))
    for p in payments:
        inv = by_id.get(p.invoice_id)
        amount = p.amount or 0
        entries.append((ist_date(p.payment_date), 1, p.id, {
            "kind": "reversal" if p.reversal_of_id or amount < 0 else "payment",
            "invoice_id": p.invoice_id, "ref": inv.invoice_number if inv else None,
            "mode": p.mode, "debit": -amount if amount < 0 else 0, "credit": amount if amount > 0 else 0,
        }))
    entries.sort(key=lambda e: (e[0] or date.min, e[1], e[2]))
    balance, statement = 0.0, []
    for d, _, _, row in entries:
        balance += row["debit"] - row["credit"]
        statement.append({"date": d, **row, "balance": round(balance, 2)})
    statement.reverse()

    # ---- collections (newest first) ----
    collections = [{
        "id": p.id, "date": ist_date(p.payment_date), "invoice_id": p.invoice_id,
        "invoice_number": by_id[p.invoice_id].invoice_number if p.invoice_id in by_id else None,
        "amount": p.amount, "mode": p.mode, "reference": p.transaction_reference,
        "collected_by": people.get(p.collected_by), "recorded_by": people.get(p.recorded_by or p.collected_by),
        "reversal": bool(p.reversal_of_id or (p.amount or 0) < 0), "reason": p.reason,
    } for p in reversed(payments)]

    # ---- activity (newest first) ----
    # Bills by their bill date (no time: imports add many at once); payments
    # and changes by when they happened, in India time.
    def when(value):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(IST).replace(tzinfo=None)

    activity = []
    for i in invoices:
        if i.invoice_date:
            activity.append({"at": datetime.combine(i.invoice_date, dtime(23, 59, 59)), "timed": False, "kind": "bill",
                             "text": f"Billed {i.invoice_number}", "amount": i.total_amount, "by": None})
    for p in payments:
        inv = by_id.get(p.invoice_id)
        rev = bool(p.reversal_of_id or (p.amount or 0) < 0)
        activity.append({
            "at": when(p.payment_date), "timed": True, "kind": "reversal" if rev else "payment",
            "text": (f"Payment reversed on {inv.invoice_number}" if rev else f"Collected on {inv.invoice_number}") if inv else ("Payment reversed" if rev else "Collected"),
            "amount": abs(p.amount or 0), "by": people.get(p.recorded_by or p.collected_by),
            "note": p.reason if rev else (p.mode or None),
        })
    audit = (
        db.query(models.AuditLog, models.User.name)
        .outerjoin(models.User, models.User.id == models.AuditLog.user_id)
        .filter(models.AuditLog.action.in_(CUSTOMER_ACTIONS))
        .order_by(models.AuditLog.id.desc())
        .limit(5000)
        .all()
    )
    ids = set(by_id)
    for row, who in audit:
        if _about(row, customer, ids):
            activity.append({"at": when(row.timestamp), "timed": True, "kind": "change",
                             "text": AUDIT_TEXT.get(row.action, row.action), "amount": None, "by": who})
    activity = [a for a in activity if a["at"]]
    activity.sort(key=lambda a: a["at"], reverse=True)
    for a in activity:
        a["day"] = a["at"].date()
        a["time"] = a["at"].strftime("%I:%M %p").lstrip("0").lower() if a["timed"] else None
        a["at"] = a["at"].isoformat()

    result = {
        "customer": {
            "id": customer.id, "name": customer.name, "type": customer.type, "phone": customer.phone,
            "alternate_phone": customer.alternate_phone, "whatsapp_on": customer.whatsapp_on,
            "area": customer.area, "address": customer.address, "gstin": customer.gstin,
            "mr_id": customer.mr_id, "mr_name": customer.mr.name if customer.mr else None,
        },
        "summary": summary,
        "monthly": monthly,
        "statement": statement[:STATEMENT_MAX],
        "statement_count": len(statement),
        "collections": collections[:STATEMENT_MAX],
        "activity": activity[:ACTIVITY_MAX],
    }
    if is_admin:
        rows = (
            db.query(models.CustomerScheme, models.MarginProduct, models.MarginScheme)
            .join(models.MarginProduct, models.MarginProduct.id == models.CustomerScheme.product_id)
            .join(models.MarginScheme, models.MarginScheme.id == models.CustomerScheme.scheme_id)
            .filter(models.CustomerScheme.customer_id == customer.id)
            .order_by(models.MarginProduct.id)
            .all()
        )
        result["schemes"] = [{
            "product_id": prod.id, "product": prod.name, "mrp": prod.mrp,
            "scheme": sch.name, "sell_at": sch.sell_at, "discount": sch.discount, "buy": sch.buy, "free": sch.free,
        } for _, prod, sch in rows]
    return result
