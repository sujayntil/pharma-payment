from datetime import date, datetime, time, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased

from .. import models, schemas
from ..collection_info import (
    RECORDER_ID,
    REVERSAL_MODE,
    apply_ledger_delta,
    credited_mr_id,
    log_event,
    linked_reversal_totals,
    net_collected,
    payment_row,
    reversal_fields,
    reversible_amount,
)
from ..database import get_db
from ..deps import require_admin
from ..overdue import overdue_customer_summaries
from ..security import hash_password
from ..utils import clean_search, compute_status, page_result, query_page

router = APIRouter(prefix="/admin", tags=["admin"])
_IST = timezone(timedelta(hours=5, minutes=30))


def _date_range_filter(date_from: Optional[date], date_to: Optional[date]):
    """Builds the invoice_date range conditions shared by dashboard and
    mr-performance. Both bounds are optional and inclusive."""
    conditions = []
    if date_from:
        conditions.append(models.Invoice.invoice_date >= date_from)
    if date_to:
        conditions.append(models.Invoice.invoice_date <= date_to)
    return conditions


def _payment_date_range_filter(date_from: Optional[date], date_to: Optional[date]):
    """Build payment timestamp bounds for dates selected in India."""
    conditions = []
    if date_from:
        start = datetime.combine(date_from, time.min, tzinfo=_IST).astimezone(timezone.utc).replace(tzinfo=None)
        conditions.append(models.Payment.payment_date >= start)
    if date_to:
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=_IST).astimezone(timezone.utc).replace(tzinfo=None)
        conditions.append(models.Payment.payment_date < end)
    return conditions


