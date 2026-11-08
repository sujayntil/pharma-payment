from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..collection_info import last_collection_fields, latest_collections, reversed_invoice_ids
from ..database import get_db
from ..overdue import overdue_customer_summaries
from ..deps import get_current_user
from ..utils import INVOICE_STATUSES, clean_search, clean_status, page_result, query_page

router = APIRouter(prefix="/mr", tags=["mr"])


@router.get("/customers")
def customers(
    search: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    """Return only customers currently assigned to this representative."""
    search = clean_search(search)
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
    recent_latest = latest_collections(db, [i.id for i in recent])

    return {
        "name": user.name,
        "total_invoices": total_invoices,
        "total_amount": total_amount,
        "paid": paid,
        "partial": partial,
        "unpaid": unpaid,
        "recent": [
            {
                "invoice_id": i.id,  # additive: lets the app open the invoice
                "invoice_number": i.invoice_number,
                "invoice_date": i.invoice_date,
                "pending_amount": i.pending_amount,
                "total_amount": i.total_amount,
                "status": i.status,
                "customer": i.customer.name if i.customer else None,
                **last_collection_fields(recent_latest.get(i.id)),
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
    # My Collections passes include_settled=true to list ALL of the MR's
    # invoices (pending, partial, paid, reversed). Without it the endpoint
    # behaves exactly as before: only invoices with a balance.
    include_settled: bool = False,
    status: str | None = None,
    customer_id: int | None = None,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    if sort_order not in {"amount", "oldest", "newest"}:
        raise HTTPException(422, "sort_order must be amount, oldest, or newest")
    try:
        status = clean_status(status, INVOICE_STATUSES | {"REVERSED"})
    except ValueError:
        raise HTTPException(422, "status must be PAID, PARTIAL, UNPAID, or REVERSED")
    search = clean_search(search)

    base = db.query(models.Invoice).filter(models.Invoice.mr_id == user.id)
    # Unchanged contract: everything this MR still has to collect.
    total_outstanding = base.filter(models.Invoice.pending_amount > 0).with_entities(
        func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    ).scalar()
    if not include_settled:
        base = base.filter(models.Invoice.pending_amount > 0)
    query = base
    if customer_id is not None:
        query = query.filter(models.Invoice.customer_id == customer_id)
    if status == "REVERSED":
        query = query.filter(models.Invoice.id.in_(reversed_invoice_ids()))
    elif status:
        query = query.filter(models.Invoice.status == status)
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
    # Summary for the same filtered set as the rows. Paid invoices have no
    # pending balance, so listing them never changes this figure.
    filtered_outstanding = query.with_entities(
        func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    ).order_by(None).scalar()
    if sort_order == "amount":
        query = query.order_by(models.Invoice.pending_amount.desc(), models.Invoice.id.desc())
    else:
        date_sort = models.Invoice.invoice_date.asc() if sort_order == "oldest" else models.Invoice.invoice_date.desc()
        id_sort = models.Invoice.id.asc() if sort_order == "oldest" else models.Invoice.id.desc()
        query = query.order_by(date_sort.nullslast(), id_sort)
    items, total_count, page_size, page_offset = query_page(query, limit, offset, search)
    latest = latest_collections(db, [i.id for i in items])

    return {
        "total_outstanding": total_outstanding,
        "filtered_outstanding": filtered_outstanding,
        "total_count": total_count,
        "limit": page_size,
        "offset": page_offset,
        "items": [
            {
                "invoice_id": i.id,
                "invoice_number": i.invoice_number,
                "invoice_date": i.invoice_date,
                "customer": i.customer.name if i.customer else None,
                "pending_amount": i.pending_amount,
                "total_amount": i.total_amount,
                "paid_amount": i.paid_amount,
                "status": i.status,
                **last_collection_fields(latest.get(i.id)),
            }
            for i in items
        ],
    }


@router.get("/overdue-alerts")
def overdue_alerts(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    """This MR's customers with at least one invoice unpaid for 40+ days.
    Same rules as the Admin table, filtered to invoices assigned to them."""
    return overdue_customer_summaries(db, mr_id=user.id)
