import enum

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class RoleEnum(str, enum.Enum):
    MR = "MR"
    ADMIN = "ADMIN"


class StatusEnum(str, enum.Enum):
    PAID = "PAID"
    PARTIAL = "PARTIAL"
    UNPAID = "UNPAID"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    employee_code = Column(String, unique=True, nullable=False, index=True)
    role = Column(String, nullable=False, default=RoleEnum.MR.value)
    phone = Column(String)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    invoices = relationship("Invoice", back_populates="mr")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(String)  # Chemist, Doctor, Distributor, Hospital, etc.
    phone = Column(String)
    address = Column(String)
    gstin = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    invoices = relationship("Invoice", back_populates="customer")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String)
    product_name = Column(String, nullable=False)
    mrp = Column(Float)
    gst_rate = Column(Float, default=0)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, index=True, nullable=False)
    invoice_date = Column(Date)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    mr_id = Column(Integer, ForeignKey("users.id"))
    total_amount = Column(Float, nullable=False, default=0)
    paid_amount = Column(Float, nullable=False, default=0)
    pending_amount = Column(Float, nullable=False, default=0)
    status = Column(String, default=StatusEnum.UNPAID.value)
    payment_mode = Column(String)
    remarks = Column(Text)
    ai_confidence = Column(JSON)
    image_path = Column(String)
    created_at = Column(DateTime, server_default=func.now())

    customer = relationship("Customer", back_populates="invoices")
    mr = relationship("User", back_populates="invoices")
    items = relationship(
        "InvoiceItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    payments = relationship(
        "Payment", back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    product_name = Column(String)
    batch = Column(String)
    expiry = Column(String)
    quantity = Column(Float, default=0)
    free_quantity = Column(Float, default=0)
    rate = Column(Float, default=0)
    discount = Column(Float, default=0)
    gst = Column(Float, default=0)
    amount = Column(Float, default=0)

    invoice = relationship("Invoice", back_populates="items")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    amount = Column(Float, nullable=False)
    mode = Column(String)
    transaction_reference = Column(String)
    payment_date = Column(DateTime, server_default=func.now())
    collected_by = Column(Integer, ForeignKey("users.id"))

    invoice = relationship("Invoice", back_populates="payments")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, server_default=func.now())
    old_value = Column(JSON)
    new_value = Column(JSON)
