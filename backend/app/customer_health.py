"""Customer health: each customer judged against their OWN buying history.

Retail and distribution teams call this RFM (recency, frequency, monetary):
how recently a customer bought, how often they usually buy, and how much.
Every flag is explainable in one plain sentence, and nothing is guessed for
customers without enough history.

Rules (as of today):
* Ordering rhythm: the gaps between a customer's order days over the last
  12 months. "Usual range" = middle half of those gaps (25th-75th percentile),
  needs 3+ order days.
* Not ordering: days since the last order are well past the usual range:
  more than max(1.5 x top of range, typical gap + 14, 21) days. With only two
  orders so far, no order for 60+ days. Customers silent for over a year are
  history, not follow-ups.
* Buying less / more: purchases per 30 days in a recent window (60 days, or
  two of their order cycles, up to 120) against the window before it. Flags
  only when the usual month is at least Rs 2,000, the change is at least
  Rs 2,000 a month and below 60% (less) or above 140% (more) of usual.
* Rows: buying problems first, then paying late only; biggest money first.
* Paying late: money past the credit period (credit.py: 40 days, 60 for
  distributors), or 2+ bounced / reversed payments in 6 months while owing.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import median

from .credit import credit_days, days_past_credit

MIN_MONTH = 2000          # ignore customers who usually buy less than this a month
MIN_CHANGE = 2000         # and changes smaller than this a month
LESS_RATIO = 0.6
MORE_RATIO = 1.4
OPEN = 0.5


def _hundreds(value: float) -> float:
    """Monthly figures are estimates: show them to the nearest Rs 100."""
    return float(round(value / 100) * 100)


def _pct(sorted_values: list[int], q: float) -> int:
    """Simple percentile of a sorted list (nearest rank)."""
    index = min(len(sorted_values) - 1, max(0, round(q * (len(sorted_values) - 1))))
    return sorted_values[index]


def profile(invs: list, group: str | None, today: date) -> dict:
    """Buying habit of one customer from their invoices (any order)."""
    dated = [i for i in invs if i.date and i.date <= today]
    days = sorted({i.date for i in dated})
    out = {"orders": len(days), "last_order": days[-1] if days else None,
           "days_since": (today - days[-1]).days if days else None,
           "gap_low": None, "gap_high": None, "gap": None, "next_expected": None,
           "usual_month": None, "recent_month": None, "quiet": False, "less": False, "more": False}
    if not days:
        return out

    year_ago = today - timedelta(days=365)
    recent_days = [d for d in days if d >= year_ago]
    gaps = sorted((b - a).days for a, b in zip(recent_days, recent_days[1:]))
    if len(gaps) >= 2:
        out["gap"] = round(median(gaps))
        out["gap_low"], out["gap_high"] = _pct(gaps, 0.25), _pct(gaps, 0.75)
        out["next_expected"] = days[-1] + timedelta(days=out["gap"])
        limit = max(round(out["gap_high"] * 1.5), out["gap"] + 14, 21)
        out["quiet"] = out["days_since"] > limit and days[-1] >= year_ago
    elif len(days) == 2:
        out["quiet"] = 60 < out["days_since"] and days[-1] >= year_ago

    # Purchases per 30 days: recent window vs the window before it.
    window = max(60, min(2 * (out["gap"] or 0), 120))
    split = today - timedelta(days=window)
    history = (split - days[0]).days
    if history >= 30:
        base_len = min(2 * window, history)
        base_start = split - timedelta(days=base_len)
        recent = sum(i.total for i in dated if i.date > split)
        base = sum(i.total for i in dated if base_start < i.date <= split)
        out["recent_month"] = round(recent / window * 30, 2)
        out["usual_month"] = round(base / base_len * 30, 2)
        usual, now = out["usual_month"], out["recent_month"]
        if usual >= MIN_MONTH and not out["quiet"]:
            out["less"] = now < usual * LESS_RATIO and usual - now >= MIN_CHANGE
            out["more"] = now > usual * MORE_RATIO and now - usual >= MIN_CHANGE
    if out["usual_month"] is None and len(recent_days) >= 2:
        # Short history: average month over the time they have been buying.
        span = max(30, (recent_days[-1] - recent_days[0]).days + (out["gap"] or 30))
        out["usual_month"] = round(sum(i.total for i in dated if i.date >= year_ago) / span * 30, 2)
    return out


def follow_ups(book, invs: list, today: date) -> dict:
    """Customers to follow up (not ordering / buying less / paying late),
    customers buying more than usual, with plain reasons and Rs at stake."""
    by_customer = defaultdict(list)
    for i in invs:
        if i.customer_id:
            by_customer[i.customer_id].append(i)

    six_months_ago = today - timedelta(days=183)
    rows, growing = [], []
    for cid, mine in by_customer.items():
        c = book.customers.get(cid)
        group = c.group if c else None
        p = profile(mine, group, today)
        base = {"customer_id": cid, "name": c.name if c else "—", "type": group or "Other",
                "mr": book.mr_names.get(c.mr_id) if c and c.mr_id else None}
        reasons = []
        if p["quiet"]:
            habit = (f"usually every {p['gap_low']}–{p['gap_high']} days" if p["gap_low"] != p["gap_high"]
                     else f"usually every {p['gap']} days") if p["gap"] else "only 2 orders so far"
            reasons.append({"kind": "quiet", "text": f"No order for {p['days_since']} days · {habit}",
                            "amount": _hundreds(p["usual_month"] or 0), "unit": "usual / month"})
        if p["less"]:
            reasons.append({"kind": "less", "text": f"₹{_hundreds(p['recent_month']):,.0f} a month lately · usually ₹{_hundreds(p['usual_month']):,.0f}",
                            "amount": _hundreds(p["usual_month"] - p["recent_month"]), "unit": "less / month"})
        owed = sum(i.pending for i in mine if i.pending > OPEN)
        late = [i for i in mine if i.pending > OPEN and (days_past_credit(i.date, group, today) or -1) >= 0]
        overdue = sum(i.pending for i in late)
        bounced = sum(1 for i in mine for d, _a, _m, rev in i.payments if rev and d and d >= six_months_ago)
        if overdue > OPEN:
            oldest = max((today - i.date).days for i in late)
            reasons.append({"kind": "late", "text": f"Oldest unpaid bill {oldest} days old · {credit_days(group)} days' credit",
                            "amount": round(overdue, 2), "unit": "overdue"})
        elif bounced >= 2 and owed > OPEN:
            reasons.append({"kind": "late", "text": f"{bounced} payments bounced or reversed in 6 months",
                            "amount": round(owed, 2), "unit": "owed"})
        if reasons:
            rows.append({**base, "reasons": reasons, "stake": max(r["amount"] for r in reasons)})
        if p["more"]:
            growing.append({**base, "change": _hundreds(p["recent_month"] - p["usual_month"]),
                            "recent_month": _hundreds(p["recent_month"]), "usual_month": _hundreds(p["usual_month"])})

    # Buying problems (not ordering / buying less) first, then paying late only;
    # each group biggest money first. Overdue bills also sit on the dashboard.
    rows.sort(key=lambda r: (all(x["kind"] == "late" for x in r["reasons"]), -r["stake"]))
    growing.sort(key=lambda r: -r["change"])
    counts = {kind: sum(1 for r in rows if any(x["kind"] == kind for x in r["reasons"])) for kind in ("quiet", "less", "late")}
    return {"rows": rows, "counts": counts, "growing": growing}
