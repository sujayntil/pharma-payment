"""Audit trail helper: who changed or deleted what, and what it looked like.

Rows go to the existing ``audit_log`` table (action, user_id, timestamp,
old_value, new_value). Nothing here changes what an action does; it only
records it in the same transaction, so a change and its audit row are saved
(or rolled back) together.
"""

from datetime import date, datetime

from sqlalchemy.orm import Session

from . import models


def _plain(value):
    """JSON-safe copy (dates and datetimes become ISO text)."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_plain(item) for item in value]
    return value


def write_audit(db: Session, action: str, user: models.User | None, old=None, new=None) -> None:
    db.add(models.AuditLog(
        action=action,
        user_id=user.id if user else None,
        old_value=_plain(old) if old is not None else None,
        new_value=_plain(new) if new is not None else None,
    ))


def invoice_snapshot(invoice: models.Invoice, with_payments: bool = False) -> dict:
    data = {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date,
        "customer_id": invoice.customer_id,
        "customer_name": invoice.customer.name if invoice.customer else None,
        "mr_id": invoice.mr_id,
        "total_amount": invoice.total_amount,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
        "status": invoice.status,
        "payment_mode": invoice.payment_mode,
        "remarks": invoice.remarks,
    }
    if with_payments:
        # Kept in full so a deleted invoice's money history is never lost.
        data["payments"] = [
            {
                "payment_id": payment.id,
                "amount": payment.amount,
                "mode": payment.mode,
                "transaction_reference": payment.transaction_reference,
                "payment_date": payment.payment_date,
                "collected_by": payment.collected_by,
                "recorded_by": payment.recorded_by,
                "reversal_of_id": payment.reversal_of_id,
                "reason": payment.reason,
            }
            for payment in sorted(invoice.payments, key=lambda p: p.id)
        ]
    return data


def customer_snapshot(customer: models.Customer) -> dict:
    return {
        "customer_id": customer.id,
        "name": customer.name,
        "type": customer.type,
        "phone": customer.phone,
        "address": customer.address,
        "gstin": customer.gstin,
        "mr_id": customer.mr_id,
    }


def user_snapshot(user: models.User) -> dict:
    """Never includes the password or its hash."""
    return {
        "user_id": user.id,
        "name": user.name,
        "employee_code": user.employee_code,
        "role": user.role,
        "phone": user.phone,
    }
