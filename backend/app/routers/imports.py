"""Admin import of Tally's weekly sales-book XLSX files."""

import hashlib
import math
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from openpyxl import load_workbook
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_admin

router = APIRouter(prefix="/admin", tags=["admin-imports"])


def _key(value: object) -> str:
    """Normalize names and invoice identifiers for matching only."""
    return " ".join(str(value or "").strip().casefold().split())


def _bill_key(value: object) -> str:
    return str(value or "").strip().casefold()


def _header_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def _parse_date(value: object) -> Optional[date]:
    if value is None or str(value).strip() == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    raise ValueError("date must look like DD-MM-YYYY")


def _parse_amount(value: object) -> float:
    if value is None or str(value).strip() == "":
        raise ValueError("bill amount is blank")
    raw = str(value).strip().replace(",", "").replace("₹", "").strip()
    try:
        amount = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("bill amount is not a valid number") from exc
    if not amount.is_finite() or amount < 0:
        raise ValueError("bill amount must be a non-negative number")
    parsed = float(amount)
    if not math.isfinite(parsed):
        raise ValueError("bill amount is outside the supported range")
    return parsed


def _parse_optional_amount(value: object) -> Optional[float]:
    if value is None or str(value).strip() == "":
        return None
    return _parse_amount(value)


def _find_header(rows):
    aliases = {
        "invoice_date": {"date", "billdate", "invoicedate"},
        "invoice_number": {"billno", "billnumber", "invoiceno", "invoicenumber"},
        "customer_name": {"partyname", "customername", "customer", "party"},
        "total_amount": {"billamt", "billamount", "totalamount", "amount"},
        "taxable_amount": {"taxable", "taxableamount"},
        "tax_amount": {"tax", "taxamount"},
    }
    required = {"invoice_date", "invoice_number", "customer_name", "total_amount"}
    for row_number, row in enumerate(rows[:15], start=1):
        found = {}
        for col_number, value in enumerate(row):
            normalized = _header_key(value)
            for field, names in aliases.items():
                if normalized in names:
                    found[field] = col_number
        if required.issubset(found):
            return row_number, found
    raise ValueError("Could not find Date, Bill No., Party Name and Bill Amt. columns")


def _same_invoice(
    invoice, customer_name: str, invoice_date, total_amount: float,
    taxable_amount: Optional[float], tax_amount: Optional[float],
) -> bool:
    core_fields_match = (
        _key(invoice.customer.name if invoice.customer else "") == _key(customer_name)
        and invoice.invoice_date == invoice_date
        and abs(float(invoice.total_amount or 0) - total_amount) < 0.01
    )
    if not core_fields_match or not invoice.external_key:
        return core_fields_match
    return (
        abs(float(invoice.taxable_amount or 0) - float(taxable_amount or 0)) < 0.01
        and abs(float(invoice.tax_amount or 0) - float(tax_amount or 0)) < 0.01
    )


