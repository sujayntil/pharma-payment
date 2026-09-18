from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_admin
from ..security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


def _date_range_filter(date_from: Optional[date], date_to: Optional[date]):
    """Builds the invoice_date range conditions shared by dashboard and
    mr-performance. Both bounds are optional and inclusive."""
    conditions = []
    if date_from:
        conditions.append(models.Invoice.invoice_date >= date_from)
    if date_to:
        conditions.append(models.Invoice.invoice_date <= date_to)
    return conditions


@router.get("/dashboard")
def dashboard(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Totals, optionally scoped to an invoice_date range. Note this scopes
    by when the invoice was dated, not when payments came in -- an invoice
    dated inside the range still counts its full paid_amount even if some
    of that payment happened later."""
    q = db.query(models.Invoice)
    conditions = _date_range_filter(date_from, date_to)
    if conditions:
        q = q.filter(and_(*conditions))

    total_sales = q.with_entities(func.coalesce(func.sum(models.Invoice.total_amount), 0)).scalar()
    collected = q.with_entities(func.coalesce(func.sum(models.Invoice.paid_amount), 0)).scalar()

    total_invoices = q.count()
    paid = q.filter(models.Invoice.status == "PAID").count()
    partial = q.filter(models.Invoice.status == "PARTIAL").count()
    unpaid = q.filter(models.Invoice.status == "UNPAID").count()

    return {
        "total_sales": total_sales,
        "collected": collected,
        "outstanding": total_sales - collected,
        "total_invoices": total_invoices,
        "paid": paid,
        "partial": partial,
        "unpaid": unpaid,
    }


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
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.pending_amount >= threshold)
        .order_by(models.Invoice.pending_amount.desc())
        .all()
    )
    return [
        {
            "invoice_number": i.invoice_number,
            "customer": i.customer.name if i.customer else None,
            "pending_amount": i.pending_amount,
            "mr": i.mr.name if i.mr else None,
        }
        for i in invoices
    ]


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
