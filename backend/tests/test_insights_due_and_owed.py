"""Insights: owed by due date, and owed / overdue per type, MR and top customer."""
import unittest
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base
from app.insights import Filters, summary, today_ist
from app.security import hash_password


class InsightsDueAndOwedTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        mr = models.User(name="Amit", employee_code="MR1", role="MR", password_hash=hash_password("x-pass-1234"))
        chem = models.Customer(name="Chem One", type="Chemist")
        dist = models.Customer(name="Dist One", type="Distributor")
        self.db.add_all([mr, chem, dist])
        self.db.flush()
        today = today_ist()

        def bill(no, cust, days_ago, total):
            self.db.add(models.Invoice(invoice_number=no, customer_id=cust.id, mr_id=mr.id, total_amount=total,
                                       paid_amount=0, pending_amount=total,
                                       invoice_date=today - timedelta(days=days_ago), status="UNPAID"))
        bill("C-NEW", chem, 10, 1000)    # chemist, 40-day credit: not due
        bill("C-LATE", chem, 50, 2000)   # 10 days overdue
        bill("C-OLD", chem, 120, 3000)   # 80 days overdue
        bill("D-45", dist, 45, 4000)     # distributor, 60-day credit: not due
        bill("D-95", dist, 95, 5000)     # 35 days overdue
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_due_bands_types_mrs_and_customers(self):
        data = summary(self.db, None, today_ist(), Filters())
        bands = {b["bucket"]: b["amount"] for b in data["due_ageing"]}
        self.assertEqual(bands, {"not_due": 5000, "1-30": 2000, "31-60": 5000, "60+": 3000})
        self.assertEqual(data["kpis"]["outstanding"]["overdue"], 10000)
        self.assertEqual(data["kpis"]["outstanding"]["overdue_customers"], 2)
        types = {r["type"]: r for r in data["by_type"]}
        self.assertEqual((types["Chemist"]["owed"], types["Chemist"]["overdue"]), (6000, 5000))
        self.assertEqual((types["Distributor"]["owed"], types["Distributor"]["overdue"]), (9000, 5000))
        mr = data["by_mr"]["rows"][0]
        self.assertEqual((mr["owed"], mr["overdue"]), (15000, 10000))
        top = {c["name"]: c for c in data["top_customers"]["rows"]}
        self.assertEqual((top["Dist One"]["owed"], top["Dist One"]["overdue"]), (9000, 5000))


if __name__ == "__main__":
    unittest.main()
