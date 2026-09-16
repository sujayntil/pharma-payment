from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/mr", tags=["mr"])


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
