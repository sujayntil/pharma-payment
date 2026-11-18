"""Insights figures on small hand-made books where the right answers are known.
Also checks they agree with the Dashboard for Sales / Collected / Outstanding."""
import os
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.insights import NOT_SET, Filters, customer_insights, invoice_list, summary, today_ist
from app.routers.admin import dashboard
from app.routers.customers import update_customer
from app.routers.insights import get_targets, insights_records, insights_summary, put_targets

TODAY = today_ist()
M0 = TODAY.replace(day=1)                                   # this month
PREV_END = M0 - timedelta(days=1)
M1 = PREV_END.replace(day=1)                                # last month


def pay_at(d: date, hour_utc=8):
    return datetime(d.year, d.month, d.day, hour_utc, 0)    # 08:00 UTC = 13:30 IST, same date


class InsightsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        db = self.db
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.rahul = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="x")
        self.neha = models.User(name="Neha", employee_code="M2", role="MR", password_hash="x")
        db.add_all([self.admin, self.rahul, self.neha]); db.flush()
        self.chem = models.Customer(name="City Chemist", type="chemist ", mr_id=self.rahul.id, area="Andheri")
        self.doc = models.Customer(name="Dr. Mehta", type="Doctor", mr_id=self.neha.id)
        self.dist = models.Customer(name="Big Distributor", type="Distributor", mr_id=self.rahul.id, area="Thane")
        self.hosp = models.Customer(name="Care Hospital", type="Hospital", mr_id=None)
        db.add_all([self.chem, self.doc, self.dist, self.hosp]); db.flush()
        self.n = 0

    def tearDown(self):
        self.db.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def inv(self, cust, d, total, payments=(), mr=None):
        self.n += 1
        paid = sum(a for a, *_ in payments)
        i = models.Invoice(invoice_number=f"I{self.n}", invoice_date=d, customer_id=cust.id,
                           mr_id=mr.id if mr else cust.mr_id, total_amount=total, paid_amount=paid,
                           pending_amount=round(total - paid, 2), status="PAID" if paid >= total else ("PARTIAL" if paid else "UNPAID"))
        self.db.add(i); self.db.flush()
        for amount, when, mode, *rest in payments:
            self.db.add(models.Payment(invoice_id=i.id, amount=amount, mode=mode, payment_date=pay_at(when),
                                       reversal_of_id=rest[0] if rest else None))
        self.db.commit()
        return i

    def books(self):
        """This month: chem 1000 (paid 1000 on day of invoice+2), doc 500 (unpaid),
        dist 3000 (paid 1000); last month: chem 400 (paid this month), dist 2000."""
        d = M0
        self.inv(self.chem, d, 1000, [(1000, min(d + timedelta(days=2), TODAY), "UPI")])
        self.inv(self.doc, d, 500)
        self.inv(self.dist, d, 3000, [(1000, d, "Cash")])
        self.inv(self.chem, M1, 400, [(400, d, "Cheque")])
        self.inv(self.dist, M1, 2000, [(2000, M1 + timedelta(days=5), "Bank")])

    def S(self, **f):
        return summary(self.db, M0, TODAY, Filters(**f))

    # ---------- headline figures ----------
    def test_kpis_and_previous_period(self):
        self.books()
        k = self.S()["kpis"]
        self.assertEqual(k["sales"]["value"], 4500)
        self.assertEqual(k["collected"]["value"], 2400)          # 1000 + 1000 + 400 (old invoice, paid now)
        self.assertEqual(k["outstanding"]["value"], 2500)        # 500 + 2000 pending on this month's invoices
        self.assertEqual(k["active_customers"]["value"], 3)
        self.assertEqual(len(k["sales"]["spark"]), 8)
        self.assertEqual(k["sales"]["spark"][-1], 4500)

    def test_current_vs_old_dues_and_sales_recovery(self):
        self.books()
        s = self.S()
        c = s["kpis"]["collected"]
        self.assertEqual((c["current"], c["older"]), (2000, 400))      # 1000 + 1000 for this month's bills; 400 old dues
        self.assertEqual(s["kpis"]["sales"]["recovered"], 2000)         # paid so far on this month's bills
        self.assertEqual(s["trend"]["points"][-1]["recovered"], 2000)
        self.assertEqual(s["trend"]["points"][-2]["recovered"], 2400)   # last month's bills: 400 + 2000, fully paid
        d = dashboard(M0, TODAY, None, self.db, self.admin)
        self.assertEqual((d["collected_current"], d["collected_older"], d["recovered"]), (2000, 400, 2000))
        self.assertEqual(d["recovered"] + d["outstanding"], d["total_sales"])
        all_time = dashboard(None, None, None, self.db, self.admin)
        self.assertIsNone(all_time["collected_current"])

    def test_matches_the_dashboard(self):
        self.books()
        k = self.S()["kpis"]
        d = dashboard(M0, TODAY, None, self.db, self.admin)
        self.assertEqual(k["sales"]["value"], d["total_sales"])
        self.assertEqual(k["collected"]["value"], d["collected"])
        self.assertEqual(k["outstanding"]["value"], d["outstanding"])
        k = self.S(customer_type="Chemist")["kpis"]
        d = dashboard(M0, TODAY, "chemist", self.db, self.admin)
        self.assertEqual((k["sales"]["value"], k["collected"]["value"]), (d["total_sales"], d["collected"]))

    def test_compares_like_for_like(self):
        from app.insights import previous_range
        self.assertEqual(previous_range(date(2026, 11, 1), date(2026, 11, 18)), (date(2026, 10, 1), date(2026, 10, 18)))
        self.assertEqual(previous_range(date(2026, 3, 1), date(2026, 3, 31)), (date(2026, 2, 1), date(2026, 2, 28)))
        self.assertEqual(previous_range(date(2026, 3, 1), date(2026, 3, 30)), (date(2026, 2, 1), date(2026, 2, 28)))
        self.assertEqual(previous_range(date(2026, 9, 1), date(2026, 11, 30)), (date(2026, 6, 1), date(2026, 8, 31)))
        self.assertEqual(previous_range(date(2026, 11, 16), date(2026, 11, 22)), (date(2026, 11, 9), date(2026, 11, 15)))

    # ---------- slicers ----------
    def test_type_groups_mr_and_area_filters(self):
        self.books()
        self.inv(self.hosp, M0, 700)
        types = {r["type"]: r["sales"] for r in self.S()["by_type"]}
        self.assertEqual(types, {"Distributor": 3000, "Chemist": 1000, "Doctor": 500, "Hospital": 700, "Other": 0})
        self.assertEqual(self.S(customer_type="Hospital")["kpis"]["sales"]["value"], 700)
        self.assertEqual(self.S(customer_type="Other")["kpis"]["sales"]["value"], 0)
        # type chart still shows every type when a type is picked
        self.assertEqual(len([r for r in self.S(customer_type="Doctor")["by_type"] if r["sales"]]), 4)
        self.assertEqual(self.S()["kpis"]["sales"]["value"], dashboard(M0, TODAY, None, self.db, self.admin)["total_sales"])
        self.assertEqual(self.S(mr_id=self.rahul.id)["kpis"]["sales"]["value"], 4000)
        self.assertEqual(self.S(mr_id=0)["kpis"]["sales"]["value"], 700)               # no MR
        self.assertEqual(self.S(area="andheri")["kpis"]["sales"]["value"], 1000)
        self.assertEqual(self.S(area=NOT_SET)["kpis"]["sales"]["value"], 1200)          # doc + hospital
        mr = {r["name"]: r for r in self.S(customer_type="Chemist")["by_mr"]["rows"]}
        self.assertEqual(mr["Rahul"]["sales"], 1000)

    def test_area_shows_only_when_most_customers_have_one(self):
        self.books()
        area = self.S()["area"]
        self.assertEqual(area["coverage"], 50)
        self.assertFalse(area["show"])
        self.assertEqual(area["areas"], ["Andheri", "Thane"])

    # ---------- customers ----------
    def test_top_customers_share_and_dependence(self):
        self.books()
        top = self.S()["top_customers"]
        self.assertEqual(top["rows"][0]["name"], "Big Distributor")
        self.assertEqual(top["rows"][0]["share"], round(3000 / 4500 * 100, 1))
        self.assertEqual(top["top10_share"], 100)
        self.assertEqual(top["dependence"]["name"], "Big Distributor")

    def test_overdue_follows_credit_days(self):
        from app.overdue import overdue_customer_summaries
        self.inv(self.dist, TODAY - timedelta(days=50), 1000)   # distributor, 50 d: not due
        self.inv(self.chem, TODAY - timedelta(days=45), 400)    # chemist, 45 d: overdue
        self.inv(self.chem, TODAY - timedelta(days=5), 600)     # chemist, 5 d: not due
        names = {r["customer"]: r for r in overdue_customer_summaries(self.db, TODAY)}
        self.assertEqual(set(names), {"City Chemist"})
        self.assertEqual((names["City Chemist"]["overdue_amount"], names["City Chemist"]["credit_days"]), (400, 40))
        self.inv(self.dist, TODAY - timedelta(days=61), 250)    # distributor, 61 d: overdue
        names = {r["customer"]: r for r in overdue_customer_summaries(self.db, TODAY)}
        self.assertEqual((names["Big Distributor"]["overdue_amount"], names["Big Distributor"]["credit_days"]), (250, 60))
        d = dashboard(date_from=TODAY.replace(day=1), date_to=TODAY, customer_type=None, db=self.db, user=self.admin)
        self.assertEqual((d["owed"], d["owed_overdue"], d["owed_not_due"]), (2250, 650, 1600))
        c = customer_insights(self.db, self.chem.id)
        self.assertEqual((c["overdue"], c["credit_days"], c["oldest_overdue_late"]), (400, 40, 5))

    # ---------- customer health (each against their own history) ----------
    def health(self):
        s = self.S()
        return {r["name"]: r for r in s["follow_up"]["rows"]}, s

    def every(self, cust, last_days_ago, gap, count, amount):
        """`count` orders, `gap` days apart, the last one `last_days_ago` days ago."""
        for k in range(count):
            d = TODAY - timedelta(days=last_days_ago + k * gap)
            self.inv(cust, d, amount, [(amount, d + timedelta(days=5), "UPI")])     # paid: only buying habit counts

    def test_regular_customer_not_flagged_before_their_usual_gap(self):
        # Orders every 20 days; last order 25 days ago (e.g. late October): not late yet.
        self.every(self.doc, 25, 20, 6, 5000)
        rows, _s = self.health()
        self.assertNotIn("Dr. Mehta", rows)

    def test_not_ordering_past_their_usual_gap(self):
        self.every(self.doc, 45, 20, 6, 5000)             # usually every 20 days, quiet for 45
        rows, s = self.health()
        why = rows["Dr. Mehta"]["reasons"][0]
        self.assertEqual(why["kind"], "quiet")
        self.assertIn("No order for 45 days · usually every 20 days", why["text"])
        self.assertEqual(s["follow_up"]["counts"]["quiet"], 1)

    def test_two_orders_only_flag_after_60_days(self):
        self.every(self.chem, 50, 30, 2, 3000)
        self.assertNotIn("City Chemist", self.health()[0])
        self.db.query(models.Invoice).delete(); self.db.commit()
        self.every(self.chem, 70, 30, 2, 3000)
        self.assertEqual(self.health()[0]["City Chemist"]["reasons"][0]["kind"], "quiet")

    def test_buying_less_and_more_against_own_usual_month(self):
        def paid(cust, days_ago, amount):
            d = TODAY - timedelta(days=days_ago)
            self.inv(cust, d, amount, [(amount, d, "UPI")])
        # Doctor: 15,000 every ~10 days before, 2,000 every ~10 days lately -> buying less.
        for k in range(6, 18):
            paid(self.doc, k * 10 + 1, 5000)
        for k in range(6):
            paid(self.doc, k * 10 + 1, 700)
        # Distributor: 2,000 a month before, 12,000 a month lately -> buying more.
        for k in range(6, 18):
            paid(self.dist, k * 10 + 2, 700)
        for k in range(6):
            paid(self.dist, k * 10 + 2, 4000)
        # Tiny customer: under 2,000 a month, never flagged.
        for k in range(18):
            paid(self.hosp, k * 10 + 3, 100 if k < 6 else 500)
        rows, s = self.health()
        less = rows["Dr. Mehta"]["reasons"][0]
        self.assertEqual(less["kind"], "less")
        self.assertGreater(less["amount"], 12000)            # about 15,000 -> 2,100 a month
        self.assertEqual([g["name"] for g in s["growing"]], ["Big Distributor"])
        self.assertNotIn(self.hosp.name, rows)

    def test_paying_late_uses_credit_days_and_bounces(self):
        self.inv(self.chem, TODAY - timedelta(days=45), 400)     # chemist 45 d: overdue
        self.inv(self.dist, TODAY - timedelta(days=50), 900)     # distributor 50 d: within 60
        bounced = self.inv(self.doc, TODAY - timedelta(days=5), 300, [(300, TODAY, "Cheque")])
        first = self.db.query(models.Payment).filter_by(invoice_id=bounced.id).first()
        for _ in range(2):
            self.db.add(models.Payment(invoice_id=bounced.id, amount=-300, mode="Cheque", payment_date=pay_at(TODAY), reversal_of_id=first.id))
        bounced.pending_amount = 300
        self.db.commit()
        rows, s = self.health()
        self.assertEqual((rows["City Chemist"]["reasons"][0]["amount"], rows["City Chemist"]["reasons"][0]["unit"]), (400, "overdue"))
        self.assertNotIn("Big Distributor", rows)
        self.assertIn("2 payments bounced", rows["Dr. Mehta"]["reasons"][0]["text"])
        self.assertEqual([r["name"] for r in s["follow_up"]["rows"]], ["City Chemist", "Dr. Mehta"])   # biggest stake first

    def test_buying_problems_listed_before_paying_late(self):
        self.inv(self.chem, TODAY - timedelta(days=200), 90000)          # big overdue bill
        self.every(self.doc, 45, 20, 6, 5000)                            # small doctor gone quiet
        names = [r["name"] for r in self.S()["follow_up"]["rows"]]
        self.assertEqual(names, ["Dr. Mehta", "City Chemist"])

    def test_new_customers_and_full_top_list(self):
        self.inv(self.doc, TODAY - timedelta(days=200), 100)
        self.inv(self.chem, TODAY - timedelta(days=3), 800)       # first ever order in the period
        self.inv(self.doc, TODAY - timedelta(days=2), 500)
        s = summary(self.db, TODAY - timedelta(days=10), TODAY, Filters())
        self.assertEqual([c["name"] for c in s["new_customers"]], ["City Chemist"])
        self.assertEqual(len(s["top_customers"]["rows"]), 2)

    def test_customer_habit_in_customer_panel(self):
        self.every(self.doc, 45, 20, 6, 5000)
        c = customer_insights(self.db, self.doc.id)
        self.assertEqual((c["gap_low"], c["gap_high"], c["not_ordering"]), (20, 20, True))

    # ---------- ageing / modes / trend ----------
    def test_ageing_buckets_as_of_today(self):
        self.inv(self.doc, TODAY - timedelta(days=10), 100)
        self.inv(self.doc, TODAY - timedelta(days=45), 200)
        self.inv(self.doc, TODAY - timedelta(days=75), 300, [(100, TODAY, "UPI")])
        self.inv(self.doc, TODAY - timedelta(days=200), 400)
        self.inv(self.doc, TODAY - timedelta(days=95), 50, [(50, TODAY, "UPI")])   # paid: not in ageing
        self.inv(self.dist, TODAY - timedelta(days=50), 70)    # distributor: 60 days' credit, not due yet
        self.inv(self.dist, TODAY - timedelta(days=65), 30)    # 5 days past 60
        ages = {a["bucket"]: a["amount"] for a in self.S()["ageing"]}
        # by bill age: 10 d | 45 d + dist 50 d | 75 d (200 left) + dist 65 d | 200 d
        self.assertEqual(ages, {"0-39": 100, "40-59": 270, "60-89": 230, "90+": 400})
        k = self.S()["kpis"]["outstanding"]
        self.assertEqual((k["value"], k["overdue"], k["not_due"]), (1000, 830, 170))

    def test_payment_modes_and_trend(self):
        self.books()
        modes = {m["mode"]: m["amount"] for m in self.S()["payment_modes"]}
        self.assertEqual(modes, {"Upi": 1000, "Cash": 1000, "Cheque": 400})
        trend = self.S()["trend"]["points"]
        self.assertEqual(len(trend), 12)
        self.assertEqual(trend[-1]["sales"], 4500)
        self.assertEqual(trend[-2]["sales"], 2400)
        weekly = summary(self.db, M0, TODAY, Filters(), "weekly")["trend"]
        self.assertEqual((weekly["kind"], len(weekly["points"])), ("weekly", 12))

    # ---------- drill-down ----------
    def test_records_add_up_to_the_figures(self):
        self.books()
        k = self.S()["kpis"]
        for kind, key in (("sales", "sales"), ("collected", "collected"), ("outstanding", "outstanding")):
            self.assertEqual(invoice_list(self.db, kind, M0, TODAY, Filters())["total"], k[key]["value"], kind)
        rows = invoice_list(self.db, "collected", M0, TODAY, Filters(customer_type="Chemist"))["items"]
        self.assertEqual(sorted(r["amount"] for r in rows), [400, 1000])
        with self.assertRaises(HTTPException):
            insights_records("age", "100+", None, None, None, None, None, self.db, self.admin)

    def test_customer_insights(self):
        self.books()
        c = customer_insights(self.db, self.chem.id)
        self.assertEqual((c["type"], c["area"], c["mr"]), ("Chemist", "Andheri", "Rahul"))
        self.assertEqual(c["outstanding"], 0)
        self.assertEqual(c["invoice_count"], 2)
        self.assertEqual(len(c["months"]), 12)
        self.assertEqual(c["months"][-1]["sales"], 1000)
        self.assertIsNone(customer_insights(self.db, 9999))

    # ---------- inputs ----------
    def test_bad_inputs_are_refused(self):
        with self.assertRaises(HTTPException):
            insights_summary(TODAY, M0 - timedelta(days=1), None, None, None, "monthly", self.db, self.admin) if TODAY > M0 else (_ for _ in ()).throw(HTTPException(422))
        with self.assertRaises(HTTPException):
            insights_summary(None, None, "Nursing home", None, None, "monthly", self.db, self.admin)
        with self.assertRaises(HTTPException):
            insights_summary(date(2020, 1, 1), TODAY, None, None, None, "monthly", self.db, self.admin)
        ok = insights_summary(None, None, "doctor", None, None, "monthly", self.db, self.admin)
        self.assertEqual(ok["range"]["from"], M0.isoformat())   # defaults to this month

    # ---------- targets ----------
    def test_targets_save_and_carry_forward(self):
        month = M1.strftime("%Y-%m")
        put_targets(schemas.MrTargetsSave(month=month, targets=[schemas.MrTargetIn(mr_id=self.rahul.id, sales_target=200000, collection_target=150000)]), self.db, self.admin)
        this = {m["name"]: m for m in get_targets(M0.strftime("%Y-%m"), self.db, self.admin)["mrs"]}
        self.assertEqual(this["Rahul"]["sales_target"], 200000)
        self.assertTrue(this["Rahul"]["carried"])
        self.assertNotIn("sales_target", this["Neha"])
        self.books()
        rahul = {r["name"]: r for r in self.S()["by_mr"]["rows"]}["Rahul"]
        self.assertEqual(rahul["sales_target"], 200000)
        self.assertEqual(rahul["month_sales"], 4000)
        with self.assertRaises(HTTPException):
            put_targets(schemas.MrTargetsSave(month=month, targets=[schemas.MrTargetIn(mr_id=self.admin.id, sales_target=1)]), self.db, self.admin)
        self.assertEqual(self.db.query(models.AuditLog).filter_by(action="mr_targets_saved").count(), 1)

    # ---------- customer area ----------
    def test_customer_area_can_be_set_and_cleared(self):
        update_customer(self.doc.id, schemas.CustomerUpdate(area="  Borivali "), self.db, self.admin)
        self.db.refresh(self.doc)
        self.assertEqual(self.doc.area, "Borivali")
        update_customer(self.doc.id, schemas.CustomerUpdate(area=""), self.db, self.admin)
        self.db.refresh(self.doc)
        self.assertIsNone(self.doc.area)

    # ---------- Monday summary ----------
    def test_monday_summary_once_after_nine(self):
        from app import push
        from datetime import timezone
        ist = timezone(timedelta(hours=5, minutes=30))
        monday = TODAY - timedelta(days=TODAY.weekday())
        self.inv(self.chem, monday - timedelta(days=3), 1234, [(1000, monday - timedelta(days=2), "UPI")])
        env = {"VAPID_PRIVATE_KEY": "k", "VAPID_SUBJECT": "mailto:a@b.c"}
        with patch.dict(os.environ, env), patch.object(push, "SessionLocal", self.Session), \
                patch.object(push, "send_admin_notification") as send:
            at = lambda h, d=monday: datetime(d.year, d.month, d.day, h, 5, tzinfo=ist)
            self.assertFalse(push.send_weekly_summary_if_due(at(8)))                 # before 9
            self.assertFalse(push.send_weekly_summary_if_due(at(10, monday + timedelta(days=1))))   # Tuesday
            self.assertTrue(push.send_weekly_summary_if_due(at(9)))
            self.assertFalse(push.send_weekly_summary_if_due(at(11)))                # only once
            payload = send.call_args[0][0]
        self.assertEqual(send.call_count, 1)
        self.assertEqual(payload["title"], "Last week: ₹1,234 sales · ₹1,000 collected")


if __name__ == "__main__":
    unittest.main()
