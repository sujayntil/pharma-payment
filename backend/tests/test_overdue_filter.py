"""Overdue filter: past the due date (bill date + 40 days, 60 for distributors),
optionally by more than N days; same rule on Invoices, MR Invoices, ledgers
and Insights."""
import unittest
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.insights import today_ist
from app.routers import admin, auth, customers, insights, invoices, mr
from app.security import hash_password


class OverdueFilterTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine, autoflush=False)
        today = today_ist()
        with Session() as db:
            db.add_all([models.User(name="Priya", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                        models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass"))])
            db.commit()
            mr_id = db.query(models.User).filter_by(employee_code="MR001").one().id
            doc = models.Customer(name="Dr. A", type="Doctor", mr_id=mr_id)
            dist = models.Customer(name="Dist B", type="Distributor", mr_id=mr_id)
            db.add_all([doc, dist]); db.flush()
            self.customer = doc.id
            # (number, customer, days ago, pending)
            for num, cust, ago, pending in [("D-39", doc, 39, 100), ("D-40", doc, 40, 200), ("D-44", doc, 44, 400),
                                            ("D-45", doc, 45, 800), ("D-PAID", doc, 90, 0),
                                            ("B-59", dist, 59, 1000), ("B-60", dist, 60, 2000), ("B-64", dist, 64, 4000)]:
                db.add(models.Invoice(invoice_number=num, invoice_date=today - timedelta(days=ago), customer_id=cust.id, mr_id=mr_id,
                                      total_amount=max(pending, 50), paid_amount=max(pending, 50) - pending, pending_amount=pending,
                                      status="PAID" if not pending else "UNPAID"))
            db.commit()
        app = FastAPI()
        for r in (admin, auth, customers, insights, invoices, mr):
            app.include_router(r.router)

        def db_override():
            db = Session()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)
        self.admin = self._login("ADMIN01", "admin-pass")
        self.mr = self._login("MR001", "rahul-pass")

    def tearDown(self):
        self.client.close()
        Base.metadata.drop_all(self.engine)

    def _login(self, code, password):
        token = self.client.post("/auth/login", data={"username": code, "password": password}).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def numbers(self, path, headers=None, **params):
        r = self.client.get(path, params={"limit": 100, "offset": 0, **params}, headers=headers or self.admin)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        rows = data.get("items") or data.get("invoices") or []
        return sorted(row["invoice_number"] for row in rows)

    def test_overdue_and_more_than_days(self):
        self.assertEqual(self.numbers("/invoices", due="overdue"), ["B-60", "B-64", "D-40", "D-44", "D-45"])
        # more than 4 days past due: due day + 5 or later (B-64 and D-44 are exactly 4)
        self.assertEqual(self.numbers("/invoices", due="overdue", overdue_days=4), ["D-45"])
        self.assertEqual(self.numbers("/invoices", due="overdue", overdue_days=3), ["B-64", "D-44", "D-45"])
        self.assertEqual(self.numbers("/invoices", due="notdue"), ["B-59", "D-39"])
        self.assertEqual(self.numbers("/invoices", due="overdue", customer_type="Doctor"), ["D-40", "D-44", "D-45"])

    def test_same_on_mr_invoices_and_ledger(self):
        self.assertEqual(self.numbers("/mr/outstanding", headers=self.mr, due="overdue", overdue_days=3), ["B-64", "D-44", "D-45"])
        self.assertEqual(self.numbers(f"/customers/{self.customer}/ledger", due="overdue"), ["D-40", "D-44", "D-45"])

    def test_total_matches_insights_overdue(self):
        r = self.client.get("/invoices", params={"limit": 100, "offset": 0, "due": "overdue"}, headers=self.admin).json()
        ins = self.client.get("/admin/insights", params={"all_time": True}, headers=self.admin).json()
        self.assertAlmostEqual(r["filtered_outstanding"], ins["kpis"]["outstanding"]["overdue"])

    def test_bad_input(self):
        self.assertEqual(self.client.get("/invoices", params={"due": "late"}, headers=self.admin).status_code, 422)
        self.assertEqual(self.client.get("/invoices", params={"due": "overdue", "overdue_days": -1}, headers=self.admin).status_code, 422)


if __name__ == "__main__":
    unittest.main()
