import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..audit import write_audit
from ..collection_info import apply_ledger_delta, as_utc, credited_mr_id, log_event
from ..database import get_db
from ..month_clear import finished_month_keys, months_cleared, reopen_months
from ..deps import get_current_user
from ..push import send_batch_notification, send_month_cleared_notification, send_office_payment_notification, send_payment_notification

router = APIRouter(prefix="/payments", tags=["payments"])

# How long the person who saved a collection can still undo it themselves:
# only from the Undo bar shown right after saving (15 s, after the MR's 3 s
# celebration), plus a margin for a slow connection. Later corrections are
# Admin reversals with a reason.
UNDO_WINDOW = timedelta(seconds=30)


def _record(db: Session, invoice: models.Invoice, amount: float, mode, reference, user, batch_id=None) -> models.Payment:
    """Saves one collection on one invoice (ledger, event, latest mode)."""
    payment = models.Payment(
        invoice_id=invoice.id,
        amount=amount,
        mode=mode,
        transaction_reference=reference,
        # Saved under the customer's assigned MR when an Admin records it, so
        # it counts in that MR's totals; recorded_by keeps who entered it.
        collected_by=credited_mr_id(invoice, user),
        recorded_by=user.id,
        batch_id=batch_id,
    )
    db.add(payment)
    db.flush()
    apply_ledger_delta(invoice, amount)
    if mode:
        # The invoice keeps the most recent payment's mode.
        invoice.payment_mode = mode
    log_event(db, invoice.id, models.InvoiceEventType.COLLECTED.value, user, payment=payment)
    return payment


