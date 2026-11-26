"""Margin calculator (Admin only).

Products and schemes here are typed in by hand for the calculator; they are
not the app's Products and never touch invoices. Customers are the app's real
customers (name and type only), each linked to one scheme per product.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .. import models
from ..audit import write_audit
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/admin/margin", tags=["margin"], dependencies=[Depends(require_admin)])

MAX_PRODUCTS = 200
MAX_SCHEMES = 50


class ProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, max_length=80)
    mrp: Optional[float] = Field(None, ge=0, le=10_000_000)
    gst: Optional[float] = Field(None, ge=0, le=100)
    retailer_margin: Optional[float] = Field(None, ge=0, le=100)
    stockist_margin: Optional[float] = Field(None, ge=0, le=100)
    cost: Optional[float] = Field(None, ge=0, le=10_000_000)
    purchase_gst: Optional[float] = Field(None, ge=0, le=100)
    batch: Optional[int] = Field(None, ge=0, le=100_000_000)


class SchemeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, max_length=80)
    sell_at: Optional[Literal["mrp", "ptr", "pts"]] = None
    discount: Optional[float] = Field(None, ge=0, le=100)
    buy: Optional[int] = Field(None, ge=0, le=100_000)
    free: Optional[int] = Field(None, ge=0, le=100_000)


class LinkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: int
    product_id: int
    scheme_id: Optional[int] = None  # None = not supplied


def _scheme(s: models.MarginScheme) -> dict:
    return {"id": s.id, "product_id": s.product_id, "name": s.name, "sell_at": s.sell_at,
            "discount": s.discount, "buy": s.buy, "free": s.free}


def _product(p: models.MarginProduct) -> dict:
    return {"id": p.id, "name": p.name, "mrp": p.mrp, "gst": p.gst, "retailer_margin": p.retailer_margin,
            "stockist_margin": p.stockist_margin, "cost": p.cost, "purchase_gst": p.purchase_gst,
            "batch": p.batch, "schemes": [_scheme(s) for s in p.schemes]}


def _get_product(db: Session, product_id: int) -> models.MarginProduct:
    product = db.get(models.MarginProduct, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


def _get_scheme(db: Session, scheme_id: int) -> models.MarginScheme:
    scheme = db.get(models.MarginScheme, scheme_id)
    if not scheme:
        raise HTTPException(404, "Scheme not found")
    return scheme


def _apply(obj, data: BaseModel) -> None:
    """Only the fields sent; null clears a value (an emptied box)."""
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "name":
            value = (value or "").strip()
        setattr(obj, key, value)


@router.get("")
def overview(db: Session = Depends(get_db)):
    products = db.query(models.MarginProduct).order_by(models.MarginProduct.id).all()
    links = db.query(models.CustomerScheme).all()
    return {
        "products": [_product(p) for p in products],
        "links": [{"customer_id": l.customer_id, "product_id": l.product_id, "scheme_id": l.scheme_id} for l in links],
    }


@router.get("/customers")
def customers(db: Session = Depends(get_db)):
    """Name and type only: no sales, invoices or contact details."""
    rows = db.query(models.Customer.id, models.Customer.name, models.Customer.type).order_by(models.Customer.name).all()
    return [{"id": r.id, "name": r.name, "type": r.type} for r in rows]


@router.post("/products")
def create_product(body: ProductIn, db: Session = Depends(get_db)):
    if db.query(models.MarginProduct).count() >= MAX_PRODUCTS:
        raise HTTPException(400, f"Up to {MAX_PRODUCTS} products")
    # Starts empty, with one empty scheme to fill in.
    product = models.MarginProduct(name="")
    _apply(product, body)
    product.schemes.append(models.MarginScheme(name=""))
    db.add(product)
    db.commit()
    db.refresh(product)
    return _product(product)


@router.patch("/products/{product_id}")
def update_product(product_id: int, body: ProductIn, db: Session = Depends(get_db)):
    product = _get_product(db, product_id)
    _apply(product, body)
    db.commit()
    db.refresh(product)
    return _product(product)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    product = _get_product(db, product_id)
    write_audit(db, "margin_product_deleted", user, old=_product(product))
    db.query(models.CustomerScheme).filter(models.CustomerScheme.product_id == product.id).delete(synchronize_session=False)
    db.delete(product)
    db.commit()


@router.post("/products/{product_id}/schemes")
def create_scheme(product_id: int, body: SchemeIn, db: Session = Depends(get_db)):
    product = _get_product(db, product_id)
    if len(product.schemes) >= MAX_SCHEMES:
        raise HTTPException(400, f"Up to {MAX_SCHEMES} schemes per product")
    scheme = models.MarginScheme(product_id=product.id, name="")
    _apply(scheme, body)
    db.add(scheme)
    db.commit()
    db.refresh(scheme)
    return _scheme(scheme)


@router.patch("/schemes/{scheme_id}")
def update_scheme(scheme_id: int, body: SchemeIn, db: Session = Depends(get_db)):
    scheme = _get_scheme(db, scheme_id)
    _apply(scheme, body)
    db.commit()
    db.refresh(scheme)
    return _scheme(scheme)


@router.delete("/schemes/{scheme_id}", status_code=204)
def delete_scheme(scheme_id: int, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    scheme = _get_scheme(db, scheme_id)
    others = db.query(models.MarginScheme).filter(models.MarginScheme.product_id == scheme.product_id,
                                                  models.MarginScheme.id != scheme.id).count()
    if not others:
        raise HTTPException(400, "A product needs at least one scheme")
    write_audit(db, "margin_scheme_deleted", user, old=_scheme(scheme))
    # Customers on this scheme go back to "not supplied" for the product.
    db.query(models.CustomerScheme).filter(models.CustomerScheme.scheme_id == scheme.id).delete(synchronize_session=False)
    db.delete(scheme)
    db.commit()


@router.put("/links", status_code=204)
def set_link(body: LinkIn, db: Session = Depends(get_db)):
    if not db.get(models.Customer, body.customer_id):
        raise HTTPException(404, "Customer not found")
    _get_product(db, body.product_id)
    link = db.get(models.CustomerScheme, (body.customer_id, body.product_id))
    if body.scheme_id is None:
        if link:
            db.delete(link)
            db.commit()
        return
    scheme = _get_scheme(db, body.scheme_id)
    if scheme.product_id != body.product_id:
        raise HTTPException(400, "That scheme belongs to another product")
    if link:
        link.scheme_id = scheme.id
    else:
        db.add(models.CustomerScheme(customer_id=body.customer_id, product_id=body.product_id, scheme_id=scheme.id))
    db.commit()