@router.get("/dashboard")
def dashboard(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    customer_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Invoice KPIs plus collections received during the selected dates."""
    customer_type = (customer_type or "").strip().lower()
    if customer_type not in {"", "distributor", "chemist", "doctor", "other"}:
        raise HTTPException(422, "customer_type must be distributor, chemist, doctor, or other")

    def apply_type_filter(query):
        if customer_type == "other":
            normalized_type = func.lower(func.trim(func.coalesce(models.Customer.type, "")))
            return query.filter(
                or_(models.Customer.id.is_(None), ~normalized_type.in_(("distributor", "chemist", "doctor")))
            )
        if customer_type:
            return query.filter(func.lower(func.trim(models.Customer.type)) == customer_type)
        return query

    q = apply_type_filter(
        db.query(models.Invoice).outerjoin(models.Customer, models.Invoice.customer_id == models.Customer.id)
    )
    conditions = _date_range_filter(date_from, date_to)
    if conditions:
        q = q.filter(and_(*conditions))

    total_sales = q.with_entities(func.coalesce(func.sum(models.Invoice.total_amount), 0)).scalar()
    collected = apply_type_filter(
        db.query(func.coalesce(func.sum(models.Payment.amount), 0))
        .join(models.Invoice, models.Payment.invoice_id == models.Invoice.id)
        .outerjoin(models.Customer, models.Invoice.customer_id == models.Customer.id)
    )
    payment_conditions = _payment_date_range_filter(date_from, date_to)
    if payment_conditions:
        collected = collected.filter(and_(*payment_conditions))
    collected = collected.scalar()

    # Outstanding remains the balance for invoices dated in this period.
    invoice_collected = q.with_entities(func.coalesce(func.sum(models.Invoice.paid_amount), 0)).scalar()

    total_invoices = q.count()
    paid = q.filter(models.Invoice.status == "PAID").count()
    partial = q.filter(models.Invoice.status == "PARTIAL").count()
    unpaid = q.filter(models.Invoice.status == "UNPAID").count()

    return {
        "total_sales": total_sales,
        "collected": collected,
        "outstanding": total_sales - invoice_collected,
        "total_invoices": total_invoices,
        "paid": paid,
        "partial": partial,
        "unpaid": unpaid,
    }


@router.get("/overdue-alerts")
def overdue_alerts(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Customers with at least one invoice unpaid for 40 days or more."""
    return overdue_customer_summaries(db)


@router.get("/mr-performance")
def mr_performance(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    query = db.query(
        models.User.id,
        models.User.name,
        func.coalesce(func.sum(models.Invoice.total_amount), 0).label("sales"),
        func.coalesce(func.sum(models.Invoice.paid_amount), 0).label("collected"),
        func.coalesce(func.sum(models.Invoice.pending_amount), 0).label("pending"),
    ).outerjoin(models.Invoice, models.Invoice.mr_id == models.User.id)

    conditions = _date_range_filter(date_from, date_to)
    if conditions:
        # outerjoin + date filter: only filter rows where an invoice exists,
        # so MRs with zero invoices in range still show up with zeros
        # rather than disappearing entirely.
        query = query.filter(
            (models.Invoice.id.is_(None)) | (and_(*conditions))
        )

    rows = (
        query.filter(models.User.role == models.RoleEnum.MR.value)
        .group_by(models.User.id, models.User.name)
        .order_by(models.User.name)
        .all()
    )
    return [
        {
            "mr_id": r.id,
            "name": r.name,
            "sales": r.sales,
            "collected": r.collected,
            "pending": r.pending,
        }
        for r in rows
    ]


@router.get("/outstanding-alerts")
def outstanding_alerts(
    threshold: float = 50000,
    search: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    query = db.query(models.Invoice).filter(models.Invoice.pending_amount >= threshold)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            models.Invoice.invoice_number.ilike(term),
            models.Invoice.customer.has(models.Customer.name.ilike(term)),
            models.Invoice.mr.has(models.User.name.ilike(term)),
        ))
    query = query.order_by(models.Invoice.pending_amount.desc(), models.Invoice.id.desc())
    invoices, total, page_size, page_offset = query_page(query, limit, offset, search)
    items = [
        {
            "invoice_id": i.id,  # additive: lets the dashboard open the invoice
            "invoice_number": i.invoice_number,
            "customer": i.customer.name if i.customer else None,
            "pending_amount": i.pending_amount,
            "mr": i.mr.name if i.mr else None,
        }
        for i in invoices
    ]
    if limit is None and offset is None and search is None:
        return items
    return page_result(items, total, page_size, page_offset)


@router.get("/recent-payments")
def recent_payments(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Recent collection activity from the existing payment ledger."""
    limit = min(max(limit, 1), 100)
    rows = (
        db.query(models.Payment, models.Invoice, models.Customer, models.User)
        .join(models.Invoice, models.Payment.invoice_id == models.Invoice.id)
        .outerjoin(models.Customer, models.Invoice.customer_id == models.Customer.id)
        .outerjoin(models.User, RECORDER_ID == models.User.id)
        .order_by(models.Payment.payment_date.desc(), models.Payment.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            **payment_row(payment, collector),
            "invoice_number": invoice.invoice_number,
            "customer_name": customer.name if customer else None,
            "collected_by": collector.name if collector else None,
        }
        for payment, invoice, customer, collector in rows
    ]


@router.get("/collections")
def collections(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    mr_id: Optional[int] = None,
    mode: Optional[str] = None,
    recorded_by: Optional[str] = None,
    entry_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must be on or before date_to")
    search = clean_search(search)

    collector = aliased(models.User)
    assigned_mr = aliased(models.User)
    query = (
        db.query(models.Payment, models.Invoice, models.Customer, collector, assigned_mr)
        .join(models.Invoice, models.Payment.invoice_id == models.Invoice.id)
        .outerjoin(models.Customer, models.Invoice.customer_id == models.Customer.id)
        # "collector" is whoever recorded the row (Admin or MR).
        .outerjoin(collector, RECORDER_ID == collector.id)
        .outerjoin(assigned_mr, models.Invoice.mr_id == assigned_mr.id)
    )

    payment_conditions = _payment_date_range_filter(date_from, date_to)
    if payment_conditions:
        query = query.filter(and_(*payment_conditions))
    if mr_id:
        query = query.filter(models.Invoice.mr_id == mr_id)
    if mode:
        query = query.filter(func.lower(models.Payment.mode) == mode.strip().lower())
    if recorded_by:
        role = recorded_by.strip().upper()
        if role not in (models.RoleEnum.ADMIN.value, models.RoleEnum.MR.value):
            raise HTTPException(422, "recorded_by must be ADMIN or MR")
        query = query.filter(collector.role == role)
    if entry_type:
        if entry_type == "reversal":
            query = query.filter(models.Payment.amount < 0)
        elif entry_type == "collection":
            query = query.filter(models.Payment.amount > 0)
        else:
            raise HTTPException(422, "entry_type must be collection or reversal")
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            models.Invoice.invoice_number.ilike(term),
            models.Customer.name.ilike(term),
            assigned_mr.name.ilike(term),
            collector.name.ilike(term),
            models.Payment.transaction_reference.ilike(term),
        ))

    total_count = query.with_entities(func.count(models.Payment.id)).scalar()
    total_amount = query.with_entities(func.coalesce(func.sum(models.Payment.amount), 0)).scalar()
    ordered = query.order_by(models.Payment.payment_date.desc(), models.Payment.id.desc())
    if search and search.strip():
        rows = ordered.all()
        page_size, page_offset = None, 0
    else:
        page_size = min(max(limit, 1), 100)
        page_offset = max(offset, 0)
        rows = ordered.offset(page_offset).limit(page_size).all()
    reversed_totals = linked_reversal_totals(db, [row[0].id for row in rows])
    return {
        "total_count": total_count,
        "total_amount": total_amount,
        "limit": page_size,
        "offset": page_offset,
        "rows": [
            {
                **payment_row(payment, collector),
                **reversal_fields(payment, reversed_totals),
                "invoice_number": invoice.invoice_number,
                "customer_name": customer.name if customer else None,
                "mr_name": assigned_mr.name if assigned_mr else None,
                "invoice_amount": invoice.total_amount,
                "pending_amount": invoice.pending_amount,
                "paid_amount": invoice.paid_amount,
                "invoice_status": invoice.status,
            }
            for payment, invoice, customer, collector, assigned_mr in rows
        ],
    }


@router.put("/invoices/{invoice_id}/collection-status")
def override_collection_status(
    invoice_id: int,
    payload: schemas.CollectionStatusUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    status = payload.status.upper()
    if status not in (models.StatusEnum.PAID.value, models.StatusEnum.UNPAID.value):
        raise HTTPException(422, "status must be PAID or UNPAID")
    invoice = db.get(models.Invoice, invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    old_value = {
        "invoice_id": invoice.id,
        "status": invoice.status,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
    }
    # Every change goes through the payments ledger so collection totals
    # (dashboard, collections page, MR views) move with the invoice status.
    ledger_entry = None
    event_type = None
    if status == models.StatusEnum.PAID.value:
        settle = round((invoice.total_amount or 0) - (invoice.paid_amount or 0), 2)
        if settle > 0:
            ledger_entry = models.Payment(
                invoice_id=invoice.id,
                amount=settle,
                mode=(payload.mode or "").strip() or "Admin adjustment",
                transaction_reference=(payload.transaction_reference or "").strip() or None,
                collected_by=credited_mr_id(invoice, user),
                recorded_by=user.id,
            )
            event_type = models.InvoiceEventType.COLLECTED.value
        if ledger_entry and ledger_entry.mode:
            invoice.payment_mode = ledger_entry.mode
        target_paid = invoice.total_amount
    else:
        # Reverse whatever the ledger currently holds for this invoice. Older
        # overrides changed paid_amount without a ledger row; those have
        # nothing to reverse, so the totals stay consistent either way.
        collected = round(net_collected(db, invoice.id), 2)
        if collected > 0:
            reason = (payload.reason or "").strip()
            ledger_entry = models.Payment(
                invoice_id=invoice.id,
                amount=-collected,
                mode=REVERSAL_MODE,
                transaction_reference=f"Marked unpaid by {user.name}" + (f": {reason}" if reason else ""),
                # Deducted from the MR the invoice's collections sit under.
                collected_by=credited_mr_id(invoice, user),
                recorded_by=user.id,
                reason=reason or "Marked unpaid",
            )
            event_type = models.InvoiceEventType.REVERSED.value
        target_paid = 0
    if ledger_entry:
        db.add(ledger_entry)
        db.flush()
        log_event(db, invoice.id, event_type, user, payment=ledger_entry)
    # Same balance helper as every other collection/reversal.
    apply_ledger_delta(invoice, round((target_paid or 0) - (invoice.paid_amount or 0), 2))
    db.add(models.AuditLog(
        action="admin_collection_status_override",
        user_id=user.id,
        old_value=old_value,
        new_value={
            "invoice_id": invoice.id,
            "status": invoice.status,
            "paid_amount": invoice.paid_amount,
            "pending_amount": invoice.pending_amount,
            "ledger_amount": ledger_entry.amount if ledger_entry else 0,
        },
    ))
    db.commit()
    return {
        "invoice_id": invoice.id,
        "status": invoice.status,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
        "ledger_amount": ledger_entry.amount if ledger_entry else 0,
    }


@router.post("/payments/{payment_id}/reverse")
def reverse_payment(
    payment_id: int,
    payload: schemas.PaymentReversalCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Admin-only. Reverses one collection by adding a linked negative ledger
    entry -- the original row is never changed or deleted. A payment can be
    re-collected and reversed any number of times; each action is its own
    entry. A single reversal can never exceed what is still collected."""
    payment = db.get(models.Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    if (payment.amount or 0) <= 0:
        raise HTTPException(400, "A reversal entry cannot itself be reversed")
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(422, "A reason is required to reverse a collection")
    invoice = db.get(models.Invoice, payment.invoice_id)
    if not invoice:
        raise HTTPException(404, "Invoice not found")

    available = reversible_amount(db, payment)
    if available <= 0:
        raise HTTPException(400, "Nothing left to reverse on this collection")
    amount = round(payload.amount, 2) if payload.amount is not None else available
    if amount <= 0:
        raise HTTPException(422, "Reversal amount must be greater than zero")
    if amount > available + 0.01:
        raise HTTPException(
            400, f"Reversal (₹{amount}) exceeds the amount still collected on this entry (₹{available})"
        )
    amount = min(amount, available)

    old_value = {
        "invoice_id": invoice.id,
        "status": invoice.status,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
    }
    reversal = models.Payment(
        invoice_id=invoice.id,
        amount=-amount,
        mode=REVERSAL_MODE,
        transaction_reference=f"Reversal of payment #{payment.id}: {reason}",
        # Deducted from the same MR the collection was saved under.
        collected_by=payment.collected_by,
        recorded_by=user.id,
        reversal_of_id=payment.id,
        reason=reason,
    )
    db.add(reversal)
    db.flush()
    apply_ledger_delta(invoice, -amount)
    log_event(db, invoice.id, models.InvoiceEventType.REVERSED.value, user, payment=reversal)
    db.add(models.AuditLog(
        action="admin_payment_reversal",
        user_id=user.id,
        old_value=old_value,
        new_value={
            "invoice_id": invoice.id,
            "payment_id": payment.id,
            "reversal_id": reversal.id,
            "amount": -amount,
            "reason": reason,
            "status": invoice.status,
            "paid_amount": invoice.paid_amount,
            "pending_amount": invoice.pending_amount,
        },
    ))
    db.commit()
    return {
        "invoice_id": invoice.id,
        "payment_id": payment.id,
        "reversal_id": reversal.id,
        "reversed_amount": amount,
        "status": invoice.status,
        "paid_amount": invoice.paid_amount,
        "pending_amount": invoice.pending_amount,
    }


# Disabled: "Add Invoice" is removed everywhere (Dashboard, Workspace, Import
# page). Re-enable if needed: uncomment this route and the "Add invoice"
# button/modal in vite-project/src/pages/admin/AdminImport.jsx.
# @router.post("/manual-invoices", status_code=201)
# def create_manual_invoice(
#     payload: schemas.ManualInvoiceCreate,
#     db: Session = Depends(get_db),
#     user: models.User = Depends(require_admin),
# ):
#     invoice_number = payload.invoice_number.strip()
#     customer_name = (payload.customer_name or "").strip()
#     if not invoice_number or (not payload.customer_id and not customer_name):
#         raise HTTPException(422, "Invoice number and customer are required")
#
#     existing = (
#         db.query(models.Invoice)
#         .filter(func.lower(func.trim(models.Invoice.invoice_number)) == invoice_number.lower())
#         .first()
#     )
#     if existing:
#         raise HTTPException(409, f"Invoice {invoice_number} already exists")
#
#     customer = db.get(models.Customer, payload.customer_id) if payload.customer_id else None
#     if payload.customer_id and not customer:
#         raise HTTPException(404, "Customer not found")
#     matching_customers = [] if customer else (
#         db.query(models.Customer)
#         .filter(func.lower(func.trim(models.Customer.name)) == customer_name.lower())
#         .all()
#     )
#     if len(matching_customers) > 1:
#         raise HTTPException(409, f"Multiple customer records match '{customer_name}'. Resolve the duplicate customer records before adding this invoice.")
#     customer = customer or (matching_customers[0] if matching_customers else None)
#     if customer is None:
#         customer = models.Customer(name=customer_name)
#         db.add(customer)
#         db.flush()
#
#     status, pending = compute_status(payload.total_amount, 0)
#     invoice = models.Invoice(
#         invoice_number=invoice_number,
#         invoice_date=payload.invoice_date,
#         customer_id=customer.id,
#         mr_id=customer.mr_id,
#         total_amount=payload.total_amount,
#         paid_amount=0,
#         pending_amount=pending,
#         status=status,
#     )
#     db.add(invoice)
#     db.commit()
#     db.refresh(invoice)
#
#     return {
#         "invoice_id": invoice.id,
#         "invoice_number": invoice.invoice_number,
#         "customer_name": customer.name,
#         "total_amount": invoice.total_amount,
#         "mr_name": customer.mr.name if customer.mr else None,
#     }


@router.post("/users", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    if payload.role not in (models.RoleEnum.MR.value, models.RoleEnum.ADMIN.value):
        raise HTTPException(400, "role must be MR or ADMIN")
    existing = (
        db.query(models.User)
        .filter(models.User.employee_code == payload.employee_code)
        .first()
    )
    if existing:
        raise HTTPException(400, "employee_code already exists")

    new_user = models.User(
        name=payload.name,
        employee_code=payload.employee_code,
        role=payload.role,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.name).all()


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")

    data = payload.model_dump(exclude_unset=True)

    if "role" in data and data["role"] is not None:
        new_role = data["role"]
        if new_role not in (models.RoleEnum.MR.value, models.RoleEnum.ADMIN.value):
            raise HTTPException(400, "role must be MR or ADMIN")
        if target.role == models.RoleEnum.ADMIN.value and new_role != models.RoleEnum.ADMIN.value:
            other_admins = (
                db.query(models.User)
                .filter(models.User.role == models.RoleEnum.ADMIN.value, models.User.id != target.id)
                .count()
            )
            if other_admins == 0:
                raise HTTPException(400, "Can't demote the only remaining Admin")
        target.role = new_role

    if "name" in data and data["name"]:
        target.name = data["name"]
    if "phone" in data:
        target.phone = data["phone"]
    if "password" in data and data["password"]:
        target.password_hash = hash_password(data["password"])

    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == admin_user.id:
        raise HTTPException(400, "You can't delete your own account while logged in as it")
    if target.role == models.RoleEnum.ADMIN.value:
        other_admins = (
            db.query(models.User)
            .filter(models.User.role == models.RoleEnum.ADMIN.value, models.User.id != target.id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(400, "Can't delete the only remaining Admin")

    invoice_count = db.query(models.Invoice).filter(models.Invoice.mr_id == target.id).count()
    if invoice_count > 0:
        raise HTTPException(
            400,
            f"Can't delete {target.name} -- they have {invoice_count} invoice(s) on record. "
            "Deleting them would break that history. Consider leaving the account in place instead.",
        )

    db.delete(target)
    db.commit()
    return None
