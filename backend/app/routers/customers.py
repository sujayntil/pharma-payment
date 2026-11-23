from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..collection_info import last_collection_fields, latest_collections
from ..audit import customer_snapshot, write_audit
from ..customer_groups import customer_group_condition, parse_types
from ..database import get_db
from .invoices import apply_due_filter
from ..ledger_pdf import IST, build_ledger_pdf, nice_date
from ..ledger_xlsx import build_ledger_xlsx
from ..deps import get_current_user, require_admin
from ..utils import clean_search, normalize_phone, page_result, query_page, resolve_whatsapp_on, same_phone, set_customer_numbers

router = APIRouter(prefix="/customers", tags=["customers"])

# A shared ledger PDF lists at most this many invoices (newest pending first).
LEDGER_PDF_MAX = 2000


@router.get("")
def list_customers(
    search: str | None = None,
    mr_id: int | None = None,
    customer_type: str | None = None,
    sort: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    search = clean_search(search)
    if sort not in (None, "", "name", "pending", "invoices", "invoices_asc", "assignment"):
        raise HTTPException(422, "sort must be name, pending, invoices, invoices_asc or assignment")
    pending = func.coalesce(func.sum(models.Invoice.pending_amount), 0)
    q = db.query(
        models.Customer,
        func.count(models.Invoice.id).label("invoice_count"),
        pending.label("pending_amount"),
        func.max(models.Invoice.invoice_date).label("latest_invoice_date"),
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            models.Customer.name.ilike(term),
            models.Customer.type.ilike(term),
            models.Customer.phone.ilike(term),
            models.Customer.alternate_phone.ilike(term),
        ))
    if user.role != models.RoleEnum.ADMIN.value:
        # Only an Admin may browse every customer. Anyone else is limited to
        # the customers assigned to them, whatever mr_id they ask for.
        q = q.filter(models.Customer.mr_id == user.id)
    elif mr_id == 0:
        q = q.filter(models.Customer.mr_id.is_(None))  # "Unassigned" in the MR filter
    elif mr_id:
        q = q.filter(models.Customer.mr_id == mr_id)
    types = parse_types(customer_type)
    if types:
        q = q.filter(customer_group_condition(types))  # same groups as Insights; several allowed
    q = (
        q
        .outerjoin(models.Invoice, models.Invoice.customer_id == models.Customer.id)
        .group_by(models.Customer.id)
        # "pending": who owes most first; "invoices": most invoices first;
        # "assignment": unassigned first, then most invoices (Customer to MR
        # assignment); otherwise A-Z by name.
        .order_by(*(
            (pending.desc(), models.Customer.name) if sort == "pending"
            else (func.count(models.Invoice.id).desc(), models.Customer.name) if sort == "invoices"
            else (func.count(models.Invoice.id).asc(), models.Customer.name) if sort == "invoices_asc"
            # "assignment": customers with no MR on top, then most invoices first.
            else (models.Customer.mr_id.isnot(None), func.count(models.Invoice.id).desc(), models.Customer.name) if sort == "assignment"
            else (models.Customer.name,)
        ))
    )
    rows, total, page_size, page_offset = query_page(q, limit, offset, search)
    items = [
        schemas.CustomerOut(
            id=customer.id,
            name=customer.name,
            type=customer.type,
            phone=customer.phone,
            alternate_phone=customer.alternate_phone,
            whatsapp_on=customer.whatsapp_on,
            address=customer.address,
            area=customer.area,
            gstin=customer.gstin,
            mr_id=customer.mr_id,
            mr_name=customer.mr.name if customer.mr else None,
            invoice_count=count,
            pending_amount=float(pending_total or 0),
            latest_invoice_date=latest,
        )
        for customer, count, pending_total, latest in rows
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
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Customer name is required")
    duplicate = db.query(models.Customer).filter(func.lower(func.trim(models.Customer.name)) == name.lower()).first()
    if duplicate:
        raise HTTPException(409, f"Customer name '{name}' already exists")
    if payload.mr_id is not None:
        mr = db.get(models.User, payload.mr_id)
        if not mr or mr.role != models.RoleEnum.MR.value:
            raise HTTPException(422, "mr_id must refer to an MR")
    customer = models.Customer(
        name=name,
        type=(payload.type or "").strip() or None,
        address=(payload.address or "").strip() or None,
        area=(payload.area or "").strip() or None,
        gstin=(payload.gstin or "").strip() or None,
        mr_id=payload.mr_id,
    )
    try:
        set_customer_numbers(customer, payload.phone, payload.alternate_phone, payload.whatsapp_on,
                             "whatsapp_on" in payload.model_fields_set)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    db.add(customer)
    db.flush()
    write_audit(db, "customer_created", user, new=customer_snapshot(customer))
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
    before = customer_snapshot(customer)
    if "name" in data and data["name"]:
        name = data["name"].strip()
        duplicate = db.query(models.Customer).filter(
            func.lower(func.trim(models.Customer.name)) == name.lower(),
            models.Customer.id != customer.id,
        ).first()
        if duplicate:
            raise HTTPException(409, f"Customer name '{name}' already exists")
        customer.name = name
    for field in ("type", "address", "gstin", "area"):
        if field in data:
            setattr(customer, field, (data[field] or "").strip() or None)
    if "phone" in data:
        # Older numbers may not match today's rules, so an unchanged main
        # number is kept as it is; a new or changed one is checked like the MR's.
        if data["phone"] and same_phone(data["phone"], customer.phone):
            pass
        else:
            try:
                customer.phone = normalize_phone(data["phone"])
            except ValueError as exc:
                raise HTTPException(422, f"Phone: {exc}")
    if "alternate_phone" in data:
        # The main phone stays free-form for Admins (older data may not match
        # the rules); the new alternate number is always checked.
        try:
            alternate = normalize_phone(data["alternate_phone"])
        except ValueError as exc:
            raise HTTPException(422, f"Alternate phone: {exc}")
        if alternate and same_phone(alternate, customer.phone):
            raise HTTPException(422, "Alternate phone is the same as the main phone.")
        customer.alternate_phone = alternate
    if {"phone", "alternate_phone", "whatsapp_on"} & data.keys():
        try:
            customer.whatsapp_on = resolve_whatsapp_on(
                data.get("whatsapp_on"), customer.phone, customer.alternate_phone,
                customer.whatsapp_on, "whatsapp_on" in data,
            )
        except ValueError as exc:
            raise HTTPException(422, f"WhatsApp: {exc}")
    if "mr_id" in data:
        if data["mr_id"] is not None:
            mr = db.get(models.User, data["mr_id"])
            if not mr or mr.role != models.RoleEnum.MR.value:
                raise HTTPException(422, "mr_id must refer to an MR")
        customer.mr_id = data["mr_id"]
        db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id).update(
            {models.Invoice.mr_id: customer.mr_id}, synchronize_session=False
        )
    write_audit(db, "customer_updated", user, old=before, new=customer_snapshot(customer))
    db.commit()
    db.refresh(customer)
    return schemas.CustomerOut(
        id=customer.id,
        name=customer.name,
        type=customer.type,
        phone=customer.phone,
        alternate_phone=customer.alternate_phone,
        whatsapp_on=customer.whatsapp_on,
        address=customer.address,
        area=customer.area,
        gstin=customer.gstin,
        mr_id=customer.mr_id,
        mr_name=customer.mr.name if customer.mr else None,
        invoice_count=db.query(models.Invoice).filter(models.Invoice.customer_id == customer.id).count(),
    )


