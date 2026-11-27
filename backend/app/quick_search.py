"""Top-bar search: a few customers and invoices matching the text (best
matches first) plus how many match in all. An MR only finds their own
customers and those customers' invoices (the same rule as the ledger)."""
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from . import models


def quick_search_results(db: Session, q: str, mr_id: int | None = None) -> dict:
    term = (q or "").strip()
    if len(term) < 2:
        return {"customers": [], "invoices": [], "customer_count": 0, "invoice_count": 0}
    like, prefix = f"%{term}%", f"{term}%"
    pending = func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    cq = (
        db.query(models.Customer, pending.label("pending"))
        .outerjoin(models.Invoice, models.Invoice.customer_id == models.Customer.id)
        .filter(or_(models.Customer.name.ilike(like), models.Customer.phone.ilike(like),
                    models.Customer.alternate_phone.ilike(like)))
        .group_by(models.Customer.id)
    )
    iq = (
        db.query(models.Invoice)
        .outerjoin(models.Customer, models.Customer.id == models.Invoice.customer_id)
        .filter(or_(models.Invoice.invoice_number.ilike(like), models.Customer.name.ilike(like)))
    )
    if mr_id is not None:
        cq = cq.filter(models.Customer.mr_id == mr_id)
        iq = iq.filter(models.Customer.mr_id == mr_id)
    customer_count = cq.order_by(None).count()
    customers = cq.order_by(
        case((models.Customer.name.ilike(prefix), 0), else_=1), func.lower(models.Customer.name)
    ).limit(5).all()
    invoice_count = iq.order_by(None).count()
    invoices = iq.order_by(
        case((func.lower(models.Invoice.invoice_number) == term.lower(), 0),
             (models.Invoice.invoice_number.ilike(prefix), 1),
             (models.Invoice.invoice_number.ilike(like), 2), else_=3),
        models.Invoice.invoice_date.desc(), models.Invoice.id.desc(),
    ).limit(6).all()
    return {
        "customer_count": customer_count,
        "invoice_count": invoice_count,
        "customers": [{
            "id": c.id, "name": c.name, "type": c.type, "area": c.area, "mr": c.mr.name if c.mr else None,
            "pending": round(float(p or 0), 2),
        } for c, p in customers],
        "invoices": [{
            "id": i.id, "invoice_number": i.invoice_number, "invoice_date": i.invoice_date,
            "customer_id": i.customer_id,
            "customer": i.customer.name if i.customer else None, "total": i.total_amount,
            "pending": i.pending_amount, "status": i.status,
        } for i in invoices],
    }
