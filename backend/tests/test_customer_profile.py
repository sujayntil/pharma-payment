"""Customer page and top-bar search: numbers, statement, and who may see what."""
import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base
from app.insights import today_ist
from app.quick_search import quick_search_results
from app.routers.customers import customer_profile
from app.security import hash_password


class CustomerProfileTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        pw = hash_password("x-pass-1234")
        self.admin = models.User(name="Boss", employee_code="AD1", role="ADMIN", password_hash=pw)
        self.mr = models.User(name="Amit", employee_code="MR1", role="MR", password_hash=pw)
        self.other = models.User(name="Neha", employee_code="MR2", role="MR", password_hash=pw)
        self.db.add_all([self.admin, self.mr, self.other])
        self.db.flush()
        self.cust = models.Customer(name="Gupta Medicals", type="Chemist", mr_id=self.mr.id, phone="9800000001")
        self.theirs = models.Customer(name="Gupta Pharma", type="Chemist", mr_id=self.other.id)
        self.db.add_all([self.cust, self.theirs])
        self.db.flush()
        today = today_ist()

        def bill(no, cust, days_ago, total, paid=0):
            inv = models.Invoice(invoice_number=no, customer_id=cust.id, mr_id=cust.mr_id, total_amount=total,
                                 paid_amount=paid, pending_amount=total - paid,
                                 invoice_date=today - timedelta(days=days_ago),
                                 status="PAID" if paid >= total else ("PARTIAL" if paid else "UNPAID"))
            self.db.add(inv)
            self.db.flush()
            return inv

        a = bill("G-1", self.cust, 100, 1000, paid=1000)   # paid 30 days after billing
        bill("G-2", self.cust, 60, 2000, paid=500)          # 20 days overdue, 1500 owed
        bill("G-3", self.cust, 5, 3000)                     # not due
        bill("P-1", self.theirs, 5, 9000)
        paid_on = datetime.combine(today - timedelta(days=70), datetime.min.time()).replace(tzinfo=timezone.utc).replace(tzinfo=None)
        self.db.add(models.Payment(invoice_id=a.id, amount=1000, mode="UPI", payment_date=paid_on, collected_by=self.mr.id))
        g2 = self.db.query(models.Invoice).filter_by(invoice_number="G-2").one()
        self.db.add(models.Payment(invoice_id=g2.id, amount=500, mode="Cash", payment_date=paid_on, collected_by=self.mr.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_summary_and_statement(self):
        data = customer_profile(self.cust.id, self.db, self.admin)
        s = data["summary"]
        self.assertEqual((s["owed"], s["overdue"], s["overdue_bills"], s["oldest_overdue_days"]), (4500, 1500, 1, 20))
        self.assertEqual((s["open_bills"], s["bills"], s["credit_days"]), (2, 3, 40))
        self.assertEqual(s["billed_12m"], 6000)
        self.assertEqual(s["avg_days_to_pay"], 30)
        # Newest first; the top balance is what is owed now.
        self.assertEqual(data["statement"][0]["balance"], 4500)
        self.assertEqual(len(data["statement"]), 5)
        self.assertEqual(len(data["monthly"]), 12)
        self.assertIn("schemes", data)

    def test_mr_sees_own_customer_without_schemes(self):
        data = customer_profile(self.cust.id, self.db, self.mr)
        self.assertNotIn("schemes", data)
        with self.assertRaises(HTTPException) as err:
            customer_profile(self.theirs.id, self.db, self.mr)
        self.assertEqual(err.exception.status_code, 404)

    def test_search_scope(self):
        everyone = quick_search_results(self.db, "gupta")
        self.assertEqual(everyone["customer_count"], 2)
        own = quick_search_results(self.db, "gupta", self.mr.id)
        self.assertEqual([c["name"] for c in own["customers"]], ["Gupta Medicals"])
        self.assertEqual({i["invoice_number"] for i in own["invoices"]}, {"G-1", "G-2", "G-3"})
        self.assertEqual(quick_search_results(self.db, "P-1", self.mr.id)["invoice_count"], 0)


if __name__ == "__main__":
    unittest.main()
