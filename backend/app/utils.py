from .models import StatusEnum


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
