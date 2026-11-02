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
