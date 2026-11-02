from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/mr", tags=["mr"])


@router.get("/customers")
def customers(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    """Return only customers currently assigned to this representative."""
    invoice_count = (
        select(func.count(models.Invoice.id))
        .where(models.Invoice.customer_id == models.Customer.id)
        .correlate(models.Customer)
        .scalar_subquery()
    )
    invoiced = (
        select(func.coalesce(func.sum(models.Invoice.total_amount), 0))
        .where(models.Invoice.customer_id == models.Customer.id)
        .correlate(models.Customer)
        .scalar_subquery()
    )
    outstanding = (
        select(func.coalesce(func.sum(models.Invoice.pending_amount), 0))
        .where(models.Invoice.customer_id == models.Customer.id)
        .correlate(models.Customer)
        .scalar_subquery()
    )
    latest_invoice = (
        select(func.max(models.Invoice.invoice_date))
        .where(models.Invoice.customer_id == models.Customer.id)
        .correlate(models.Customer)
        .scalar_subquery()
    )
    rows = (
        db.query(models.Customer, invoice_count, invoiced, outstanding, latest_invoice)
        .filter(models.Customer.mr_id == user.id)
        .order_by(models.Customer.name)
        .all()
    )
    return [
        {
            "id": customer.id,
            "name": customer.name,
            "type": customer.type,
            "phone": customer.phone,
            "invoice_count": count,
            "total_invoiced": total,
            "outstanding": pending,
            "latest_invoice_date": latest,
        }
        for customer, count, total, pending, latest in rows
    ]


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    q = db.query(models.Invoice).filter(models.Invoice.mr_id == user.id)

    total_invoices = q.count()
    total_amount = q.with_entities(
        func.coalesce(func.sum(models.Invoice.total_amount), 0)
    ).scalar()
    paid = q.filter(models.Invoice.status == "PAID").count()
    partial = q.filter(models.Invoice.status == "PARTIAL").count()
    unpaid = q.filter(models.Invoice.status == "UNPAID").count()

    recent = q.order_by(models.Invoice.created_at.desc()).limit(6).all()

    return {
        "name": user.name,
        "total_invoices": total_invoices,
        "total_amount": total_amount,
        "paid": paid,
        "partial": partial,
        "unpaid": unpaid,
        "recent": [
            {
                "invoice_number": i.invoice_number,
                "total_amount": i.total_amount,
                "status": i.status,
                "customer": i.customer.name if i.customer else None,
            }
            for i in recent
        ],
    }


@router.get("/outstanding")
def outstanding(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    q = db.query(models.Invoice).filter(
        models.Invoice.mr_id == user.id, models.Invoice.pending_amount > 0
    )
    total_outstanding = q.with_entities(
        func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    ).scalar()
    items = q.order_by(models.Invoice.pending_amount.desc()).all()

    return {
        "total_outstanding": total_outstanding,
        "items": [
            {
                "invoice_id": i.id,
                "invoice_number": i.invoice_number,
                "customer": i.customer.name if i.customer else None,
                "pending_amount": i.pending_amount,
                "status": i.status,
            }
            for i in items
        ],
    }
