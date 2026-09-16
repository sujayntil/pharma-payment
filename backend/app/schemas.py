from datetime import date
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ---- Auth ----


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    name: str
    user_id: int


# ---- Users ----


class UserCreate(BaseModel):
    name: str
    employee_code: str
    role: str  # "MR" or "ADMIN"
    phone: Optional[str] = None
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    employee_code: str
    role: str
    phone: Optional[str] = None


# ---- Customers ----


class CustomerCreate(BaseModel):
    name: str
    type: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None


class CustomerOut(CustomerCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---- Invoices ----


class InvoiceItemIn(BaseModel):
    product_name: str
    batch: Optional[str] = None
    expiry: Optional[str] = None
    quantity: Optional[float] = 0
    free_quantity: Optional[float] = 0
    rate: Optional[float] = 0
    discount: Optional[float] = 0
    gst: Optional[float] = 0
    amount: Optional[float] = 0


class InvoiceCreate(BaseModel):
    invoice_number: str
    invoice_date: Optional[date] = None
    customer_name: str
    customer_type: Optional[str] = None
    total_amount: float
    paid_amount: float = 0
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None
    image_path: Optional[str] = None
    ai_confidence: Optional[Dict] = None
    items: Optional[List[InvoiceItemIn]] = []


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    invoice_date: Optional[date] = None
    total_amount: float
    paid_amount: float
    pending_amount: float
    status: str
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None
    mr_name: Optional[str] = None
    customer_name: Optional[str] = None


class ExtractResult(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    customer_name: Optional[str] = None
    customer_type: Optional[str] = None
    total_amount: Optional[float] = None
    payment_status: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None
    confidence: Optional[Dict] = None
    image_path: Optional[str] = None


# ---- Payments ----


class PaymentCreate(BaseModel):
    invoice_id: int
    amount: float
    mode: Optional[str] = None
    transaction_reference: Optional[str] = None
