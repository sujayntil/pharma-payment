from .models import StatusEnum


def query_page(query, limit: int | None, offset: int | None, search: str | None):
    """Page normal lists; a non-empty search returns every matching row."""
    total = query.order_by(None).count()
    if search and search.strip():
        return query.all(), total, None, 0
    if limit is None and offset is None:
        return query.all(), total, None, 0
    page_size = min(max(limit or 50, 1), 100)
    page_offset = max(offset or 0, 0)
    return query.offset(page_offset).limit(page_size).all(), total, page_size, page_offset


def page_result(items, total: int, limit: int | None, offset: int):
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def compute_status(total_amount: float, paid_amount: float) -> tuple[str, float]:
    """Derive payment status + pending amount. Pending is always
    total - paid and is never allowed to go negative or be set independently,
    matching the "don't let pending drift from amount - paid" rule."""
    total_amount = total_amount or 0
    paid_amount = paid_amount or 0
    pending = round(total_amount - paid_amount, 2)

    if pending <= 0:
        return StatusEnum.PAID.value, 0.0
    if paid_amount <= 0:
        return StatusEnum.UNPAID.value, pending
    return StatusEnum.PARTIAL.value, pending


MAX_SEARCH_LENGTH = 100
INVOICE_STATUSES = {StatusEnum.PAID.value, StatusEnum.PARTIAL.value, StatusEnum.UNPAID.value}


def clean_search(search: str | None) -> str | None:
    """Trim and length-limit a free-text filter. Values are always bound as
    query parameters, so this only keeps the input sane. An empty value
    stays empty (not None) so response shapes are unchanged."""
    if search is None:
        return None
    return " ".join(search.split())[:MAX_SEARCH_LENGTH]


def clean_status(status: str | None, allowed=INVOICE_STATUSES) -> str | None:
    """Upper-cases a status filter; raises ValueError for unknown values."""
    if status is None or not status.strip():
        return None
    value = status.strip().upper()
    if value not in allowed:
        raise ValueError(value)
    return value


_PHONE_ALLOWED = set("0123456789 +-()")
PHONE_FORMAT_HELP = "Enter a 10-digit mobile number or a landline with area code, e.g. 080-12345678."


def normalize_phone(value: str | None) -> str | None:
    """Checks an Indian phone number and returns it in a tidy form.

    Mobile:   10 digits starting 6-9. "+91" / "91" in front, or "0" in front
              of a 9-series number, is accepted and dropped. Stored as the
              10 digits, e.g. "9876543210".
    Landline: 11 digits = 0 + area code (01..08) + number, e.g.
              "080-12345678", "0821 2345678". Stored as typed, tidied.
              (A 0 followed by 6/7/8 is always read as a landline, since
              area codes like 080 or 0712 look the same as 0+mobile.)
    Blank means "no number" (None). Raises ValueError for anything else.
    """
    if value is None:
        return None
    text = " ".join(value.split())
    if not text:
        return None
    if any(ch not in _PHONE_ALLOWED for ch in text) or text.count("+") > 1 or ("+" in text and not text.startswith("+")):
        raise ValueError(PHONE_FORMAT_HELP)
    digits = "".join(ch for ch in text if ch.isdigit())
    if text.startswith("+"):
        mobile = digits[2:] if digits.startswith("91") else ""
    elif len(digits) == 12 and digits.startswith("91"):
        mobile = digits[2:]
    elif len(digits) == 11 and digits.startswith("09"):
        mobile = digits[1:]
    else:
        mobile = digits
    if len(mobile) == 10 and mobile[0] in "6789":
        return mobile
    if not text.startswith("+") and len(digits) == 11 and digits[0] == "0" and digits[1] in "12345678":
        tidy = text.replace("(", "").replace(")", "")
        tidy = " ".join(tidy.split())
        while "--" in tidy:
            tidy = tidy.replace("--", "-")
        return tidy.replace(" - ", "-").strip(" -")
    raise ValueError(PHONE_FORMAT_HELP)


def same_phone(a: str | None, b: str | None) -> bool:
    """True when two stored numbers are the same once punctuation is ignored."""
    da = "".join(ch for ch in (a or "") if ch.isdigit())
    db = "".join(ch for ch in (b or "") if ch.isdigit())
    return bool(da) and da == db


WHATSAPP_CHOICES = {"main", "alternate"}


def resolve_whatsapp_on(requested, phone, alternate, current, was_given):
    """Decides which number is marked as the customer's WhatsApp number.

    requested/was_given: what the caller sent ("main" / "alternate" / blank)
    and whether they sent the field at all. When it was not sent, the current
    choice is kept if that number still exists; otherwise a main mobile number
    is picked automatically (mobiles are usually on WhatsApp). A landline can
    be chosen on purpose, since shops often run WhatsApp Business on one.
    Raises ValueError for an unknown choice or one pointing at a blank number.
    """
    numbers = {"main": phone, "alternate": alternate}
    if was_given:
        choice = (requested or "").strip().lower() or None
        if choice is not None and choice not in WHATSAPP_CHOICES:
            raise ValueError("whatsapp_on must be main, alternate or blank.")
        if choice and not numbers[choice]:
            raise ValueError("Pick a WhatsApp number that is filled in.")
        return choice
    if current in WHATSAPP_CHOICES and numbers.get(current):
        return current
    if phone and len(phone) == 10 and phone.isdigit():
        return "main"
    return None
