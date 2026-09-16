from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_admin
from ..security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    total_sales = db.query(func.coalesce(func.sum(models.Invoice.total_amount), 0)).scalar()
    collected = db.query(func.coalesce(func.sum(models.Invoice.paid_amount), 0)).scalar()

    total_invoices = db.query(models.Invoice).count()
    paid = db.query(models.Invoice).filter(models.Invoice.status == "PAID").count()
    partial = db.query(models.Invoice).filter(models.Invoice.status == "PARTIAL").count()
    unpaid = db.query(models.Invoice).filter(models.Invoice.status == "UNPAID").count()

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
def mr_performance(db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    rows = (
        db.query(
            models.User.id,
            models.User.name,
            func.coalesce(func.sum(models.Invoice.total_amount), 0).label("sales"),
            func.coalesce(func.sum(models.Invoice.paid_amount), 0).label("collected"),
            func.coalesce(func.sum(models.Invoice.pending_amount), 0).label("pending"),
        )
        .outerjoin(models.Invoice, models.Invoice.mr_id == models.User.id)
        .filter(models.User.role == models.RoleEnum.MR.value)
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
