import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..ai.extractor import extract_invoice_from_image
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..utils import compute_status

router = APIRouter(prefix="/invoices", tags=["invoices"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _to_out(invoice: models.Invoice) -> schemas.InvoiceOut:
    out = schemas.InvoiceOut.model_validate(invoice)
    out.mr_name = invoice.mr.name if invoice.mr else None
    out.customer_name = invoice.customer.name if invoice.customer else None
    return out


@router.post("/extract", response_model=schemas.ExtractResult)
async def extract_invoice(
    file: UploadFile = File(...), user: models.User = Depends(get_current_user)
):
    """MR uploads a photo of the invoice; this runs AI extraction and returns
    a draft for the MR to review. Nothing is saved to the invoices table yet."""
    content = await file.read()
    filename = f"{uuid.uuid4().hex}_{file.filename or 'invoice.jpg'}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)

    result = await extract_invoice_from_image(content, file.content_type or "image/jpeg")
    result["image_path"] = path
    return result


@router.post("", response_model=schemas.InvoiceOut)
def create_invoice(
    payload: schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Confirm & save a reviewed invoice. Looks up (or creates) the customer
    by name, computes status/pending from total vs paid, and records the
    initial payment if any amount was already paid."""
    customer = (
        db.query(models.Customer)
        .filter(models.Customer.name.ilike(payload.customer_name.strip()))
        .first()
    )
    if not customer:
        customer = models.Customer(
            name=payload.customer_name.strip(), type=payload.customer_type
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)

    status_, pending = compute_status(payload.total_amount, payload.paid_amount)

    invoice = models.Invoice(
        invoice_number=payload.invoice_number,
        invoice_date=payload.invoice_date,
        customer_id=customer.id,
        mr_id=user.id,
        total_amount=payload.total_amount,
        paid_amount=payload.paid_amount,
        pending_amount=pending,
        status=status_,
        payment_mode=payload.payment_mode,
        remarks=payload.remarks,
        image_path=payload.image_path,
        ai_confidence=payload.ai_confidence,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    for item in payload.items or []:
        db.add(models.InvoiceItem(invoice_id=invoice.id, **item.model_dump()))

    if payload.paid_amount and payload.paid_amount > 0:
        db.add(
            models.Payment(
                invoice_id=invoice.id,
                amount=payload.paid_amount,
                mode=payload.payment_mode,
                collected_by=user.id,
            )
        )
    db.commit()
    db.refresh(invoice)

    return _to_out(invoice)


@router.get("/mine", response_model=List[schemas.InvoiceOut])
def my_invoices(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.mr_id == user.id)
        .order_by(models.Invoice.created_at.desc())
        .all()
    )
    return [_to_out(i) for i in invoices]


@router.get("", response_model=List[schemas.InvoiceOut])
def list_invoices(
    mr_id: Optional[int] = None,
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    q = db.query(models.Invoice)
    if mr_id:
        q = q.filter(models.Invoice.mr_id == mr_id)
    if status:
        q = q.filter(models.Invoice.status == status.upper())
    if customer_id:
        q = q.filter(models.Invoice.customer_id == customer_id)
    invoices = q.order_by(models.Invoice.created_at.desc()).all()
    return [_to_out(i) for i in invoices]


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
        raise HTTPException(403, "You can only view your own invoices")
    return _to_out(invoice)
