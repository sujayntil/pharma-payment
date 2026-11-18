"""Insights: the business in numbers, read-only.

Everything here only reads invoices, payments, customers and users; nothing
is written except MR targets (saved from the Insights page).

Same meanings as the Dashboard, so the numbers agree:
* Sales        - invoices dated in the period (total amount).
* Collected    - money received in the period (payment date in India time),
                 on any invoice; reversals count as minus.
* Outstanding  - what is still pending on the invoices dated in the period.
* Customer types - Distributor / Chemist / Doctor / Hospital / Other
                 (the Dashboard counts Hospital under Other; totals are the same).

Insights-only figures:
* Days to collect - invoice date to the payment that cleared it.
* Growth          - this period's sales vs the previous period of the same length.
* At risk         - a regular (3+ orders) who has gone more than twice their
                    usual gap without ordering.
* Ageing          - pending today, by age of the invoice (as of today).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .credit import credit_days, days_past_credit, is_overdue
from .customer_health import _hundreds, follow_ups, profile

IST = timezone(timedelta(hours=5, minutes=30))
OPEN = 0.004
TYPE_GROUPS = ("Distributor", "Chemist", "Doctor", "Hospital", "Other")
# Money owed today by how late it is: days past the credit period (credit.py).
DUE_BUCKETS = (("not-due", None, -1), ("1-30", 0, 30), ("31-60", 31, 60), ("60+", 61, 10 ** 6))
DEPENDENCE_SHARE = 15       # % of sales from one customer that triggers the warning
AREA_MIN_COVERAGE = 60      # % of customers with an area before "by area" shows
NOT_SET = "__none__"        # area filter value for customers without an area


def today_ist() -> date:
    return datetime.now(IST).date()


def type_group(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    for name in ("Distributor", "Chemist", "Doctor", "Hospital"):
        if value == name.lower():
            return name
    return "Other"


def ist_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, months: int) -> date:
    index = d.year * 12 + d.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def month_end(d: date) -> date:
    return add_months(month_start(d), 1) - timedelta(days=1)


def shift_months(d: date, months: int) -> date:
    """Same day `months` earlier/later, kept inside the month (31 Mar - 1 month = 28/29 Feb)."""
    first = add_months(month_start(d), months)
    return min(first + timedelta(days=d.day - 1), month_end(first))


def previous_range(start: date, end: date) -> tuple[date, date]:
    """The period to compare with.
    * Whole months (1st to month end, one or more; so also whole quarters):
      the same number of months before.
    * A month so far: the same days of last month (1-18 Nov vs 1-18 Oct).
    * A quarter so far (from 1 Jan/Apr/Jul/Oct): the same days of the previous
      quarter (1 Oct-18 Nov vs 1 Jul-18 Aug).
    * A financial year so far (from 1 Apr): the same days of the previous year.
    * Anything else (weeks, custom): the same number of days just before."""
    if start.day == 1:
        if end == month_end(end):
            months = (end.year - start.year) * 12 + end.month - start.month + 1
            prev_start = add_months(start, -months)
            return prev_start, start - timedelta(days=1)
        months_in = (end.year - start.year) * 12 + end.month - start.month
        if months_in == 0:
            prev_start = add_months(start, -1)
            return prev_start, min(prev_start + (end - start), month_end(prev_start))
        if start.month in (1, 4, 7, 10) and months_in < 3:
            return add_months(start, -3), shift_months(end, -3)
        if start.month == 4 and months_in < 12:
            return add_months(start, -12), shift_months(end, -12)
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def within(d: date | None, start: date, end: date) -> bool:
    return d is not None and start <= d <= end


@dataclass
class Inv:
    id: int
    number: str
    date: date | None
    total: float
    paid: float
    pending: float
    status: str | None
    customer_id: int | None
    mr_id: int | None
    payments: list = field(default_factory=list)   # (ist date, amount, mode, is_reversal)

    @property
    def cleared_on(self) -> date | None:
        """Day of the payment that cleared it (latest money-in), when fully paid."""
        if self.pending > OPEN:
            return None
        days = [d for d, amount, _mode, reversal in self.payments if amount > 0 and not reversal and d]
        return max(days) if days else None


@dataclass
class Cust:
    id: int
    name: str
    group: str
    mr_id: int | None
    area: str | None


class Book:
    """All invoices and payments loaded once; filters applied in memory.
    (A distributor's books are thousands of rows, so this stays quick.)"""

    def __init__(self, db: Session):
        self.customers: dict[int, Cust] = {}
        for c in db.query(models.Customer.id, models.Customer.name, models.Customer.type,
                          models.Customer.mr_id, models.Customer.area).all():
            self.customers[c.id] = Cust(c.id, c.name, type_group(c.type), c.mr_id, (c.area or "").strip() or None)
        self.invoices: dict[int, Inv] = {}
        for row in db.query(models.Invoice.id, models.Invoice.invoice_number, models.Invoice.invoice_date,
                            models.Invoice.total_amount, models.Invoice.paid_amount, models.Invoice.pending_amount,
                            models.Invoice.status, models.Invoice.customer_id, models.Invoice.mr_id).all():
            self.invoices[row.id] = Inv(row.id, row.invoice_number, row.invoice_date, float(row.total_amount or 0),
                                        float(row.paid_amount or 0), float(row.pending_amount or 0), row.status,
                                        row.customer_id, row.mr_id)
        for p in db.query(models.Payment.invoice_id, models.Payment.payment_date, models.Payment.amount,
                          models.Payment.mode, models.Payment.reversal_of_id).all():
            inv = self.invoices.get(p.invoice_id)
            if inv is not None:
                inv.payments.append((ist_date(p.payment_date), float(p.amount or 0), p.mode or "Other",
                                     p.reversal_of_id is not None))
        self.mr_names = {u.id: u.name for u in db.query(models.User.id, models.User.name)
                         .filter(models.User.role == models.RoleEnum.MR.value).all()}

    def group_of(self, inv: Inv) -> str:
        c = self.customers.get(inv.customer_id)
        return c.group if c else "Other"

    def area_of(self, inv: Inv) -> str | None:
        c = self.customers.get(inv.customer_id)
        return c.area if c else None


@dataclass
class Filters:
    customer_type: str | None = None   # Distributor / Chemist / Doctor / Other
    mr_id: int | None = None           # 0 = no MR
    area: str | None = None            # NOT_SET = customers without an area

    def match(self, book: Book, inv: Inv, ignore: str = "") -> bool:
        if self.customer_type and ignore != "type" and book.group_of(inv) != self.customer_type:
            return False
        if self.mr_id is not None and ignore != "mr":
            if (inv.mr_id or 0) != self.mr_id:
                return False
        if self.area and ignore != "area":
            area = book.area_of(inv)
            if (area or NOT_SET).lower() != self.area.lower():
                return False
        return True


def _totals(book: Book, invs: list[Inv], start: date, end: date) -> dict:
    sales = sum(i.total for i in invs if within(i.date, start, end))
    pending = sum(i.pending for i in invs if within(i.date, start, end))
    collected = sum(amount for i in invs for d, amount, _m, _r in i.payments if within(d, start, end))
    active = {i.customer_id for i in invs if within(i.date, start, end) and i.customer_id}
    current = sum(amount for i in invs if within(i.date, start, end)
                  for d, amount, _m, _r in i.payments if within(d, start, end))
    recovered = sum(i.paid for i in invs if within(i.date, start, end))
    return {
        "sales": round(sales, 2),
        "collected": round(collected, 2),
        # cash in these dates for bills dated in these dates; the rest is old dues
        "collected_current": round(current, 2),
        "collected_older": round(collected - current, 2),
        # sales recovery: paid so far on the bills dated in these dates
        "recovered": round(recovered, 2),
        "outstanding": round(pending, 2),
        "active_customers": len(active),
    }


def _late(book: "Book", i: Inv, today: date) -> int | None:
    """Days past the customer's credit period (negative = not yet due)."""
    c = book.customers.get(i.customer_id)
    return days_past_credit(i.date, c.group if c else None, today)


def _in_bucket(book: "Book", i: Inv, today: date, lo: int | None, hi: int) -> bool:
    late = _late(book, i, today)
    if late is None:
        return lo is None          # undated bills count as not yet due
    return (late <= hi) if lo is None else (lo <= late <= hi)


def _pct(cur: float, prev: float) -> int | None:
    if not prev:
        return None
    return round((cur - prev) / abs(prev) * 100)


def summary(db: Session, start: date, end: date, filters: Filters, trend: str = "monthly") -> dict:
    book = Book(db)
    today = today_ist()
    all_invs = list(book.invoices.values())
    invs = [i for i in all_invs if filters.match(book, i)]
    prev_start, prev_end = previous_range(start, end)

    current = _totals(book, invs, start, end)
    previous = _totals(book, invs, prev_start, prev_end)
    windows = [(start, end)]
    for _ in range(7):
        windows.insert(0, previous_range(*windows[0]))
    sparks = [_totals(book, invs, s, e) for s, e in windows]
    split = {key: current.pop(key) for key in ("collected_current", "collected_older", "recovered")}
    for key in split:
        previous.pop(key, None)
        for p in sparks:
            p.pop(key, None)
    kpis = {key: {"value": current[key], "previous": previous[key],
                  "change": _pct(current[key] or 0, previous[key] or 0),
                  "spark": [p[key] or 0 for p in sparks]}
            for key in current}
    # "Owed to you" is always today's position (not tied to the dates):
    # everything unpaid, split into not yet due and overdue.
    owed = [i for i in invs if i.pending > OPEN]
    overdue_now = sum(i.pending for i in owed if (_late(book, i, today) or -1) >= 0)
    kpis["outstanding"] = {"value": round(sum(i.pending for i in owed), 2), "previous": None, "change": None,
                           "spark": [], "as_of_today": True, "overdue": round(overdue_now, 2),
                           "not_due": round(sum(i.pending for i in owed) - overdue_now, 2)}
    kpis["collected"]["current"] = split["collected_current"]
    kpis["collected"]["older"] = split["collected_older"]
    kpis["sales"]["recovered"] = split["recovered"]

    # Trend: last 12 months / 12 weeks up to today (follows type / MR / area).
    buckets = []
    if trend == "weekly":
        week = today - timedelta(days=today.weekday())
        for k in range(11, -1, -1):
            s = week - timedelta(weeks=k)
            buckets.append((s, min(s + timedelta(days=6), today), s.strftime("%d %b")))
    else:
        for k in range(11, -1, -1):
            s = add_months(month_start(today), -k)
            buckets.append((s, min(month_end(s), today), s.strftime("%b")))
    trend_rows = []
    for s, e, label in buckets:
        t = _totals(book, invs, s, e)
        trend_rows.append({"from": s.isoformat(), "to": e.isoformat(), "label": label,
                           "sales": t["sales"], "collected": t["collected"], "recovered": t["recovered"]})

    # Sales by customer type (shows every type; the chosen one is highlighted).
    by_type = defaultdict(float)
    for i in all_invs:
        if filters.match(book, i, ignore="type") and within(i.date, start, end):
            by_type[book.group_of(i)] += i.total
    type_rows = [{"type": t, "sales": round(by_type.get(t, 0), 2)} for t in TYPE_GROUPS]

    # By MR, with target progress: for the month picked (when one calendar
    # month is picked), otherwise for the current month.
    single_month = start.day == 1 and (start.year, start.month) == (end.year, end.month)
    m_start = start if single_month else month_start(today)
    m_end = min(month_end(m_start), today)
    targets = targets_for(db, m_start.strftime("%Y-%m"))
    mr_rows = []
    mr_ids = set(book.mr_names) | {i.mr_id for i in all_invs if i.mr_id}
    for mr_id in mr_ids:
        mine = [i for i in all_invs if (i.mr_id or 0) == mr_id and filters.match(book, i, ignore="mr")]
        t = _totals(book, mine, start, end)
        month = _totals(book, mine, m_start, m_end)
        target = targets.get(mr_id, {})
        if not (t["sales"] or t["collected"] or month["sales"] or target.get("sales_target")):
            continue
        mr_rows.append({
            "mr_id": mr_id, "name": book.mr_names.get(mr_id, "Former MR"),
            "sales": t["sales"], "collected": t["collected"],
            "month_sales": month["sales"], "month_collected": month["collected"],
            "sales_target": target.get("sales_target"), "collection_target": target.get("collection_target"),
        })
    unassigned = [i for i in all_invs if not i.mr_id and filters.match(book, i, ignore="mr")]
    if unassigned:
        t = _totals(book, unassigned, start, end)
        if t["sales"] or t["collected"]:
            mr_rows.append({"mr_id": 0, "name": "No MR", "sales": t["sales"], "collected": t["collected"],
                            "month_sales": None, "month_collected": None, "sales_target": None, "collection_target": None})
    mr_rows.sort(key=lambda r: -r["sales"])
    current_target_month = month_start(today) == m_start
    days_left = (month_end(today) - today).days if current_target_month else 0

    # Per customer.
    per = defaultdict(lambda: {"cur": 0.0, "dates": []})
    for i in invs:
        if not i.customer_id:
            continue
        row = per[i.customer_id]
        if within(i.date, start, end):
            row["cur"] += i.total
        if i.date:
            row["dates"].append(i.date)

    def cust(cid, **extra):
        c = book.customers.get(cid)
        return {"customer_id": cid, "name": c.name if c else "—", "type": c.group if c else "Other",
                "mr": book.mr_names.get(c.mr_id) if c and c.mr_id else None, **extra}

    total_sales = current["sales"]
    ranked = sorted(((cid, r) for cid, r in per.items() if r["cur"] > 0), key=lambda x: -x[1]["cur"])
    top = [cust(cid, sales=round(r["cur"], 2), share=round(r["cur"] / total_sales * 100, 1) if total_sales else 0)
           for cid, r in ranked]
    top10_share = round(sum(r["cur"] for _cid, r in ranked[:10]) / total_sales * 100) if total_sales else 0
    dependence = top[0] if top and top[0]["share"] >= DEPENDENCE_SHARE else None

    # New customers: first ever order inside the period.
    first_order = {cid: min(r["dates"]) for cid, r in per.items() if r["dates"]}
    new_customers = [cust(cid, first_order=first_order[cid].isoformat(), sales=round(per[cid]["cur"], 2))
                     for cid in sorted((cid for cid, d in first_order.items() if within(d, start, end)),
                                       key=lambda cid: -per[cid]["cur"])]

    # Customers to follow up / buying more: each against their own history, as of today.
    health = follow_ups(book, invs, today)

    ageing = []
    for label, lo, hi in DUE_BUCKETS:
        rows = [i for i in invs if i.pending > OPEN and _in_bucket(book, i, today, lo, hi)]
        ageing.append({"bucket": label, "amount": round(sum(i.pending for i in rows), 2),
                       "invoices": len(rows), "customers": len({i.customer_id for i in rows})})

    modes = defaultdict(float)
    for i in invs:
        for d, amount, mode, _rev in i.payments:
            if within(d, start, end):
                modes[(mode or "Other").strip().title() or "Other"] += amount
    mode_rows = sorted(({"mode": k, "amount": round(v, 2)} for k, v in modes.items() if abs(v) > OPEN), key=lambda x: -x["amount"])

    with_area = [c for c in book.customers.values() if c.area]
    coverage = round(len(with_area) / len(book.customers) * 100) if book.customers else 0
    by_area = defaultdict(float)
    for i in all_invs:
        if filters.match(book, i, ignore="area") and within(i.date, start, end):
            by_area[book.area_of(i) or NOT_SET] += i.total
    area_rows = sorted(({"area": k, "sales": round(v, 2)} for k, v in by_area.items()), key=lambda x: -x["sales"])

    return {
        "first_invoice_date": min((i.date for i in all_invs if i.date), default=None),
        "range": {"from": start.isoformat(), "to": end.isoformat(),
                  "previous_from": prev_start.isoformat(), "previous_to": prev_end.isoformat()},
        "kpis": kpis,
        "trend": {"kind": "weekly" if trend == "weekly" else "monthly", "points": trend_rows},
        "by_type": type_rows,
        "by_mr": {"rows": mr_rows, "days_left": days_left, "month": m_start.strftime("%Y-%m"),
                  "month_label": m_start.strftime("%B %Y"), "current_month": current_target_month},
        "top_customers": {"rows": top, "top10_share": top10_share, "dependence": dependence},
        "follow_up": {"rows": health["rows"], "counts": health["counts"]},
        "growing": health["growing"],
        "new_customers": new_customers,
        "ageing": ageing,
        "payment_modes": mode_rows,
        "area": {"coverage": coverage, "show": coverage >= AREA_MIN_COVERAGE, "rows": area_rows,
                 "areas": sorted({c.area for c in with_area}, key=str.lower)},
    }


# ---------- drill-down lists ----------

def invoice_list(db: Session, kind: str, start: date, end: date, filters: Filters, bucket: str | None = None,
                 limit: int = 500) -> dict:
    """The records behind a number: sales / outstanding / active (invoices
    dated in the period), collected (payments in the period), age (pending
    today in an age bucket)."""
    book = Book(db)
    today = today_ist()
    invs = [i for i in book.invoices.values() if filters.match(book, i)]

    def row(i: Inv, **extra):
        c = book.customers.get(i.customer_id)
        return {"invoice_id": i.id, "invoice_number": i.number, "invoice_date": i.date.isoformat() if i.date else None,
                "customer_id": i.customer_id, "customer": c.name if c else "—", "mr": book.mr_names.get(i.mr_id),
                "total": round(i.total, 2), "paid": round(i.paid, 2), "pending": round(i.pending, 2),
                "status": i.status, **extra}

    if kind == "collected":
        items = []
        for i in invs:
            for d, amount, mode, reversal in i.payments:
                if within(d, start, end):
                    items.append(row(i, payment_date=d.isoformat(), amount=round(amount, 2), mode=mode, reversal=reversal))
        items.sort(key=lambda x: x["payment_date"], reverse=True)
        total = sum(x["amount"] for x in items)
    elif kind == "age":
        span = next(((lo, hi) for label, lo, hi in DUE_BUCKETS if label == bucket), None)
        if span is None:
            raise ValueError("Unknown age bucket")
        items = [row(i, age_days=(today - i.date).days if i.date else None, days_late=_late(book, i, today)) for i in invs
                 if i.pending > OPEN and _in_bucket(book, i, today, *span)]
        items.sort(key=lambda x: x["invoice_date"] or "")
        total = sum(x["pending"] for x in items)
    elif kind == "outstanding":
        # Everything owed today, whatever the dates; oldest first.
        items = [row(i, age_days=(today - i.date).days if i.date else None, days_late=_late(book, i, today))
                 for i in invs if i.pending > OPEN]
        items.sort(key=lambda x: x["invoice_date"] or "")
        total = sum(x["pending"] for x in items)
    else:
        items = [row(i) for i in invs if within(i.date, start, end)]
        items.sort(key=lambda x: x["invoice_date"] or "", reverse=True)
        total = sum(x["total"] for x in items)
    return {"kind": kind, "count": len(items), "total": round(total, 2), "items": items[:limit], "truncated": len(items) > limit}


def customer_insights(db: Session, customer_id: int) -> dict | None:
    book = Book(db)
    c = book.customers.get(customer_id)
    if c is None:
        return None
    today = today_ist()
    invs = sorted((i for i in book.invoices.values() if i.customer_id == customer_id), key=lambda i: i.date or date.min, reverse=True)
    months = []
    for k in range(11, -1, -1):
        s = add_months(month_start(today), -k)
        months.append({"month": s.strftime("%Y-%m"), "label": s.strftime("%b"),
                       "sales": round(sum(i.total for i in invs if within(i.date, s, month_end(s))), 2)})
    last3 = sum(m["sales"] for m in months[9:])
    prev3 = sum(m["sales"] for m in months[6:9])
    pay_days = [max((i.cleared_on - i.date).days, 0) for i in invs if i.cleared_on and i.date]
    dates = sorted({i.date for i in invs if i.date})
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    modes = defaultdict(int)
    reversals = 0
    for i in invs:
        for _d, amount, mode, rev in i.payments:
            if rev:
                reversals += 1
            elif amount > 0:
                modes[(mode or "Other").strip().title()] += 1
    usual = round(sum(gaps) / len(gaps)) if gaps else None
    since = (today - dates[-1]).days if dates else None
    habit = profile(invs, c.group, today)
    credit = credit_days(c.group)
    overdue = [i for i in invs if i.pending > OPEN and is_overdue(i.date, c.group, today)]
    return {
        "customer_id": c.id, "name": c.name, "type": c.group, "area": c.area,
        "mr_id": c.mr_id, "mr": book.mr_names.get(c.mr_id) if c.mr_id else None,
        "months": months,
        "last_12_months": round(sum(m["sales"] for m in months), 2),
        "growth_3m": _pct(last3, prev3),
        "outstanding": round(sum(i.pending for i in invs), 2),
        "credit_days": credit,
        "overdue": round(sum(i.pending for i in overdue), 2),
        "oldest_overdue_date": min(i.date for i in overdue).isoformat() if overdue else None,
        "oldest_overdue_late": max(_late(book, i, today) for i in overdue) if overdue else None,
        "avg_days_to_pay": round(sum(pay_days) / len(pay_days)) if pay_days else None,
        "paid_on_time": round(sum(1 for d in pay_days if d <= credit) / len(pay_days) * 100) if pay_days else None,
        "order_every": usual,
        "gap_low": habit["gap_low"], "gap_high": habit["gap_high"],
        "next_expected": habit["next_expected"].isoformat() if habit["next_expected"] else None,
        # Monthly figures are estimates: nearest Rs 100, same as the follow-up list.
        "usual_month": _hundreds(habit["usual_month"]) if habit["usual_month"] is not None else None,
        "recent_month": _hundreds(habit["recent_month"]) if habit["recent_month"] is not None else None,
        "not_ordering": habit["quiet"], "buying_less": habit["less"], "buying_more": habit["more"],
        "days_since_last_order": since,
        "usual_mode": max(modes, key=modes.get) if modes else None,
        "reversals": reversals,
        "customer_since": dates[0].isoformat() if dates else None,
        "invoices": [{"invoice_id": i.id, "invoice_number": i.number, "invoice_date": i.date.isoformat() if i.date else None,
                      "total": round(i.total, 2), "paid": round(i.paid, 2), "pending": round(i.pending, 2), "status": i.status}
                     for i in invs[:60]],
        "invoice_count": len(invs),
    }


# ---------- targets ----------

def targets_for(db: Session, month: str) -> dict[int, dict]:
    """Targets for a month per MR; a month without its own row uses the
    latest earlier month's."""
    rows = (db.query(models.MrTarget).filter(models.MrTarget.month <= month)
            .order_by(models.MrTarget.user_id, models.MrTarget.month.desc()).all())
    out: dict[int, dict] = {}
    for r in rows:
        if r.user_id not in out:
            out[r.user_id] = {"sales_target": r.sales_target, "collection_target": r.collection_target,
                              "from_month": r.month, "carried": r.month != month}
    return out


def save_targets(db: Session, month: str, targets) -> None:
    mr_ids = {u.id for u in db.query(models.User.id).filter(models.User.role == models.RoleEnum.MR.value).all()}
    for t in targets:
        if t.mr_id not in mr_ids:
            raise ValueError(f"MR {t.mr_id} not found")
        row = db.query(models.MrTarget).filter_by(user_id=t.mr_id, month=month).first()
        if row is None:
            row = models.MrTarget(user_id=t.mr_id, month=month)
            db.add(row)
        row.sales_target = t.sales_target
        row.collection_target = t.collection_target


# ---------- Monday summary ----------

def last_week_totals(db: Session) -> tuple[date, date, float, float]:
    today = today_ist()
    this_monday = today - timedelta(days=today.weekday())
    start, end = this_monday - timedelta(days=7), this_monday - timedelta(days=1)
    sales = db.query(func.coalesce(func.sum(models.Invoice.total_amount), 0)).filter(
        models.Invoice.invoice_date >= start, models.Invoice.invoice_date <= end).scalar()
    lo = datetime.combine(start, datetime.min.time(), tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)
    collected = db.query(func.coalesce(func.sum(models.Payment.amount), 0)).filter(
        models.Payment.payment_date >= lo, models.Payment.payment_date < hi).scalar()
    return start, end, float(sales or 0), float(collected or 0)