@router.post("/import-invoices")
async def import_invoices(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    """Import the sales-book header rows; the invoice's Bill Amt is collectible."""
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(400, "Upload an Excel .xlsx file")
    content = await file.read(12 * 1024 * 1024 + 1)
    if len(content) > 12 * 1024 * 1024:
        raise HTTPException(413, "Excel file must be 12 MB or smaller")
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        header_row, columns = _find_header(rows)
    except (ValueError, OSError, KeyError) as exc:
        raise HTTPException(400, f"Could not read this sales book: {exc}") from exc
    except Exception as exc:
        # openpyxl raises several zip/xml exceptions for malformed workbooks.
        raise HTTPException(400, "Could not read this Excel file") from exc

    invoice_number_col = columns["invoice_number"]
    bill_keys = {
        _bill_key(row[invoice_number_col])
        for row in rows[header_row:]
        if invoice_number_col < len(row) and row[invoice_number_col] is not None
    }
    bill_keys.discard("")
    existing_invoices = (
        db.query(models.Invoice)
        .filter(func.lower(func.trim(models.Invoice.invoice_number)).in_(bill_keys))
        .all()
        if bill_keys
        else []
    )
    invoice_by_key = {}
    for invoice in existing_invoices:
        invoice_by_key.setdefault(_bill_key(invoice.invoice_number), []).append(invoice)
    customers = db.query(models.Customer).all()
    customer_by_key = {_key(customer.name): customer for customer in customers}

    result = {
        "filename": file.filename,
        "created": 0,
        "duplicates": 0,
        "conflicts": [],
        "row_errors": [],
        "unmapped_customers": {},
    }

    def cell(row, field):
        idx = columns.get(field)
        if idx is None:
            return None
        return row[idx] if idx < len(row) else None

    try:
        for row_number, row in enumerate(rows[header_row:], start=header_row + 1):
            if not any(value is not None and str(value).strip() for value in row):
                continue
            try:
                bill_no = str(cell(row, "invoice_number") or "").strip()
                customer_name = str(cell(row, "customer_name") or "").strip()
                invoice_date = _parse_date(cell(row, "invoice_date"))
                total_amount = _parse_amount(cell(row, "total_amount"))
                taxable_amount = _parse_optional_amount(cell(row, "taxable_amount"))
                tax_amount = _parse_optional_amount(cell(row, "tax_amount"))
                if not bill_no:
                    raise ValueError("bill number is blank")
                if not customer_name:
                    raise ValueError("party name is blank")
                if invoice_date is None:
                    raise ValueError("date is blank")

                bill_key = _bill_key(bill_no)
                same_number = invoice_by_key.get(bill_key, [])
                if same_number:
                    if any(_same_invoice(i, customer_name, invoice_date, total_amount, taxable_amount, tax_amount) for i in same_number):
                        result["duplicates"] += 1
                    else:
                        result["conflicts"].append({
                            "row": row_number,
                            "invoice_number": bill_no,
                            "message": "Bill number already exists with different customer, date, amount, or tax details",
                        })
                    continue

                customer = customer_by_key.get(_key(customer_name))
                if customer is None:
                    customer = models.Customer(name=customer_name)
                    db.add(customer)
                    db.flush()
                    customer_by_key[_key(customer_name)] = customer

                external_key = "tally:" + hashlib.sha256(bill_key.encode("utf-8")).hexdigest()
                invoice = models.Invoice(
                    invoice_number=bill_no,
                    invoice_date=invoice_date,
                    customer_id=customer.id,
                    mr_id=customer.mr_id,
                    total_amount=total_amount,
                    taxable_amount=taxable_amount,
                    tax_amount=tax_amount,
                    paid_amount=0,
                    pending_amount=total_amount,
                    status="UNPAID" if total_amount else "PAID",
                    external_key=external_key,
                )
                db.add(invoice)
                db.flush()
                invoice_by_key.setdefault(bill_key, []).append(invoice)
                result["created"] += 1
                if customer.mr_id is None:
                    entry = result["unmapped_customers"].setdefault(
                        str(customer.id),
                        {"customer_id": customer.id, "customer_name": customer.name, "invoice_count": 0},
                    )
                    entry["invoice_count"] += 1
            except (TypeError, ValueError) as exc:
                result["row_errors"].append({"row": row_number, "message": str(exc)})
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An invoice in this upload was imported at the same time. Reload invoices and retry.") from exc
    except Exception:
        db.rollback()
        raise

    result["unmapped_customers"] = list(result["unmapped_customers"].values())
    result["skipped"] = result["duplicates"] + len(result["conflicts"]) + len(result["row_errors"])
    return result


@router.put("/customers/{customer_id}/mr", response_model=dict)
def map_customer_to_mr(
    customer_id: int,
    payload: schemas.CustomerMrMapping,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_admin),
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(404, "Customer not found")
    mr_id = payload.mr_id
    mr = None
    if mr_id is not None:
        mr = db.query(models.User).filter(models.User.id == mr_id).first()
        if mr is None or mr.role != models.RoleEnum.MR.value:
            raise HTTPException(400, "Select a valid MR")
    customer.mr_id = mr.id if mr else None
    # Imported invoices left unassigned become visible to the MR after mapping.
    # Existing manually assigned invoices are preserved.
    if mr:
        db.query(models.Invoice).filter(
            models.Invoice.customer_id == customer.id,
            models.Invoice.mr_id.is_(None),
        ).update({models.Invoice.mr_id: mr.id}, synchronize_session=False)
    db.commit()
    return {"customer_id": customer.id, "mr_id": customer.mr_id, "mr_name": mr.name if mr else None}
