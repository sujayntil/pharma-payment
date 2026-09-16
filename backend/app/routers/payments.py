from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..utils import compute_status

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("")
def add_payment(
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    invoice = (
        db.query(models.Invoice).filter(models.Invoice.id == payload.invoice_id).first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
        raise HTTPException(403, "You can only update payments on your own invoices")
    if payload.amount <= 0:
        raise HTTPException(400, "Payment amount must be greater than zero")
    if payload.amount > invoice.pending_amount + 0.01:
        raise HTTPException(
            400,
            f"Payment (₹{payload.amount}) exceeds the outstanding balance (₹{invoice.pending_amount})",
        )

    db.add(
        models.Payment(
            invoice_id=invoice.id,
            amount=payload.amount,
            mode=payload.mode,
            transaction_reference=payload.transaction_reference,
            collected_by=user.id,
        )
    )

    invoice.paid_amount = (invoice.paid_amount or 0) + payload.amount
    status_, pending = compute_status(invoice.total_amount, invoice.paid_amount)
    invoice.status = status_
    invoice.pending_amount = pending

    db.commit()
    db.refresh(invoice)

    return {
        "invoice_id": invoice.id,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
        "status": invoice.status,
    }
