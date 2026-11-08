import os
import uuid
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..collection_info import RECORDER_ID, last_collection_fields, latest_collections, payment_row, reversed_invoice_ids
from ..ai.extractor import extract_invoice_from_image  # noqa: F401  (used by the disabled extract route)
from ..invoice_history import build_invoice_history
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..utils import INVOICE_STATUSES, clean_search, clean_status, compute_status, page_result, query_page

router = APIRouter(prefix="/invoices", tags=["invoices"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _to_out(invoice: models.Invoice, latest: dict | None = None) -> schemas.InvoiceOut:
    out = schemas.InvoiceOut.model_validate(invoice)
    out.mr_name = invoice.mr.name if invoice.mr else None
    out.customer_name = invoice.customer.name if invoice.customer else None
    for key, value in last_collection_fields(latest).items():
        setattr(out, key, value)
    return out


def _to_out_many(db: Session, invoices) -> list[schemas.InvoiceOut]:
    latest = latest_collections(db, [invoice.id for invoice in invoices])
    return [_to_out(invoice, latest.get(invoice.id)) for invoice in invoices]


# Disabled: "Add Invoice" (MR upload/extract + save) is removed everywhere.
# Re-enable if needed: uncomment both routes below and the "Upload Invoice"
# tab/button in vite-project/src/pages/mr/MrLayout.jsx and MrDashboard.jsx.
# @router.post("/extract", response_model=schemas.ExtractResult)
# async def extract_invoice(
#     file: UploadFile = File(...), user: models.User = Depends(get_current_user)
# ):
#     """MR uploads a photo of the invoice; this runs AI extraction and returns
#     a draft for the MR to review. Nothing is saved to the invoices table yet."""
#     content = await file.read()
#     filename = f"{uuid.uuid4().hex}_{file.filename or 'invoice.jpg'}"
#     path = os.path.join(UPLOAD_DIR, filename)
#     with open(path, "wb") as f:
#         f.write(content)
#
#     result = await extract_invoice_from_image(content, file.content_type or "image/jpeg")
#     result["image_path"] = path
#     return result
#
#
# @router.post("", response_model=schemas.InvoiceOut)
# def create_invoice(
#     payload: schemas.InvoiceCreate,
#     db: Session = Depends(get_db),
#     user: models.User = Depends(get_current_user),
# ):
#     """Confirm & save a reviewed invoice. Looks up (or creates) the customer
#     by name, computes status/pending from total vs paid, and records the
#     initial payment if any amount was already paid."""
#     existing = (
#         db.query(models.Invoice)
#         .filter(models.Invoice.invoice_number.ilike(payload.invoice_number.strip()))
#         .first()
#     )
#     if existing:
#         if existing.external_key:
#             raise HTTPException(
#                 409,
#                 f"Invoice number '{payload.invoice_number}' is already present from the Tally import. "
#                 "Record collections against that invoice instead of entering it again.",
#             )
#         if not payload.confirm_duplicate:
#             other_mr = existing.mr.name if existing.mr else "someone"
#             other_customer = existing.customer.name if existing.customer else "a customer"
#             raise HTTPException(
#                 409,
#                 f"Invoice number '{payload.invoice_number}' was already entered by "
#                 f"{other_mr} for {other_customer} (₹{existing.total_amount}). "
#                 "Submit again to confirm this is intentional (e.g. a legitimately reused "
#                 "number), or change the invoice number if it was a mistake.",
#             )
#
#     customer = (
#         db.query(models.Customer)
#         .filter(models.Customer.name.ilike(payload.customer_name.strip()))
#         .first()
#     )
#     if not customer:
#         customer = models.Customer(
#             name=payload.customer_name.strip(), type=payload.customer_type
#         )
#         db.add(customer)
#         db.commit()
#         db.refresh(customer)
#
#     status_, pending = compute_status(payload.total_amount, payload.paid_amount)
#
#     invoice = models.Invoice(
#         invoice_number=payload.invoice_number,
#         invoice_date=payload.invoice_date,
#         customer_id=customer.id,
#         mr_id=user.id,
#         total_amount=payload.total_amount,
#         paid_amount=payload.paid_amount,
#         pending_amount=pending,
#         status=status_,
#         payment_mode=payload.payment_mode,
#         remarks=payload.remarks,
#         image_path=payload.image_path,
#         ai_confidence=payload.ai_confidence,
#     )
#     db.add(invoice)
#     db.commit()
#     db.refresh(invoice)
#
#     for item in payload.items or []:
#         db.add(models.InvoiceItem(invoice_id=invoice.id, **item.model_dump()))
#
#     if payload.paid_amount and payload.paid_amount > 0:
#         db.add(
#             models.Payment(
#                 invoice_id=invoice.id,
#                 amount=payload.paid_amount,
#                 mode=payload.payment_mode,
#                 collected_by=user.id,
#             )
#         )
#     db.commit()
#     db.refresh(invoice)
#
#     return _to_out(invoice)


@router.get("/mine")
def my_invoices(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    if status and status.upper() not in {"PAID", "PARTIAL", "UNPAID"}:
        raise HTTPException(422, "status must be PAID, PARTIAL, or UNPAID")
    search = clean_search(search)
    q = db.query(models.Invoice).filter(models.Invoice.mr_id == user.id)
    if date_from:
        q = q.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(models.Invoice.invoice_date <= date_to)
    if status:
        q = q.filter(models.Invoice.status == status.upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id).filter(
            or_(
                models.Invoice.invoice_number.ilike(term),
                models.Customer.name.ilike(term),
                models.Invoice.payment_mode.ilike(term),
            )
        )
    q = q.order_by(models.Invoice.invoice_date.desc(), models.Invoice.id.desc())
    paged, total, page_size, page_offset = query_page(q, limit, offset, search)
    items = _to_out_many(db, paged)
    if limit is None and offset is None and search is None:
        return items
    return page_result(items, total, page_size, page_offset)


@router.get("")
def list_invoices(
    mr_id: Optional[int] = None,
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    # Additive, all optional (calls without them behave exactly as before):
    pending_only: bool = False,          # "Pending" tab: invoices with a balance
    sort_order: Optional[str] = None,    # newest (default) | oldest | amount
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    try:
        status = clean_status(status, INVOICE_STATUSES | {"REVERSED"})
    except ValueError:
        raise HTTPException(422, "status must be PAID, PARTIAL, UNPAID, or REVERSED")
    if sort_order not in (None, "", "newest", "oldest", "amount"):
        raise HTTPException(422, "sort_order must be newest, oldest, or amount")
    search = clean_search(search)
    q = db.query(models.Invoice)
    if mr_id:
        q = q.filter(models.Invoice.mr_id == mr_id)
    if pending_only:
        q = q.filter(models.Invoice.pending_amount > 0)
    if status == "REVERSED":
        q = q.filter(models.Invoice.id.in_(reversed_invoice_ids()))
    elif status:
        q = q.filter(models.Invoice.status == status.upper())
    if customer_id:
        q = q.filter(models.Invoice.customer_id == customer_id)
    if date_from:
        q = q.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(models.Invoice.invoice_date <= date_to)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id).outerjoin(
            models.User, models.User.id == models.Invoice.mr_id
        ).filter(
            or_(
                models.Invoice.invoice_number.ilike(term),
                models.Customer.name.ilike(term),
                models.User.name.ilike(term),
                models.Invoice.payment_mode.ilike(term),
            )
        )
    # Pending total for exactly this filtered set (paged responses only).
    filtered_outstanding = q.with_entities(
        func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    ).order_by(None).scalar()
    if sort_order == "oldest":
        q = q.order_by(models.Invoice.invoice_date.asc().nullslast(), models.Invoice.id.asc())
    elif sort_order == "amount":
        q = q.order_by(models.Invoice.pending_amount.desc(), models.Invoice.id.desc())
    else:
        q = q.order_by(models.Invoice.invoice_date.desc(), models.Invoice.id.desc())
    paged, total, page_size, page_offset = query_page(q, limit, offset, search)
    items = _to_out_many(db, paged)
    if limit is None and offset is None and search is None:
        return items
    return {**page_result(items, total, page_size, page_offset), "filtered_outstanding": filtered_outstanding}


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


@router.get("/{invoice_id}/payments")
def invoice_payments(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Full collection history for one invoice, newest first, including
    who recorded each entry (MR or Admin) and any reversals."""
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
        raise HTTPException(403, "You can only view your own invoices")
    rows = (
        db.query(models.Payment, models.User)
        .outerjoin(models.User, models.User.id == RECORDER_ID)
        .filter(models.Payment.invoice_id == invoice.id)
        .order_by(models.Payment.payment_date.desc(), models.Payment.id.desc())
        .all()
    )
    return {
        "invoice": _to_out(invoice),
        "payments": [payment_row(payment, collector) for payment, collector in rows],
    }


@router.get("/{invoice_id}/history")
def invoice_history(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Full, oldest-first timeline for one invoice: created, every collection
    (MR or Admin), every reversal and any later collections. Built from the
    payments ledger plus the invoice_events log, so invoices from before the
    log existed still get a complete timeline. MRs only see their own."""
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
        raise HTTPException(403, "You can only view your own invoices")
    return build_invoice_history(db, invoice)


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Correct header-level details on an invoice. An MR can only edit their
    own invoices; Admin can edit any. paid_amount isn't editable here --
    that flows through POST /payments so the collection history stays
    trustworthy -- but changing total_amount still recomputes status/pending
    against whatever's already been paid."""
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    # Disabled for MR: re-enable if needed (MRs could edit their own invoices).
    # if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
    #     raise HTTPException(403, "You can only edit your own invoices")
    if user.role == models.RoleEnum.MR.value:
        raise HTTPException(403, "Only an Admin can edit invoices")

    data = payload.model_dump(exclude_unset=True)

    if "customer_name" in data:
        new_name = (data.pop("customer_name") or "").strip()
        new_type = data.pop("customer_type", None)
        if new_name:
            customer = (
                db.query(models.Customer)
                .filter(models.Customer.name.ilike(new_name))
                .first()
            )
            if not customer:
                customer = models.Customer(name=new_name, type=new_type)
                db.add(customer)
                db.commit()
                db.refresh(customer)
            invoice.customer_id = customer.id
    else:
        data.pop("customer_type", None)

    if "invoice_number" in data:
        invoice_number = data["invoice_number"].strip()
        duplicate = db.query(models.Invoice).filter(
            models.Invoice.id != invoice.id,
            models.Invoice.invoice_number.ilike(invoice_number),
        ).first()
        if duplicate:
            raise HTTPException(409, f"Invoice number '{invoice_number}' already exists")
        invoice.invoice_number = invoice_number
    if "invoice_date" in data:
        invoice.invoice_date = data["invoice_date"]
    if "payment_mode" in data:
        invoice.payment_mode = data["payment_mode"]
    if "remarks" in data:
        invoice.remarks = data["remarks"]
    if "total_amount" in data and data["total_amount"] is not None:
        invoice.total_amount = data["total_amount"]
        status_, pending = compute_status(invoice.total_amount, invoice.paid_amount)
        invoice.status = status_
        invoice.pending_amount = pending

    db.commit()
    db.refresh(invoice)
    return _to_out(invoice)


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Deletes an invoice along with its items and payment history
    (cascades). An MR can only delete their own invoices; Admin can delete
    any."""
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    # Disabled for MR: re-enable if needed (MRs could delete their own invoices).
    # if user.role == models.RoleEnum.MR.value and invoice.mr_id != user.id:
    #     raise HTTPException(403, "You can only delete your own invoices")
    if user.role == models.RoleEnum.MR.value:
        raise HTTPException(403, "Only an Admin can delete invoices")

    db.delete(invoice)
    db.commit()
    return None
