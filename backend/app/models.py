import enum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
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
    # Sessions (login tokens) issued before this moment are no longer accepted.
    # Set when the password is reset. NULL = never reset since this was added.
    tokens_valid_after = Column(DateTime, nullable=True)
    # Admin bell: newest payment id this user has seen (NULL = never opened).
    notifications_seen_payment_id = Column(Integer, nullable=True)
    notifications_seen_month_id = Column(Integer, nullable=True)  # bell: newest "month cleared" seen
    # "KING" (👑) or "QUEEN" (👸) on Home, the morning welcome and the MR
    # celebration. NULL means King.
    title = Column(String(8), nullable=True)

    invoices = relationship("Invoice", back_populates="mr")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(String)  # Chemist, Doctor, Distributor, Hospital, etc.
    phone = Column(String)
    alternate_phone = Column(String, nullable=True)
    # Which saved number the customer uses for WhatsApp: "main", "alternate" or None.
    whatsapp_on = Column(String(12), nullable=True)
    address = Column(String)
    # Optional area / locality, for Insights "by area" (filled in over time).
    area = Column(String(80), nullable=True)
    gstin = Column(String)
    mr_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at = Column(DateTime, server_default=func.now())

    invoices = relationship("Invoice", back_populates="customer")
    mr = relationship("User", foreign_keys=[mr_id])


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String)
    product_name = Column(String, nullable=False)
    mrp = Column(Float)
    gst_rate = Column(Float, default=0)


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index(
            "uq_invoices_external_key",
            "external_key",
            unique=True,
            postgresql_where=text("external_key IS NOT NULL"),
            sqlite_where=text("external_key IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, index=True, nullable=False)
    # Set only for invoices imported from Tally. A partial unique index makes
    # repeated uploads idempotent while leaving legacy MR-entered rows intact.
    external_key = Column(String(160), nullable=True)
    invoice_date = Column(Date)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    mr_id = Column(Integer, ForeignKey("users.id"))
    total_amount = Column(Float, nullable=False, default=0)
    taxable_amount = Column(Float)
    tax_amount = Column(Float)
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
    # Invoice history log (created / collected / reversed). Deleted with the invoice.
    events = relationship(
        "InvoiceEvent", back_populates="invoice", cascade="all, delete-orphan"
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
    # The MR the collection is credited to (the customer's assigned MR when
    # an Admin records it). Totals and MR-wise figures follow this field.
    collected_by = Column(Integer, ForeignKey("users.id"))
    # Who actually entered the row (Admin or MR). NULL on older rows, where
    # collected_by is treated as the recorder.
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Set on reversal rows: the payment this entry reverses.
    reversal_of_id = Column(
        Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Mandatory reason on reversal rows.
    reason = Column(Text, nullable=True)
    # Same value on every payment saved together by "Collect from customer"
    # (one amount split across invoices); NULL for single collections.
    batch_id = Column(String(36), nullable=True, index=True)

    invoice = relationship("Invoice", back_populates="payments")


class InvoiceEventType(str, enum.Enum):
    CREATED = "CREATED"
    COLLECTED = "COLLECTED"
    REVERSED = "REVERSED"
    # Undo from the Undo bar: the collection line stays in history, marked
    # as undone, followed by an "undone" line (balances count neither).
    COLLECTED_UNDONE = "COLLECTED_UNDONE"
    UNDONE = "UNDONE"


class InvoiceEvent(Base):
    """Append-only history log for an invoice's timeline."""

    __tablename__ = "invoice_events"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(
        Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = Column(String(20), nullable=False)
    payment_id = Column(
        Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount = Column(Float, nullable=True)
    mode = Column(String, nullable=True)
    reference = Column(String, nullable=True)
    reason = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_role = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    invoice = relationship("Invoice", back_populates="events")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class MrTarget(Base):
    """Monthly sales and collection targets per MR (Insights "Set targets").
    A month without its own row uses the latest earlier month's targets."""

    __tablename__ = "mr_targets"
    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_mr_target_user_month"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    month = Column(String(7), nullable=False)  # "2026-11"
    sales_target = Column(Float, nullable=True)
    collection_target = Column(Float, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ScheduledRun(Base):
    """Marks a once-off scheduled job as done (e.g. this week's Monday
    summary), so restarts or several server processes don't repeat it."""

    __tablename__ = "scheduled_runs"

    key = Column(String(60), primary_key=True)
    ran_at = Column(DateTime, server_default=func.now())


class MonthClearance(Base):
    """Every invoice of one invoice month assigned to an MR is paid
    ("October cleared"). Kept so the celebration shows once; undone_at is set
    when an undo or reversal opens the month again."""

    __tablename__ = "month_clearances"
    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_month_clearance_user_month"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    month = Column(String(7), nullable=False)  # "2026-10"
    on_time = Column(Boolean, nullable=False, default=True)
    invoice_count = Column(Integer, nullable=False, default=0)
    cleared_at = Column(DateTime, nullable=False)
    undone_at = Column(DateTime, nullable=True)
    # When the MR saw the celebration; empty = show it the next time they open
    # the app (an Admin collected the last invoice, or the month just ended).
    shown_at = Column(DateTime, nullable=True)
    # Who paid the last invoice (empty = noticed when the month ended), and
    # when the Admins were alerted ("Rahul cleared OCT"; only when the MR did it).
    cleared_by = Column(Integer, nullable=True)
    notified_at = Column(DateTime, nullable=True)


class RevokedToken(Base):
    """A session ended by "Log out" before its normal expiry."""

    __tablename__ = "revoked_tokens"

    jti = Column(String(64), primary_key=True)
    expires_at = Column(DateTime, nullable=False, index=True)


class LoginAttempt(Base):
    """Failed sign-in counter per employee code / client address (see login_guard.py)."""

    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(120), nullable=False, unique=True, index=True)
    failures = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime)
    locked_until = Column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, server_default=func.now())
    old_value = Column(JSON)
    new_value = Column(JSON)


class CustomerOverdueReminder(Base):
    __tablename__ = "customer_overdue_reminders"
    __table_args__ = (
        UniqueConstraint(
            "customer_id", "anchor_invoice_id", "reminder_date",
            name="uq_customer_overdue_reminder_schedule",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    anchor_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    reminder_date = Column(Date, nullable=False)
    attempted_at = Column(DateTime)
    sent_at = Column(DateTime)