@router.post("/bulk-delete", status_code=204)
def delete_customers(
    payload: schemas.BulkDelete,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Admin multi-delete (up to 20): all or nothing, and only customers
    with no invoices (their ledger must stay)."""
    ids = list(dict.fromkeys(payload.ids))
    customers = db.query(models.Customer).filter(models.Customer.id.in_(ids)).all()
    if len(customers) != len(ids):
        raise HTTPException(404, "Some of these customers no longer exist. Refresh and try again.")
    with_invoices = [
        customer.name for customer in customers
        if db.query(models.Invoice.id).filter(models.Invoice.customer_id == customer.id).first()
    ]
    if with_invoices:
        raise HTTPException(400, f"Can't delete customers with invoices: {', '.join(with_invoices[:3])}{'…' if len(with_invoices) > 3 else ''}")
    for customer in customers:
        write_audit(db, "customer_deleted", user, old=customer_snapshot(customer))
        db.delete(customer)
    db.commit()
    return None


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
    write_audit(db, "customer_deleted", user, old=customer_snapshot(customer))
    db.delete(customer)
    db.commit()
    return None


def _ledger_query(db, user, customer_id, search, date_from, date_to, status, due=None, overdue_days=None):
    """The ledger's customer and its filtered invoice query (screen and PDF)."""
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
    search = clean_search(search)
    invoice_query = db.query(models.Invoice).filter(models.Invoice.customer_id == customer_id)
    if date_from:
        invoice_query = invoice_query.filter(models.Invoice.invoice_date >= date_from)
    if date_to:
        invoice_query = invoice_query.filter(models.Invoice.invoice_date <= date_to)
    if status:
        invoice_query = invoice_query.filter(models.Invoice.status == status.upper())
    invoice_query = apply_due_filter(invoice_query, due, overdue_days)
    if search and search.strip():
        term = f"%{search.strip()}%"
        invoice_query = invoice_query.filter(or_(
            models.Invoice.invoice_number.ilike(term),
            models.Invoice.payment_mode.ilike(term),
            models.Invoice.status.ilike(term),
            models.Invoice.mr.has(models.User.name.ilike(term)),
        ))
    return customer, invoice_query, search


def _ledger_order(invoice_query):
    # Pending invoices first, oldest first (the order they are chased in);
    # then settled ones, newest first.
    is_pending = models.Invoice.pending_amount > 0
    return invoice_query.order_by(
        case((is_pending, 0), else_=1),
        case((is_pending, models.Invoice.invoice_date), else_=None).asc(),
        models.Invoice.invoice_date.desc(),
        models.Invoice.id.desc(),
    )


@router.get("/{customer_id}/ledger")
def customer_ledger(
    customer_id: int,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    due: str | None = None,
    overdue_days: int | None = None,
    limit: int | None = None,
    offset: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    customer, invoice_query, search = _ledger_query(db, user, customer_id, search, date_from, date_to, status, due, overdue_days)
    # Totals come from the exact same filtered set as the rows (search
    # included), so the summary always matches what is listed.
    total_invoiced, total_paid = invoice_query.with_entities(
        func.coalesce(func.sum(models.Invoice.total_amount), 0),
        func.coalesce(func.sum(models.Invoice.paid_amount), 0),
    ).one()
    invoice_query = _ledger_order(invoice_query)
    invoices, invoice_count, page_size, page_offset = query_page(
        invoice_query, limit, offset, search
    )

    latest = latest_collections(db, [i.id for i in invoices])
    result = {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "type": customer.type,
            "phone": customer.phone,
            "alternate_phone": customer.alternate_phone,
            "whatsapp_on": customer.whatsapp_on,
            "mr_name": customer.mr.name if customer.mr else None,
            # For "Edit details" (Admin) and the type · area line.
            "mr_id": customer.mr_id,
            "area": customer.area,
            "address": customer.address,
            "gstin": customer.gstin,
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
                "pending_amount": i.pending_amount,
                "status": i.status,
                "mode": i.payment_mode,
                "mr": i.mr.name if i.mr else None,
                "paid_amount": i.paid_amount,
                **last_collection_fields(latest.get(i.id)),
            }
            for i in invoices
        ],
    }
    return result