@router.post("")
def add_payment(
    payload: schemas.PaymentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # Locks this invoice until the save finishes: a second collection on the
    # same invoice at the same moment waits, then sees the new balance.
    invoice = (
        db.query(models.Invoice).filter(models.Invoice.id == payload.invoice_id).with_for_update().first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
        raise HTTPException(403, "You can only update payments on your own invoices")
    if payload.amount <= 0:
        raise HTTPException(400, "Payment amount must be greater than zero")
    if (invoice.pending_amount or 0) <= 0:
        raise HTTPException(400, "This invoice is already fully paid")
    if payload.amount > invoice.pending_amount + 0.01:
        raise HTTPException(
            400,
            f"Payment (₹{payload.amount}) exceeds the outstanding balance (₹{invoice.pending_amount})",
        )

    payment = _record(db, invoice, payload.amount, payload.mode, payload.transaction_reference, user)
    cleared_months = months_cleared(db, user, [invoice])
    db.commit()
    db.refresh(invoice)
    if user.role == models.RoleEnum.MR.value:
        background_tasks.add_task(send_payment_notification, payment.id)
        _alert_months(background_tasks, user, [invoice])
    else:
        background_tasks.add_task(send_office_payment_notification, [payment.id])

    return {
        "invoice_id": invoice.id,
        "payment_id": payment.id,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
        "status": invoice.status,
        "months_cleared": cleared_months,
    }


def _batch_payments(db: Session, batch_id: str):
    return db.query(models.Payment).filter(models.Payment.batch_id == batch_id).all()


def _alert_months(background_tasks: BackgroundTasks, user: models.User, invoices) -> None:
    """Queue the Admin alert check for the finished months these MR collections touched."""
    keys = finished_month_keys([invoice for invoice in invoices if invoice.mr_id == user.id and (invoice.pending_amount or 0) <= 0.004])
    if keys:
        background_tasks.add_task(send_month_cleared_notification, user.id, keys)


def _apply_batch(db: Session, payload: schemas.PaymentBatchCreate, user: models.User):
    """One customer's part: checks, then records oldest first. No commit."""
    customer = db.get(models.Customer, payload.customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    is_mr = user.role == models.RoleEnum.MR.value
    if is_mr and customer.mr_id != user.id:
        raise HTTPException(404, "Customer not found")

    ids = list(dict.fromkeys(payload.invoice_ids))
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.id.in_(ids), models.Invoice.customer_id == customer.id)
        .order_by(models.Invoice.invoice_date.is_(None), models.Invoice.invoice_date.asc(), models.Invoice.id.asc())
        .with_for_update()  # same lock as a single collection (always taken in this order)
        .all()
    )
    if len(invoices) != len(ids):
        raise HTTPException(400, "Some of the selected invoices don't belong to this customer.")
    if is_mr and any(invoice.mr_id != user.id for invoice in invoices):
        raise HTTPException(403, "You can only collect on your own invoices")
    if any((invoice.pending_amount or 0) <= 0 for invoice in invoices):
        raise HTTPException(400, "One of the selected invoices is already fully paid. Refresh and try again.")
    selected_pending = round(sum(invoice.pending_amount for invoice in invoices), 2)
    if payload.amount > selected_pending + 0.01:
        raise HTTPException(400, f"₹{payload.amount:,.0f} is more than {customer.name}'s selected invoices (₹{selected_pending:,.0f}).")

    if payload.first_invoice_id is not None:
        invoices.sort(key=lambda invoice: invoice.id != payload.first_invoice_id)  # stable: rest stay oldest first
    batch_id = str(uuid.uuid4())
    remaining = round(payload.amount, 2)
    parts = []
    for invoice in invoices:
        if remaining <= 0.004:
            break
        take = round(min(remaining, invoice.pending_amount), 2)
        payment = _record(db, invoice, take, payload.mode, payload.transaction_reference, user, batch_id)
        remaining = round(remaining - take, 2)
        parts.append((invoice, take, payment))
    return batch_id, parts, invoices


def _batch_result(db: Session, payload, batch_id, parts, invoices):
    items = []
    for invoice, take, payment in parts:
        db.refresh(invoice)
        items.append({
            "payment_id": payment.id,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": take,
            "pending_amount": invoice.pending_amount,
            "status": invoice.status,
        })
    return {
        "batch_id": batch_id,
        "customer_id": payload.customer_id,
        "amount": round(payload.amount, 2),
        "items": items,
        "cleared": sum(1 for item in items if (item["pending_amount"] or 0) <= 0),
        "left": round(sum(invoice.pending_amount for invoice in invoices), 2),
    }


@router.post("/batch")
def add_batch_payment(
    payload: schemas.PaymentBatchCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Collect from customer: one amount over the ticked invoices, oldest
    first. All-or-nothing: either every part is saved or none is."""
    batch_id, parts, invoices = _apply_batch(db, payload, user)
    cleared_months = months_cleared(db, user, invoices)
    db.commit()
    if user.role == models.RoleEnum.MR.value:
        background_tasks.add_task(send_batch_notification, batch_id)
        _alert_months(background_tasks, user, invoices)
    else:
        background_tasks.add_task(send_office_payment_notification, [part.id for part in _batch_payments(db, batch_id)])
    return {**_batch_result(db, payload, batch_id, parts, invoices), "months_cleared": cleared_months}


@router.post("/batches")
def add_batch_payments(
    payload: schemas.PaymentBatchesCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Several customers in one go (invoices ticked across the Invoices tab):
    one part per customer, each with its own amount and mode. All-or-nothing
    across every customer."""
    customer_ids = [group.customer_id for group in payload.groups]
    if len(set(customer_ids)) != len(customer_ids):
        raise HTTPException(400, "Each customer can appear only once.")
    done = []
    try:
        for group in payload.groups:
            done.append((group, *_apply_batch(db, group, user)))
        cleared_months = months_cleared(db, user, [invoice for *_, invoices in done for invoice in invoices])
        db.commit()
    except Exception:
        db.rollback()
        raise
    if user.role == models.RoleEnum.MR.value:
        for _, batch_id, _, _ in done:
            background_tasks.add_task(send_batch_notification, batch_id)
        _alert_months(background_tasks, user, [invoice for *_, invoices in done for invoice in invoices])
    else:
        ids = [part.id for _, batch_id, _, _ in done for part in _batch_payments(db, batch_id)]
        background_tasks.add_task(send_office_payment_notification, ids)
    results = [_batch_result(db, group, batch_id, parts, invoices) for group, batch_id, parts, invoices in done]
    return {"results": results, "amount": round(sum(group.amount for group in payload.groups), 2), "months_cleared": cleared_months}


@router.post("/{payment_id}/undo")
def undo_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The person who saved a collection removes it straight away from the
    Undo bar (a mistyped amount, wrong invoice). A collection split over
    several invoices is undone together. The invoice history keeps the
    collection (marked undone) plus an "Undone" line, and the audit log
    keeps the details; after the bar is gone only an Admin reversal can
    correct it."""
    payment = db.get(models.Payment, payment_id)
    if not payment or (payment.amount or 0) <= 0 or payment.reversal_of_id is not None:
        raise HTTPException(404, "Collection not found")
    if (payment.recorded_by or payment.collected_by) != user.id:
        raise HTTPException(403, "Only the person who saved this collection can undo it.")
    group = (
        db.query(models.Payment).filter(models.Payment.batch_id == payment.batch_id).all()
        if payment.batch_id else [payment]
    )
    now = datetime.now(timezone.utc)
    if any(now - as_utc(item.payment_date) > UNDO_WINDOW for item in group):
        raise HTTPException(409, "Too late to undo. Ask an Admin to reverse it.")
    group_ids = [item.id for item in group]
    if db.query(models.Payment.id).filter(models.Payment.reversal_of_id.in_(group_ids)).first():
        raise HTTPException(409, "This collection has already been reversed.")

    undone = []
    touched = []
    for item in group:
        invoice = db.get(models.Invoice, item.invoice_id, with_for_update=True)
        touched.append(invoice)
        undone.append({"payment_id": item.id, "invoice_id": invoice.id, "invoice_number": invoice.invoice_number,
                       "amount": item.amount, "mode": item.mode, "reference": item.transaction_reference})
        apply_ledger_delta(invoice, -(item.amount or 0))
        # Keep the story in the invoice history: the collection stays, marked
        # undone, and an "Undone" line is added. Neither counts in balances.
        db.query(models.InvoiceEvent).filter(
            models.InvoiceEvent.payment_id == item.id,
            models.InvoiceEvent.event_type == models.InvoiceEventType.COLLECTED.value,
        ).update({"event_type": models.InvoiceEventType.COLLECTED_UNDONE.value, "payment_id": None}, synchronize_session=False)
        db.query(models.InvoiceEvent).filter(models.InvoiceEvent.payment_id == item.id).update({"payment_id": None}, synchronize_session=False)
        log_event(db, invoice.id, models.InvoiceEventType.UNDONE.value, user, amount=item.amount, mode=item.mode, reference=item.transaction_reference)
        db.delete(item)
        db.flush()
        latest = (
            db.query(models.Payment.mode)
            .filter(models.Payment.invoice_id == invoice.id, models.Payment.amount > 0, models.Payment.mode.isnot(None))
            .order_by(models.Payment.payment_date.desc(), models.Payment.id.desc())
            .first()
        )
        invoice.payment_mode = latest[0] if latest else None
    reopen_months(db, touched)
    write_audit(db, "payment_undone", user, old={"batch_id": payment.batch_id, "payments": undone})
    db.commit()
    return {"undone": len(undone), "items": [{k: v for k, v in item.items() if k in ("invoice_id", "invoice_number", "amount")} for item in undone]}


@router.get("/pending-invoices")
def pending_invoices(
    customer_id: int | None = None,
    invoice_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """A customer's pending invoices, oldest first, for the Collect sheet.
    Give customer_id (Bulk collect) or invoice_id (Collect on one invoice:
    its customer is looked up, and the invoice is returned as "selected")."""
    is_mr = user.role == models.RoleEnum.MR.value
    selected = None
    if invoice_id is not None:
        invoice = db.get(models.Invoice, invoice_id)
        if not invoice or (is_mr and invoice.mr_id != user.id):
            raise HTTPException(404, "Invoice not found")
        selected = invoice.id
        customer = invoice.customer
        if customer is None:
            # No customer on this invoice: collect on it alone.
            return {"customer": None, "selected_invoice_id": selected, "items": [_pending_item(invoice)] if (invoice.pending_amount or 0) > 0 else []}
    elif customer_id is not None:
        customer = db.get(models.Customer, customer_id)
        if not customer or (is_mr and customer.mr_id != user.id):
            raise HTTPException(404, "Customer not found")
    else:
        raise HTTPException(422, "Give customer_id or invoice_id")
    query = db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id, models.Invoice.pending_amount > 0)
    if is_mr:
        query = query.filter(models.Invoice.mr_id == user.id)
    rows = query.order_by(models.Invoice.invoice_date.is_(None), models.Invoice.invoice_date.asc(), models.Invoice.id.asc()).all()
    return {
        "customer": {"id": customer.id, "name": customer.name},
        "selected_invoice_id": selected,
        "items": [_pending_item(invoice) for invoice in rows],
    }


def _pending_item(invoice: models.Invoice) -> dict:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date,
        "total_amount": invoice.total_amount,
        "pending_amount": invoice.pending_amount,
        "status": invoice.status,
    }
