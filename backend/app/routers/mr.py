from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..utils import page_result, query_page

router = APIRouter(prefix="/mr", tags=["mr"])


@router.get("/customers")
def customers(
    search: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
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
    query = db.query(models.Customer, invoice_count, invoiced, outstanding, latest_invoice).filter(
        models.Customer.mr_id == user.id
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            models.Customer.name.ilike(term),
            models.Customer.type.ilike(term),
            models.Customer.phone.ilike(term),
        ))
    query = query.order_by(models.Customer.name, models.Customer.id)
    rows, total, page_size, page_offset = query_page(query, limit, offset, search)
    items = [
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
    if limit is None and offset is None and search is None:
        return items
    return page_result(items, total, page_size, page_offset)


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
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort_order: str = "amount",
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    if sort_order not in {"amount", "oldest", "newest"}:
        raise HTTPException(422, "sort_order must be amount, oldest, or newest")

    base = db.query(models.Invoice).filter(
        models.Invoice.mr_id == user.id, models.Invoice.pending_amount > 0
    )
    total_outstanding = base.with_entities(
        func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    ).scalar()
    query = base
    if date_from:
        query = query.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(models.Invoice.invoice_date <= date_to)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            models.Invoice.invoice_number.ilike(term),
            models.Invoice.customer.has(models.Customer.name.ilike(term)),
        ))
    if sort_order == "amount":
        query = query.order_by(models.Invoice.pending_amount.desc(), models.Invoice.id.desc())
    else:
        date_sort = models.Invoice.invoice_date.asc() if sort_order == "oldest" else models.Invoice.invoice_date.desc()
        id_sort = models.Invoice.id.asc() if sort_order == "oldest" else models.Invoice.id.desc()
        query = query.order_by(date_sort.nullslast(), id_sort)
    items, total_count, page_size, page_offset = query_page(query, limit, offset, search)

    return {
        "total_outstanding": total_outstanding,
        "total_count": total_count,
        "limit": page_size,
        "offset": page_offset,
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
