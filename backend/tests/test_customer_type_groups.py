"""Customer type filter: one set of groups everywhere (Distributor / Chemist /
Doctor / Hospital / Other), several at once, and the same totals on every page."""
import unittest
from datetime import date, datetime

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.customer_groups import parse_types
from app.database import Base, get_db
from app.routers import admin, auth, customers, insights, invoices, mr
from app.security import hash_password


class ParseTypesTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_types(None), [])
        self.assertEqual(parse_types(" chemist, Doctor ,chemist"), ["Chemist", "Doctor"])
        self.assertEqual(parse_types("hospital"), ["Hospital"])
        with self.assertRaises(HTTPException):
            parse_types("Chemist,Pharmacy")


class TypeFilterAcrossPagesTests(unittest.TestCase):
    # (type, bill, paid) per customer; "Clinic" and blank count as Other.
    DATA = [("Distributor", 50000, 10000), ("Chemist", 8000, 8000), ("Doctor", 6000, 1000),
            ("Hospital", 30000, 5000), ("Clinic", 4000, 0), (None, 2500, 500), ("hospital ", 1500, 0)]

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine, autoflush=False)
        with Session() as db:
            db.add_all([models.User(name="Priya", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                        models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass"))])
            db.commit()
            mr_id = db.query(models.User).filter_by(employee_code="MR001").one().id
            for n, (ctype, bill, paid) in enumerate(self.DATA):
                c = models.Customer(name=f"C{n}", type=ctype, mr_id=mr_id)
                db.add(c); db.flush()
                inv = models.Invoice(invoice_number=f"INV-{n}", invoice_date=date(2026, 11, 2), customer_id=c.id, mr_id=mr_id,
                                     total_amount=bill, paid_amount=paid, pending_amount=bill - paid,
                                     status="PAID" if paid >= bill else ("PARTIAL" if paid else "UNPAID"))
                db.add(inv); db.flush()
                if paid:
                    db.add(models.Payment(invoice_id=inv.id, amount=paid, mode="UPI", payment_date=datetime(2026, 11, 5, 6),
                                          collected_by=mr_id, recorded_by=mr_id))
            # An invoice with no customer counts as Other too.
            db.add(models.Invoice(invoice_number="INV-X", invoice_date=date(2026, 11, 3), mr_id=mr_id,
                                  total_amount=1000, paid_amount=0, pending_amount=1000, status="UNPAID"))
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

    def _get(self, path, types, headers=None, **params):
        response = self.client.get(path, params={**params, **({"customer_type": types} if types else {})}, headers=headers or self.admin)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def expected_sales(self, types):
        def group(t):
            t = (t or "").strip().lower()
            return next((g for g in ("Distributor", "Chemist", "Doctor", "Hospital") if g.lower() == t), "Other")
        total = sum(bill for t, bill, _ in self.DATA if not types or group(t) in types)
        return total + (1000 if not types or "Other" in types else 0)

    def test_same_totals_on_every_page(self):
        for types in ([], ["Hospital"], ["Other"], ["Chemist", "Doctor"], ["Hospital", "Other"], ["Distributor", "Chemist", "Doctor", "Hospital", "Other"]):
            q = ",".join(types)
            want = self.expected_sales(types)
            dash = self._get("/admin/dashboard", q, date_from="2026-11-01", date_to="2026-11-30")
            self.assertAlmostEqual(dash["total_sales"], want, msg=f"dashboard {q}")
            ins = self._get("/admin/insights", q, date_from="2026-11-01", date_to="2026-11-30")
            self.assertAlmostEqual(ins["kpis"]["sales"]["value"], want, msg=f"insights {q}")
            inv = self._get("/invoices", q, limit=100, offset=0)
            self.assertAlmostEqual(sum(i["total_amount"] for i in inv["items"]), want, msg=f"invoices {q}")
            col = self._get("/admin/collections", q, limit=100, offset=0)
            paid_want = sum(p for t, _b, p in self.DATA if not types or ({"distributor": "Distributor", "chemist": "Chemist", "doctor": "Doctor", "hospital": "Hospital"}.get((t or "").strip().lower(), "Other") in types))
            self.assertAlmostEqual(col["total_amount"], paid_want, msg=f"collections {q}")

    def test_hospital_is_its_own_type_on_the_dashboard(self):
        hospital = self._get("/admin/dashboard", "Hospital", date_from="2026-11-01", date_to="2026-11-30")
        other = self._get("/admin/dashboard", "Other", date_from="2026-11-01", date_to="2026-11-30")
        self.assertEqual(hospital["total_sales"], 31500)   # "Hospital" and "hospital " (trimmed)
        self.assertEqual(other["total_sales"], 7500)        # Clinic + blank + no customer

    def test_customer_lists_use_the_groups(self):
        names = lambda data: sorted(c["name"] for c in (data["items"] if isinstance(data, dict) else data))  # noqa: E731
        self.assertEqual(names(self._get("/customers", "Hospital", limit=50, offset=0)), ["C3", "C6"])
        self.assertEqual(names(self._get("/customers", "Other,Chemist", limit=50, offset=0)), ["C1", "C4", "C5"])
        self.assertEqual(names(self._get("/mr/customers", "Hospital", headers=self.mr, limit=50, offset=0)), ["C3", "C6"])

    def test_unknown_type_is_refused(self):
        self.assertEqual(self.client.get("/admin/dashboard", params={"customer_type": "Pharmacy"}, headers=self.admin).status_code, 422)


if __name__ == "__main__":
    unittest.main()
