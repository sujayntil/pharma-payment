from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..utils import page_result, query_page

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("")
def list_customers(
    search: str | None = None,
    mr_id: int | None = None,
    customer_type: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    q = db.query(models.Customer, func.count(models.Invoice.id).label("invoice_count"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            models.Customer.name.ilike(term),
            models.Customer.type.ilike(term),
            models.Customer.phone.ilike(term),
        ))
    if mr_id:
        q = q.filter(models.Customer.mr_id == mr_id)
    if customer_type and customer_type.strip():
        q = q.filter(models.Customer.type.ilike(f"%{customer_type.strip()}%"))
    q = (
        q
        .outerjoin(models.Invoice, models.Invoice.customer_id == models.Customer.id)
        .group_by(models.Customer.id)
        .order_by(models.Customer.name)
    )
    rows, total, page_size, page_offset = query_page(q, limit, offset, search)
    items = [
        schemas.CustomerOut(
            id=customer.id,
            name=customer.name,
            type=customer.type,
            phone=customer.phone,
            address=customer.address,
            gstin=customer.gstin,
            mr_id=customer.mr_id,
            mr_name=customer.mr.name if customer.mr else None,
            invoice_count=count,
        )
        for customer, count in rows
    ]
    if limit is None and offset is None and search is None:
        return items
    return page_result(items, total, page_size, page_offset)


@router.post("", response_model=schemas.CustomerOut)
def create_customer(
    payload: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    customer = models.Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(
    customer_id: int,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        name = data["name"].strip()
        duplicate = db.query(models.Customer).filter(
            func.lower(func.trim(models.Customer.name)) == name.lower(),
            models.Customer.id != customer.id,
        ).first()
        if duplicate:
            raise HTTPException(409, f"Customer name '{name}' already exists")
        customer.name = name
    for field in ("type", "phone", "address", "gstin"):
        if field in data:
            setattr(customer, field, data[field] or None)
    if "mr_id" in data:
        if data["mr_id"] is not None:
            mr = db.get(models.User, data["mr_id"])
            if not mr or mr.role != models.RoleEnum.MR.value:
                raise HTTPException(422, "mr_id must refer to an MR")
        customer.mr_id = data["mr_id"]
        db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id).update(
            {models.Invoice.mr_id: customer.mr_id}, synchronize_session=False
        )
    db.commit()
    db.refresh(customer)
    return schemas.CustomerOut(
        id=customer.id,
        name=customer.name,
        type=customer.type,
        phone=customer.phone,
        address=customer.address,
        gstin=customer.gstin,
        mr_id=customer.mr_id,
        mr_name=customer.mr.name if customer.mr else None,
        invoice_count=db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id).count(),
    )


@router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    customer = db.get(models.Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    invoice_count = db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id).count()
    if invoice_count:
        raise HTTPException(400, "Customer has invoices and cannot be deleted. Keep the record to preserve its ledger.")
    db.delete(customer)
    db.commit()
    return None


@router.get("/{customer_id}/ledger")
def customer_ledger(
    customer_id: int,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    customer = (
        db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    )
    if not customer:
        raise HTTPException(404, "Customer not found")
    if user.role == models.RoleEnum.MR.value and customer.mr_id != user.id:
        raise HTTPException(404, "Customer not found")

    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    if status and status.upper() not in {"PAID", "PARTIAL", "UNPAID"}:
        raise HTTPException(422, "status must be PAID, PARTIAL, or UNPAID")
    invoice_query = db.query(models.Invoice).filter(models.Invoice.customer_id == customer_id)
    if date_from:
        invoice_query = invoice_query.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        invoice_query = invoice_query.filter(models.Invoice.invoice_date <= date_to)
    if status:
        invoice_query = invoice_query.filter(models.Invoice.status == status.upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        invoice_query = invoice_query.filter(or_(
            models.Invoice.invoice_number.ilike(term),
            models.Invoice.payment_mode.ilike(term),
            models.Invoice.status.ilike(term),
            models.Invoice.mr.has(models.User.name.ilike(term)),
        ))
    totals_query = db.query(
        func.coalesce(func.sum(models.Invoice.total_amount), 0),
        func.coalesce(func.sum(models.Invoice.paid_amount), 0),
    ).filter(models.Invoice.customer_id == customer_id)
    if date_from:
        totals_query = totals_query.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        totals_query = totals_query.filter(models.Invoice.invoice_date <= date_to)
    if status:
        totals_query = totals_query.filter(models.Invoice.status == status.upper())
    total_invoiced, total_paid = totals_query.one()
    invoice_query = invoice_query.order_by(models.Invoice.invoice_date.desc(), models.Invoice.id.desc())
    invoices, invoice_count, page_size, page_offset = query_page(
        invoice_query, limit, offset, search
    )

    result = {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "type": customer.type,
        },
        "total_invoiced": total_invoiced,
        "total_paid": total_paid,
        "outstanding": total_invoiced - total_paid,
        "invoice_count": invoice_count,
        "limit": page_size,
        "offset": page_offset,
        "invoices": [
            {
                "invoice_id": i.id,
                "invoice_number": i.invoice_number,
                "date": i.invoice_date,
                "amount": i.total_amount,
                "status": i.status,
                "mode": i.payment_mode,
                "mr": i.mr.name if i.mr else None,
            }
            for i in invoices
        ],
    }
    return result
