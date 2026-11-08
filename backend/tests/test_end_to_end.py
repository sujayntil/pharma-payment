"""End-to-end business flow through every router with real login.

Nothing here fakes authentication: users get bcrypt-hashed passwords, log in
through /auth/login, and every call carries the real JWT. Only the database
session is swapped for an isolated one.

By default this runs on in-memory SQLite. Production runs on Postgres (Neon),
so to check Postgres-specific SQL point it at a THROWAWAY Postgres database:

    TEST_DATABASE_URL=postgresql://user@localhost:55432/pharma_test \\
        python -m unittest tests.test_end_to_end

All tables in that database are dropped and recreated. Never point it at
production.
"""

import io
import os
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.routers import admin, auth, customers, imports, invoices, mr, notifications, payments
from app.security import hash_password

IST = timezone(timedelta(hours=5, minutes=30))
TODAY = datetime.now(IST).date()


def _engine():
    url = os.getenv("TEST_DATABASE_URL")
    if url:
        if "neon.tech" in url:
            raise RuntimeError("Refusing to run destructive tests against a Neon URL")
        return create_engine(url)
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def workbook(rows):
    wb = Workbook()
    sheet = wb.active
    sheet.append(["SALES BOOK"])
    sheet.append(["period"])
    sheet.append(["DATE", "BILL NO.", "PARTY NAME", "BILL AMT.", "TAXABLE", "TAX"])
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


class EndToEndFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = _engine()
        Base.metadata.drop_all(cls.engine)
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False)

        app = FastAPI()
        for router in (auth, invoices, payments, notifications, customers, admin, imports, mr):
            app.include_router(router.router)

        def db_override():
            db = cls.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = db_override
        cls.client = TestClient(app)
        cls.push = mock.patch("app.routers.payments.send_payment_notification")
        cls.push.start()

        with cls.Session() as db:
            db.add_all([
                models.User(name="Admin", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
                models.User(name="Neha", employee_code="MR002", role="MR", password_hash=hash_password("neha-pass")),
            ])
            db.commit()

        cls.admin = cls.login("ADMIN01", "admin-pass")
        cls.rahul = cls.login("MR001", "rahul-pass")
        cls.neha = cls.login("MR002", "neha-pass")

    @classmethod
    def tearDownClass(cls):
        cls.push.stop()
        cls.client.close()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    @classmethod
    def login(cls, code, password):
        response = cls.client.post("/auth/login", data={"username": code, "password": password})
        assert response.status_code == 200, response.text
        body = response.json()
        return {"headers": {"Authorization": f"Bearer {body['access_token']}"}, "id": body["user_id"], "role": body["role"]}

    def call(self, who, method, url, expect=200, **kwargs):
        response = self.client.request(method, url, headers=who["headers"] if who else {}, **kwargs)
        self.assertEqual(response.status_code, expect, f"{method} {url}: {response.text}")
        return response.json() if response.content else None

    def assert_ledger_consistent(self):
        """Every invoice's paid amount equals its ledger total, and balances add up."""
        with self.Session() as db:
            for invoice in db.query(models.Invoice).all():
                ledger = db.query(func.coalesce(func.sum(models.Payment.amount), 0)).filter(
                    models.Payment.invoice_id == invoice.id).scalar()
                self.assertAlmostEqual(float(ledger), invoice.paid_amount, 2, f"ledger mismatch on {invoice.invoice_number}")
                self.assertAlmostEqual(invoice.pending_amount, max(invoice.total_amount - invoice.paid_amount, 0), 2)
                expected = "PAID" if invoice.pending_amount <= 0 else ("UNPAID" if invoice.paid_amount <= 0 else "PARTIAL")
                self.assertEqual(invoice.status, expected, invoice.invoice_number)

    def invoice_id(self, number):
        with self.Session() as db:
            return db.query(models.Invoice).filter_by(invoice_number=number).one().id

    # Tests run in name order; each step builds on the previous ones.

    def test_01_authentication_and_roles(self):
        self.client.post("/auth/login", data={"username": "MR001", "password": "wrong"})
        bad = self.client.post("/auth/login", data={"username": "MR001", "password": "wrong"})
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(self.client.get("/mr/dashboard").status_code, 401)
        self.assertEqual(self.client.get("/mr/dashboard", headers={"Authorization": "Bearer junk"}).status_code, 401)
        self.assertEqual(self.call(self.rahul, "GET", "/auth/me")["name"], "Rahul")
        for url in ("/admin/dashboard", "/admin/collections", "/admin/users", "/invoices", "/admin/overdue-alerts"):
            self.call(self.rahul, "GET", url, expect=403)

    def test_02_import_and_map_customers(self):
        old = TODAY - timedelta(days=55)
        rows = [
            [old, "T100", "Tulsi Pharmacy", 10000, 9000, 1000],
            [TODAY - timedelta(days=5), "T101", "Tulsi Pharmacy", 5000, 4500, 500],
            [old, "S200", "Shree Distributors", 8000, 7200, 800],
            [TODAY - timedelta(days=2), "S201", "Shree Distributors", 2000, 1800, 200],
        ]
        files = {"file": ("sales.xlsx", workbook(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        result = self.call(self.admin, "POST", "/admin/import-invoices", files=files)
        self.assertEqual(result["created"], 4, result)
        self.assertEqual(len(result["unmapped_customers"]), 2)
        # Re-uploading is idempotent.
        files = {"file": ("sales.xlsx", workbook(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        self.assertEqual(self.call(self.admin, "POST", "/admin/import-invoices", files=files)["created"], 0)
        # MRs can't import.
        files = {"file": ("sales.xlsx", workbook(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        self.call(self.rahul, "POST", "/admin/import-invoices", files=files, expect=403)

        listed = self.call(self.admin, "GET", "/customers", params={"limit": 50, "offset": 0})["items"]
        by_name = {c["name"]: c["id"] for c in listed}
        self.call(self.admin, "PUT", f"/admin/customers/{by_name['Tulsi Pharmacy']}/mr", json={"mr_id": self.rahul["id"]})
        self.call(self.admin, "PUT", f"/admin/customers/{by_name['Shree Distributors']}/mr", json={"mr_id": self.neha["id"]})
        self.call(self.admin, "PUT", f"/admin/customers/{by_name['Tulsi Pharmacy']}/mr", json={"mr_id": self.admin["id"]}, expect=400)

        # Disabled: Add Invoice is commented out, so the route is gone.
        # manual = self.call(self.admin, "POST", "/admin/manual-invoices", expect=201, json={
        #     "invoice_number": "T102", "invoice_date": str(TODAY), "customer_id": by_name["Tulsi Pharmacy"], "total_amount": 3000})
        # self.assertEqual(manual["mr_name"], "Rahul")
        # self.call(self.admin, "POST", "/admin/manual-invoices", expect=409, json={
        #     "invoice_number": "T102", "invoice_date": str(TODAY), "customer_id": by_name["Tulsi Pharmacy"], "total_amount": 3000})
        self.call(self.admin, "POST", "/admin/manual-invoices", expect=404, json={
            "invoice_number": "T102", "invoice_date": str(TODAY), "customer_id": by_name["Tulsi Pharmacy"], "total_amount": 3000})
        self.call(self.rahul, "POST", "/invoices", expect=405, json={
            "invoice_number": "X1", "customer_name": "Tulsi Pharmacy", "total_amount": 10})
        # T102 is seeded directly instead (same shape the manual route produced).
        with self.Session() as db:
            db.add(models.Invoice(
                invoice_number="T102", invoice_date=TODAY, customer_id=by_name["Tulsi Pharmacy"],
                mr_id=self.rahul["id"], total_amount=3000, paid_amount=0, pending_amount=3000, status="UNPAID",
            ))
            db.commit()

    def test_03_mr_sees_only_own_data_with_filters(self):
        rahul = self.call(self.rahul, "GET", "/mr/outstanding", params={"limit": 50, "offset": 0})
        self.assertEqual({i["invoice_number"] for i in rahul["items"]}, {"T100", "T101", "T102"})
        self.assertEqual(rahul["total_outstanding"], 18000)
        neha = self.call(self.neha, "GET", "/mr/outstanding", params={"limit": 50, "offset": 0})
        self.assertEqual({i["invoice_number"] for i in neha["items"]}, {"S200", "S201"})

        by_amount = self.call(self.rahul, "GET", "/mr/outstanding", params={"sort_order": "amount"})["items"]
        self.assertEqual([i["invoice_number"] for i in by_amount], ["T100", "T101", "T102"])
        oldest = self.call(self.rahul, "GET", "/mr/outstanding", params={"sort_order": "oldest"})["items"]
        self.assertEqual(oldest[0]["invoice_number"], "T100")
        recent = self.call(self.rahul, "GET", "/mr/outstanding", params={"date_from": str(TODAY - timedelta(days=7)), "date_to": str(TODAY)})["items"]
        self.assertEqual({i["invoice_number"] for i in recent}, {"T101", "T102"})
        searched = self.call(self.rahul, "GET", "/mr/outstanding", params={"search": "t101"})["items"]
        self.assertEqual([i["invoice_number"] for i in searched], ["T101"])
        # Searching for another MR's invoice finds nothing.
        self.assertEqual(self.call(self.rahul, "GET", "/mr/outstanding", params={"search": "S200"})["items"], [])
        self.call(self.rahul, "GET", "/mr/outstanding", params={"date_from": str(TODAY), "date_to": str(TODAY - timedelta(days=1))}, expect=422)
        self.call(self.rahul, "GET", "/mr/outstanding", params={"sort_order": "bogus"}, expect=422)

        customers_ = self.call(self.rahul, "GET", "/mr/customers", params={"limit": 50, "offset": 0})["items"]
        self.assertEqual([c["name"] for c in customers_], ["Tulsi Pharmacy"])
        shree = self.call(self.admin, "GET", "/customers", params={"search": "Shree"})["items"][0]
        self.call(self.rahul, "GET", f"/customers/{shree['id']}/ledger", expect=404)
        self.call(self.rahul, "GET", f"/invoices/{self.invoice_id('S200')}", expect=403)
        self.call(self.rahul, "GET", f"/invoices/{self.invoice_id('S200')}/payments", expect=403)

    def test_04_mr_records_collections_with_validation(self):
        t100 = self.invoice_id("T100")
        self.call(self.rahul, "POST", "/payments", expect=400, json={"invoice_id": t100, "amount": 0})
        self.call(self.rahul, "POST", "/payments", expect=400, json={"invoice_id": t100, "amount": 10000.5})
        self.call(self.rahul, "POST", "/payments", expect=403, json={"invoice_id": self.invoice_id("S200"), "amount": 100})
        self.call(self.rahul, "POST", "/payments", expect=404, json={"invoice_id": 999999, "amount": 100})
        result = self.call(self.rahul, "POST", "/payments", json={"invoice_id": t100, "amount": 4000, "mode": "UPI", "transaction_reference": "UTR1"})
        self.assertEqual((result["status"], result["pending_amount"]), ("PARTIAL", 6000))
        self.assert_ledger_consistent()

    def test_05_admin_records_on_mr_invoice_and_mr_sees_it(self):
        t101 = self.invoice_id("T101")
        self.call(self.admin, "POST", "/payments", json={"invoice_id": t101, "amount": 5000, "mode": "Cash"})
        mine = {i["invoice_number"]: i for i in self.call(self.rahul, "GET", "/invoices/mine")}
        self.assertEqual(mine["T101"]["status"], "PAID")
        self.assertTrue(mine["T101"]["last_collection_by_admin"])
        self.assertEqual(mine["T101"]["last_collection_by"], "Admin")
        self.assertFalse(mine["T100"]["last_collection_by_admin"])
        history = self.call(self.rahul, "GET", f"/invoices/{t101}/payments")
        self.assertEqual([p["recorded_by_admin"] for p in history["payments"]], [True])
        tulsi = self.call(self.rahul, "GET", "/mr/customers")[0]
        ledger = self.call(self.rahul, "GET", f"/customers/{tulsi['id']}/ledger")
        self.assertTrue({i["invoice_number"]: i for i in ledger["invoices"]}["T101"]["last_collection_by_admin"])
        self.assert_ledger_consistent()

    def test_06_admin_mark_unpaid_reverses_and_mark_paid_settles(self):
        t100 = self.invoice_id("T100")
        before = self.call(self.admin, "GET", "/admin/collections")["total_amount"]
        reversed_ = self.call(self.admin, "PUT", f"/admin/invoices/{t100}/collection-status", json={"status": "UNPAID", "reason": "Cheque bounced"})
        self.assertEqual((reversed_["status"], reversed_["ledger_amount"]), ("UNPAID", -4000))
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections")["total_amount"], before - 4000)
        outstanding = {i["invoice_number"]: i for i in self.call(self.rahul, "GET", "/mr/outstanding")["items"]}
        self.assertTrue(outstanding["T100"]["last_collection_is_reversal"])

        # Marking an already-unpaid invoice unpaid adds nothing.
        again = self.call(self.admin, "PUT", f"/admin/invoices/{t100}/collection-status", json={"status": "UNPAID"})
        self.assertEqual(again["ledger_amount"], 0)

        t102 = self.invoice_id("T102")
        settled = self.call(self.admin, "PUT", f"/admin/invoices/{t102}/collection-status", json={"status": "PAID", "mode": "Cash"})
        self.assertEqual((settled["status"], settled["ledger_amount"]), ("PAID", 3000))
        self.call(self.admin, "PUT", f"/admin/invoices/{t102}/collection-status", json={"status": "PARTIAL"}, expect=422)
        self.call(self.rahul, "PUT", f"/admin/invoices/{t102}/collection-status", json={"status": "UNPAID"}, expect=403)

        history = self.call(self.admin, "GET", f"/invoices/{t100}/payments")["payments"]
        self.assertEqual([p["amount"] for p in history], [-4000, 4000])
        self.assertIn("Cheque bounced", history[0]["transaction_reference"])
        self.assert_ledger_consistent()

    def test_07_admin_collection_filters_and_totals_agree(self):
        everything = self.call(self.admin, "GET", "/admin/collections")
        # Ledger so far: +4000 (Rahul), +5000 (Admin), -4000 (Admin reversal), +3000 (Admin settle)
        self.assertEqual((everything["total_count"], everything["total_amount"]), (4, 8000))
        by_admin = self.call(self.admin, "GET", "/admin/collections", params={"recorded_by": "ADMIN"})
        by_mr = self.call(self.admin, "GET", "/admin/collections", params={"recorded_by": "MR"})
        self.assertEqual(by_admin["total_amount"] + by_mr["total_amount"], everything["total_amount"])
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"entry_type": "reversal"})["total_amount"], -4000)
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"entry_type": "collection"})["total_amount"], 12000)
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"mr_id": self.neha["id"]})["total_count"], 0)
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"mode": "cash"})["total_amount"], 8000)
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"search": "UTR1"})["total_count"], 1)
        today = self.call(self.admin, "GET", "/admin/collections", params={"date_from": str(TODAY), "date_to": str(TODAY)})
        self.assertEqual(today["total_amount"], 8000)
        tomorrow = str(TODAY + timedelta(days=1))
        self.assertEqual(self.call(self.admin, "GET", "/admin/collections", params={"date_from": tomorrow})["total_count"], 0)
        for bad in ({"recorded_by": "x"}, {"entry_type": "x"}, {"date_from": str(TODAY), "date_to": str(TODAY - timedelta(days=1))}):
            self.call(self.admin, "GET", "/admin/collections", params=bad, expect=422)

        # Dashboard "collected" for today matches the collections ledger.
        dashboard = self.call(self.admin, "GET", "/admin/dashboard", params={"date_from": str(TODAY), "date_to": str(TODAY)})
        self.assertEqual(dashboard["collected"], today["total_amount"])
        all_time = self.call(self.admin, "GET", "/admin/dashboard")
        self.assertEqual(all_time["total_sales"], 28000)
        self.assertEqual(all_time["outstanding"], 28000 - 8000)
        self.call(self.admin, "GET", "/admin/dashboard", params={"customer_type": "nonsense"}, expect=422)

        performance = {row["name"]: row for row in self.call(self.admin, "GET", "/admin/mr-performance")}
        self.assertEqual(performance["Rahul"]["collected"], 8000)
        self.assertEqual(performance["Rahul"]["sales"], 18000)
        self.assertEqual(performance["Neha"]["collected"], 0)

        recent = self.call(self.admin, "GET", "/admin/recent-payments")
        self.assertEqual(len(recent), 4)

    def test_08_admin_invoice_list_filters(self):
        def numbers(**params):
            return {i["invoice_number"] for i in self.call(self.admin, "GET", "/invoices", params={"limit": 50, "offset": 0, **params})["items"]}
        self.assertEqual(numbers(), {"T100", "T101", "T102", "S200", "S201"})
        self.assertEqual(numbers(status="PAID"), {"T101", "T102"})
        self.assertEqual(numbers(mr_id=self.neha["id"]), {"S200", "S201"})
        self.assertEqual(numbers(search="shree"), {"S200", "S201"})
        self.assertEqual(numbers(search="neha"), {"S200", "S201"})
        self.assertEqual(numbers(date_from=str(TODAY - timedelta(days=3))), {"T102", "S201"})
        page = self.call(self.admin, "GET", "/invoices", params={"limit": 2, "offset": 2})
        self.assertEqual((page["total"], len(page["items"])), (5, 2))

        mine = {i["invoice_number"] for i in self.call(self.rahul, "GET", "/invoices/mine", params={"status": "UNPAID", "limit": 50, "offset": 0})["items"]}
        self.assertEqual(mine, {"T100"})
        self.call(self.rahul, "GET", "/invoices/mine", params={"status": "nope"}, expect=422)

    def test_09_overdue_alerts_scoped_per_mr(self):
        admin_view = {r["customer"]: r for r in self.call(self.admin, "GET", "/admin/overdue-alerts")}
        self.assertEqual(set(admin_view), {"Tulsi Pharmacy", "Shree Distributors"})
        self.assertEqual(admin_view["Tulsi Pharmacy"]["overdue_amount"], 10000)  # T100 was reversed back to unpaid
        rahul = self.call(self.rahul, "GET", "/mr/overdue-alerts")
        self.assertEqual([(r["customer"], r["overdue_amount"]) for r in rahul], [("Tulsi Pharmacy", 10000)])
        neha = self.call(self.neha, "GET", "/mr/overdue-alerts")
        self.assertEqual([(r["customer"], r["overdue_amount"], r["days_overdue"]) for r in neha], [("Shree Distributors", 8000, 55)])

    def test_10_edit_delete_permissions(self):
        s200 = self.invoice_id("S200")
        self.call(self.rahul, "PUT", f"/invoices/{s200}", json={"remarks": "x"}, expect=403)
        self.call(self.rahul, "DELETE", f"/invoices/{s200}", expect=403)
        # MR edit/delete is disabled, even on their own invoices.
        self.call(self.neha, "PUT", f"/invoices/{s200}", json={"remarks": "follow up"}, expect=403)
        self.call(self.neha, "DELETE", f"/invoices/{s200}", expect=403)
        edited = self.call(self.admin, "PUT", f"/invoices/{s200}", json={"remarks": "follow up"})
        self.assertEqual(edited["remarks"], "follow up")
        # Changing the total recomputes status against the ledger.
        t101 = self.invoice_id("T101")
        edited = self.call(self.admin, "PUT", f"/invoices/{t101}", json={"total_amount": 6000})
        self.assertEqual((edited["status"], edited["pending_amount"]), ("PARTIAL", 1000))
        self.assert_ledger_consistent()

    def test_11_user_management_guards(self):
        users = self.call(self.admin, "GET", "/admin/users")
        self.assertEqual(len(users), 3)
        created = self.call(self.admin, "POST", "/admin/users", json={"name": "Temp", "employee_code": "MR009", "role": "MR", "password": "temp-pass"})
        self.call(self.admin, "POST", "/admin/users", json={"name": "Dup", "employee_code": "MR009", "role": "MR", "password": "x"}, expect=400)
        self.assertEqual(self.login("MR009", "temp-pass")["role"], "MR")
        self.call(self.admin, "DELETE", f"/admin/users/{created['id']}", expect=204)
        self.call(self.admin, "DELETE", f"/admin/users/{self.admin['id']}", expect=400)
        self.call(self.admin, "DELETE", f"/admin/users/{self.rahul['id']}", expect=400)  # has invoices
        self.call(self.rahul, "POST", "/admin/users", json={"name": "X", "employee_code": "X", "role": "ADMIN", "password": "x"}, expect=403)

    def test_12_final_consistency(self):
        self.assert_ledger_consistent()
        mr_dash = self.call(self.rahul, "GET", "/mr/dashboard")
        self.assertEqual(mr_dash["total_invoices"], 3)


if __name__ == "__main__":
    unittest.main()
