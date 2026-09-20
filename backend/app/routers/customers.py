from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=List[schemas.CustomerOut])
def list_customers(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    rows = (
        db.query(models.Customer, func.count(models.Invoice.id).label("invoice_count"))
        .outerjoin(models.Invoice, models.Invoice.customer_id == models.Customer.id)
        .group_by(models.Customer.id)
        .order_by(models.Customer.name)
        .all()
    )
    return [
        schemas.CustomerOut(
            id=c.id,
            name=c.name,
            type=c.type,
            phone=c.phone,
            address=c.address,
            gstin=c.gstin,
            invoice_count=count,
        )
        for c, count in rows
    ]


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


@router.get("/{customer_id}/ledger")
def customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    customer = (
        db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    )
    if not customer:
        raise HTTPException(404, "Customer not found")

    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.customer_id == customer_id)
        .order_by(models.Invoice.invoice_date)
        .all()
    )
    total_invoiced = sum(i.total_amount or 0 for i in invoices)
    total_paid = sum(i.paid_amount or 0 for i in invoices)

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "type": customer.type,
        },
        "total_invoiced": total_invoiced,
        "total_paid": total_paid,
        "outstanding": total_invoiced - total_paid,
        "invoices": [
            {
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
