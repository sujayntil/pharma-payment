"""Helpers that describe *who* touched an invoice's collections.

Every collection change -- MR payment, Admin payment, Admin "mark unpaid"
reversal -- is a row in the ``payments`` ledger, so the ledger is the single
source of truth for collection totals and for showing an MR that an Admin
updated one of their invoices.
"""

from datetime import timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .utils import compute_status

REVERSAL_MODE = "Reversal"

# Who entered a ledger row. Older rows have no recorded_by, so the MR they
# were collected under is treated as the recorder (they display as before).
RECORDER_ID = func.coalesce(models.Payment.recorded_by, models.Payment.collected_by)


def as_utc(value):
    """Payment timestamps are stored naive (UTC); tag them so the browser
    renders them in local time correctly."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def payment_row(payment: models.Payment, collector: models.User | None) -> dict:
    """``collector`` is the user who recorded the row (see RECORDER_ID)."""
    is_admin = bool(collector and collector.role == models.RoleEnum.ADMIN.value)
    return {
        "payment_id": payment.id,
        "invoice_id": payment.invoice_id,
        "amount": payment.amount,
        "mode": payment.mode,
        "transaction_reference": payment.transaction_reference,
        "payment_date": as_utc(payment.payment_date),
        "recorded_by": collector.name if collector else None,
        "recorded_by_id": collector.id if collector else None,
        "recorded_by_role": collector.role if collector else None,
        "recorded_by_admin": is_admin,
        "collected_by_id": payment.collected_by,
        "reversal_of_id": payment.reversal_of_id,
        "reason": payment.reason,
        "is_reversal": (payment.amount or 0) < 0,
    }


def latest_collections(db: Session, invoice_ids) -> dict[int, dict]:
    """Return the most recent ledger entry per invoice in one query."""
    ids = [i for i in set(invoice_ids) if i is not None]
    if not ids:
        return {}
    latest_ids = (
        db.query(func.max(models.Payment.id))
        .filter(models.Payment.invoice_id.in_(ids))
        .group_by(models.Payment.invoice_id)
        .subquery()
    )
    rows = (
        db.query(models.Payment, models.User)
        .outerjoin(models.User, models.User.id == RECORDER_ID)
        .filter(models.Payment.id.in_(latest_ids.select()))
        .all()
    )
    return {payment.invoice_id: payment_row(payment, user) for payment, user in rows}


def last_collection_fields(latest: dict | None) -> dict:
    """Flattened fields added to invoice-shaped API responses."""
    if not latest:
        return {
            "last_collection_by": None,
            "last_collection_by_id": None,
            "last_collection_by_role": None,
            "last_collection_by_admin": False,
            "last_collection_at": None,
            "last_collection_amount": None,
            "last_collection_is_reversal": False,
        }
    return {
        "last_collection_by": latest["recorded_by"],
        "last_collection_by_id": latest["recorded_by_id"],
        "last_collection_by_role": latest["recorded_by_role"],
        "last_collection_by_admin": latest["recorded_by_admin"],
        "last_collection_at": latest["payment_date"],
        "last_collection_amount": latest["amount"],
        "last_collection_is_reversal": latest["is_reversal"],
    }


def net_collected(db: Session, invoice_id: int) -> float:
    return float(
        db.query(func.coalesce(func.sum(models.Payment.amount), 0))
        .filter(models.Payment.invoice_id == invoice_id)
        .scalar()
        or 0
    )


def reversed_invoice_ids():
    """Invoices whose most recent ledger entry is a reversal ("Reversed")."""
    latest_ids = select(func.max(models.Payment.id)).group_by(models.Payment.invoice_id)
    return select(models.Payment.invoice_id).where(
        models.Payment.id.in_(latest_ids), models.Payment.amount < 0
    )


# ---- One place for balance changes -----------------------------------------


def apply_ledger_delta(invoice: models.Invoice, delta: float) -> None:
    """Move an invoice's paid/pending/status by a ledger amount (+ collection,
    - reversal). Every collection or reversal goes through here so balances,
    MR totals and dashboards all read the same numbers."""
    paid = round((invoice.paid_amount or 0) + delta, 2)
    invoice.paid_amount = max(paid, 0.0)
    invoice.status, invoice.pending_amount = compute_status(invoice.total_amount, invoice.paid_amount)


def credited_mr_id(invoice: models.Invoice, user: models.User) -> int:
    """The MR a new collection is saved under. An Admin collecting for a
    customer with an assigned MR credits that MR; otherwise (MR, or no
    assigned MR) it stays with the user, exactly as before."""
    if user.role == models.RoleEnum.ADMIN.value:
        customer = invoice.customer
        if customer is not None and customer.mr_id:
            return customer.mr_id
    return user.id


def log_event(
    db: Session,
    invoice_id: int,
    event_type: str,
    actor: models.User | None,
    payment: models.Payment | None = None,
    amount: float | None = None,
    mode: str | None = None,
    reference: str | None = None,
    reason: str | None = None,
) -> models.InvoiceEvent:
    event = models.InvoiceEvent(
        invoice_id=invoice_id,
        event_type=event_type,
        payment_id=payment.id if payment is not None else None,
        amount=amount if amount is not None else (payment.amount if payment is not None else None),
        mode=mode if mode is not None else (payment.mode if payment is not None else None),
        reference=reference if reference is not None else (payment.transaction_reference if payment is not None else None),
        reason=reason if reason is not None else (payment.reason if payment is not None else None),
        actor_id=actor.id if actor else None,
        actor_role=actor.role if actor else None,
    )
    db.add(event)
    return event


def linked_reversal_totals(db: Session, payment_ids) -> dict[int, float]:
    """Amount already reversed (positive number) per original payment id."""
    ids = [i for i in set(payment_ids) if i is not None]
    if not ids:
        return {}
    rows = (
        db.query(models.Payment.reversal_of_id, func.coalesce(func.sum(models.Payment.amount), 0))
        .filter(models.Payment.reversal_of_id.in_(ids))
        .group_by(models.Payment.reversal_of_id)
        .all()
    )
    return {payment_id: round(-float(total or 0), 2) for payment_id, total in rows}


def reversal_fields(payment: models.Payment, reversed_totals: dict[int, float]) -> dict:
    """Added to collection rows so the UI can show "Reversed" and hide the
    reverse action once nothing is left to reverse on that entry."""
    amount = payment.amount or 0
    if amount <= 0:
        return {"reversed_amount": 0.0, "fully_reversed": False}
    reversed_amount = reversed_totals.get(payment.id, 0.0)
    return {"reversed_amount": reversed_amount, "fully_reversed": reversed_amount >= amount - 0.01}


def reversible_amount(db: Session, payment: models.Payment) -> float:
    """What is still left to reverse on one collection: its amount minus
    reversals already linked to it, capped by what the invoice actually holds
    in the ledger (so a reversal never exceeds the amount collected)."""
    if (payment.amount or 0) <= 0:
        return 0.0
    linked = float(
        db.query(func.coalesce(func.sum(models.Payment.amount), 0))
        .filter(models.Payment.reversal_of_id == payment.id)
        .scalar()
        or 0
    )
    remaining = round(payment.amount + linked, 2)
    return max(min(remaining, round(net_collected(db, payment.invoice_id), 2)), 0.0)
