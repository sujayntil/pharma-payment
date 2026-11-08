"""One builder for the invoice history timeline (GET /invoices/{id}/history).

The payments ledger is the source of truth for collections and reversals;
the invoice_events log adds the "created" event and anything that has no
ledger row. Invoices created before the log existed get a synthesized
"created" event, so old records still show a complete timeline.
"""

from datetime import datetime, time

from sqlalchemy.orm import Session

from . import models
from .collection_info import RECORDER_ID, as_utc, linked_reversal_totals, reversal_fields


def _actor(user: models.User | None) -> dict | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "role": user.role}


def _status_for(total: float, paid: float) -> str:
    pending = round((total or 0) - (paid or 0), 2)
    if pending <= 0:
        return models.StatusEnum.PAID.value
    if (paid or 0) <= 0:
        return models.StatusEnum.UNPAID.value
    return models.StatusEnum.PARTIAL.value


def build_invoice_history(db: Session, invoice: models.Invoice) -> dict:
    payments = (
        db.query(models.Payment, models.User)
        .outerjoin(models.User, models.User.id == RECORDER_ID)
        .filter(models.Payment.invoice_id == invoice.id)
        .order_by(models.Payment.payment_date.asc(), models.Payment.id.asc())
        .all()
    )
    logged = (
        db.query(models.InvoiceEvent, models.User)
        .outerjoin(models.User, models.User.id == models.InvoiceEvent.actor_id)
        .filter(models.InvoiceEvent.invoice_id == invoice.id)
        .order_by(models.InvoiceEvent.created_at.asc(), models.InvoiceEvent.id.asc())
        .all()
    )
    payment_ids = {payment.id for payment, _ in payments}
    reversed_totals = linked_reversal_totals(db, payment_ids)

    created_event = next(
        ((event, user) for event, user in logged if event.event_type == models.InvoiceEventType.CREATED.value),
        None,
    )
    created_at = invoice.created_at
    if created_at is None and invoice.invoice_date:
        created_at = datetime.combine(invoice.invoice_date, time.min)

    events = [{
        "id": f"created-{invoice.id}",
        "type": models.InvoiceEventType.CREATED.value,
        "at": as_utc(created_event[0].created_at if created_event else created_at),
        "invoice_date": invoice.invoice_date,
        "amount": invoice.total_amount,
        "mode": None,
        "reference": None,
        "reason": None,
        "actor": _actor(created_event[1]) if created_event else None,
        "payment_id": None,
        "reversal_of_id": None,
        "kind": None,
        "after_reversal": False,
        "status_after": models.StatusEnum.UNPAID.value if (invoice.total_amount or 0) > 0 else models.StatusEnum.PAID.value,
    }]

    running = 0.0
    seen_reversal = False
    for payment, recorder in payments:
        amount = payment.amount or 0
        is_reversal = amount < 0
        pending_before = round((invoice.total_amount or 0) - running, 2)
        running = round(running + amount, 2)
        if is_reversal:
            seen_reversal = True
        events.append({
            "id": f"payment-{payment.id}",
            "type": models.InvoiceEventType.REVERSED.value if is_reversal else models.InvoiceEventType.COLLECTED.value,
            "at": as_utc(payment.payment_date),
            "invoice_date": None,
            "amount": abs(amount),
            "mode": payment.mode,
            "reference": payment.transaction_reference,
            "reason": payment.reason,
            "actor": _actor(recorder),
            "payment_id": payment.id,
            "reversal_of_id": payment.reversal_of_id,
            "kind": None if is_reversal else ("full" if amount >= pending_before - 0.01 else "partial"),
            "after_reversal": (not is_reversal) and seen_reversal,
            "status_after": _status_for(invoice.total_amount, running),
            **reversal_fields(payment, reversed_totals),
        })

    # Logged events with no ledger row behind them (other than "created").
    for event, user in logged:
        if event.event_type == models.InvoiceEventType.CREATED.value:
            continue
        if event.payment_id is not None and event.payment_id in payment_ids:
            continue
        if event.payment_id is not None:
            continue  # its ledger row no longer exists
        events.append({
            "id": f"event-{event.id}",
            "type": event.event_type,
            "at": as_utc(event.created_at),
            "invoice_date": None,
            "amount": abs(event.amount) if event.amount is not None else None,
            "mode": event.mode,
            "reference": event.reference,
            "reason": event.reason,
            "actor": _actor(user),
            "payment_id": None,
            "reversal_of_id": None,
            "kind": None,
            "after_reversal": False,
            "status_after": None,
        })

    created, rest = events[0], events[1:]
    # Stable sort: ledger rows keep their id order when timestamps tie.
    rest.sort(key=lambda e: (e["at"] is None, e["at"].timestamp() if e["at"] else 0))
    last_payment = payments[-1][0] if payments else None

    return {
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date,
            "created_at": as_utc(invoice.created_at),
            "customer_id": invoice.customer_id,
            "customer_name": invoice.customer.name if invoice.customer else None,
            "mr_name": invoice.mr.name if invoice.mr else None,
            "payment_mode": invoice.payment_mode,
            "remarks": invoice.remarks,
            "total_amount": invoice.total_amount,
            "paid_amount": invoice.paid_amount,
            "pending_amount": invoice.pending_amount,
            "status": invoice.status,
            "is_reversed": bool(last_payment is not None and (last_payment.amount or 0) < 0),
        },
        "events": [created, *rest],
    }
