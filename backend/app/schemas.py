from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


# ---- Auth ----


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    name: str
    user_id: int
    title: str = "KING"
    must_change_password: bool = False


class PasswordChange(BaseModel):
    # Not needed while a new password is required (they just signed in).
    current_password: Optional[str] = Field(default=None, max_length=200)
    new_password: str = Field(max_length=200)


# ---- Users ----


class UserCreate(BaseModel):
    name: str
    employee_code: str
    role: str  # "MR" or "ADMIN"
    phone: Optional[str] = None
    password: str
    title: Optional[str] = None  # "KING" (default) or "QUEEN"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    employee_code: str
    role: str
    phone: Optional[str] = None
    title: str = "KING"
    must_change_password: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def _default_title(cls, value):
        return value or "KING"

    @field_validator("must_change_password", mode="before")
    @classmethod
    def _flag(cls, value):
        return bool(value)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None  # "MR" or "ADMIN"
    password: Optional[str] = None  # leave unset to keep the current password
    title: Optional[str] = None  # "KING" or "QUEEN"


# ---- Customers ----


class CustomerBase(BaseModel):
    name: str
    type: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = Field(default=None, max_length=80)
    gstin: Optional[str] = None


class CustomerCreate(CustomerBase):
    """Admin "Add customer". Blank numbers are fine; filled ones are checked."""
    name: str = Field(min_length=1, max_length=255)
    alternate_phone: Optional[str] = None
    whatsapp_on: Optional[str] = None
    mr_id: Optional[int] = None


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    alternate_phone: Optional[str] = None
    whatsapp_on: Optional[str] = None
    mr_id: Optional[int] = None
    mr_name: Optional[str] = None
    invoice_count: int = 0
    # Admin list: what the customer still owes and when they were last billed.
    pending_amount: float = 0
    latest_invoice_date: Optional[date] = None


class CustomerMrMapping(BaseModel):
    mr_id: Optional[int] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    type: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    whatsapp_on: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = Field(default=None, max_length=80)
    gstin: Optional[str] = None
    mr_id: Optional[int] = None


class CustomerContactUpdate(BaseModel):
    """An MR's change to a customer's phone numbers. Blank clears."""
    phone: Optional[str] = Field(default=None, max_length=40)
    alternate_phone: Optional[str] = Field(default=None, max_length=40)
    # "main", "alternate" or blank for none. Left out = keep / pick automatically.
    whatsapp_on: Optional[str] = Field(default=None, max_length=12)


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
    confirm_duplicate: bool = False  # set true to save anyway after seeing the duplicate warning


class ManualInvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=120)
    invoice_date: date
    customer_id: Optional[int] = None
    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    total_amount: float = Field(gt=0)
    # A new customer's details. For an existing customer only a missing phone
    # is filled in; nothing already saved is overwritten from this form.
    customer_type: Optional[str] = None
    mr_id: Optional[int] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    whatsapp_on: Optional[str] = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    invoice_date: Optional[date] = None
    total_amount: float
    taxable_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    paid_amount: float
    pending_amount: float
    status: str
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None
    mr_name: Optional[str] = None
    customer_id: Optional[int] = None  # additive: ticked invoices are grouped by customer
    customer_name: Optional[str] = None
    # For the call / WhatsApp icons on invoice cards.
    customer_phone: Optional[str] = None
    customer_alternate_phone: Optional[str] = None
    customer_whatsapp_on: Optional[str] = None
    customer_type: Optional[str] = None  # for the overdue colour (40 days; 60 for distributors)
    # Latest entry in the payments ledger -- lets an MR see when an Admin
    # recorded or reversed a collection on their invoice.
    last_collection_by: Optional[str] = None
    last_collection_by_id: Optional[int] = None
    last_collection_by_role: Optional[str] = None
    last_collection_by_admin: bool = False
    last_collection_at: Optional[datetime] = None
    last_collection_amount: Optional[float] = None
    last_collection_is_reversal: bool = False


class InvoiceUpdate(BaseModel):
    # Header-level corrections only -- paid_amount is deliberately not here,
    # since it's derived from the Payments table (via POST /payments) to
    # keep the collection history trustworthy. Editing total_amount still
    # recomputes status/pending against whatever's already been paid.
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    customer_name: Optional[str] = None
    customer_type: Optional[str] = None
    total_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None


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


def _required_mode(value):
    """Every new collection says how it was paid (Cash, UPI, Cheque...)."""
    text = (value or "").strip() if isinstance(value, str) else value
    if not text:
        raise ValueError("Choose how the customer paid (Cash, UPI, Cheque...)")
    return text[:40]


class PaymentCreate(BaseModel):
    invoice_id: int
    amount: float
    mode: str
    transaction_reference: Optional[str] = Field(default=None, max_length=120)

    _mode = field_validator("mode", mode="before")(_required_mode)


class PaymentBatchCreate(BaseModel):
    """Collect from customer: one amount split over the ticked invoices,
    oldest first."""
    customer_id: int
    amount: float = Field(gt=0)
    invoice_ids: list[int] = Field(min_length=1, max_length=200)
    # Collect opened from one invoice: fill that one first, then oldest first.
    first_invoice_id: Optional[int] = None
    mode: str
    transaction_reference: Optional[str] = Field(default=None, max_length=120)

    _mode = field_validator("mode", mode="before")(_required_mode)


class PaymentModeUpdate(BaseModel):
    """Admin corrects how a collection was paid (amount and date stay)."""
    mode: str
    transaction_reference: Optional[str] = Field(default=None, max_length=120)

    _mode = field_validator("mode", mode="before")(_required_mode)


class PaymentBatchesCreate(BaseModel):
    """Several customers at once: one PaymentBatchCreate per customer."""
    groups: list[PaymentBatchCreate] = Field(min_length=1, max_length=50)


class BulkDelete(BaseModel):
    """Admin multi-delete: at most 20 at a time, as a safety net."""
    ids: list[int] = Field(min_length=1, max_length=20)


class PaymentReversalCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=200)
    amount: Optional[float] = Field(default=None, gt=0)  # defaults to everything still reversible


class CollectionStatusUpdate(BaseModel):
    status: str
    mode: Optional[str] = None  # used when marking PAID
    transaction_reference: Optional[str] = None  # used when marking PAID
    reason: Optional[str] = Field(default=None, max_length=200)  # used when marking UNPAID


class PushSubscriptionCreate(BaseModel):
    endpoint: AnyHttpUrl
    keys: dict[str, str]


class PushSubscriptionDelete(BaseModel):
    endpoint: AnyHttpUrl


class MrTargetIn(BaseModel):
    mr_id: int
    sales_target: Optional[float] = Field(default=None, ge=0, le=1e11)
    collection_target: Optional[float] = Field(default=None, ge=0, le=1e11)


class MrTargetsSave(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    targets: list[MrTargetIn] = Field(max_length=500)