def _ledger_export(db, user, customer_id, search, date_from, date_to, status, due=None, overdue_days=None):
    """Everything the PDF and Excel need: same filters and order as the
    screen, every matching invoice (no paging), each with its payments."""
    customer, invoice_query, search = _ledger_query(db, user, customer_id, search, date_from, date_to, status, due, overdue_days)
    totals = invoice_query.with_entities(
        func.coalesce(func.sum(models.Invoice.total_amount), 0),
        func.coalesce(func.sum(models.Invoice.paid_amount), 0),
    ).one()
    invoices = _ledger_order(invoice_query).limit(LEDGER_PDF_MAX).all()
    payments = (
        db.query(models.Payment)
        .filter(models.Payment.invoice_id.in_([i.id for i in invoices] or [0]))
        .order_by(models.Payment.payment_date.asc(), models.Payment.id.asc())
        .all()
    )
    by_invoice = {}
    for p in payments:
        by_invoice.setdefault(p.invoice_id, []).append(p)
    ids = {p.collected_by for p in payments if p.collected_by}
    collectors = dict(db.query(models.User.id, models.User.name).filter(models.User.id.in_(ids)).all()) if ids else {}
    scope = []
    if date_from or date_to:
        scope.append(f"{nice_date(date_from) if date_from else 'Start'} – {nice_date(date_to) if date_to else 'today'}")
    if status:
        scope.append({"PAID": "Paid only", "PARTIAL": "Part paid only", "UNPAID": "Unpaid only"}[status.upper()])
    if (due or "").lower() == "overdue":
        scope.append(f"Overdue by more than {overdue_days} days" if overdue_days else "Overdue only")
    elif (due or "").lower() == "notdue":
        scope.append("Not yet due")
    if search and search.strip():
        scope.append(f"Search: “{search.strip()}”")
    safe = "".join(ch for ch in customer.name if ch.isalnum() or ch in " .-_").strip() or "Customer"
    mr_name = customer.mr.name if customer.mr else None
    return customer, mr_name, invoices, by_invoice, collectors, totals, scope, safe


@router.get("/{customer_id}/ledger/pdf")
def customer_ledger_pdf(
    customer_id: int,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    due: str | None = None,
    overdue_days: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """The ledger as a PDF to share (Admin and the customer's MR)."""
    customer, mr_name, invoices, by_invoice, collectors, totals, scope, safe = _ledger_export(
        db, user, customer_id, search, date_from, date_to, status, due, overdue_days)
    pdf = build_ledger_pdf(customer, mr_name, invoices, by_invoice, collectors, totals, scope)
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="Ledger - {safe}.pdf"',
        "Cache-Control": "no-store",
    })


@router.get("/{customer_id}/ledger/xlsx")
def customer_ledger_xlsx(
    request: Request,
    customer_id: int,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    due: str | None = None,
    overdue_days: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Admin: the ledger as Excel (Invoices and Payments sheets)."""
    customer, mr_name, invoices, by_invoice, collectors, totals, scope, safe = _ledger_export(
        db, user, customer_id, search, date_from, date_to, status, due, overdue_days)
    content = build_ledger_xlsx(customer, mr_name, invoices, by_invoice, collectors, totals, scope, datetime.now(IST).date())
    write_audit(db, "ledger_exported", user, new={"customer": customer.name, "invoices": len(invoices), "filters": dict(request.query_params)})
    db.commit()
    return Response(content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={
        "Content-Disposition": f'attachment; filename="Ledger - {safe}.xlsx"',
        "Cache-Control": "no-store",
    })
