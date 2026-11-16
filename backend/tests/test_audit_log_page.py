"""Admin Audit log: sign-ins, sign-outs, collections, reversals, changes,
imports and exports in one read-only timeline, for Admins only."""
import unittest
from datetime import date
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.routers import activity, admin, auth, customers, imports, invoices, mr, payments
from app.security import hash_password


class AuditLogPageTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        with self.Session() as db:
            db.add_all([
                models.User(name="Priya", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                models.User(name="Sameer", employee_code="ADMIN02", role="ADMIN", password_hash=hash_password("admin2-pass")),
                models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
                models.User(name="Faiyaz", employee_code="MR002", role="MR", password_hash=hash_password("faiyaz-pass")),
            ])
            db.commit()
            self.rahul = db.query(models.User).filter_by(employee_code="MR001").one().id
            self.faiyaz = db.query(models.User).filter_by(employee_code="MR002").one().id
            customer = models.Customer(name="Dr. Mehta Clinic", mr_id=self.rahul)
            db.add(customer); db.commit()
            self.customer = customer.id
            invoice = models.Invoice(invoice_number="INV-1081", invoice_date=date(2026, 9, 30), customer_id=customer.id,
                                     mr_id=self.rahul, total_amount=7400, paid_amount=0, pending_amount=7400, status="UNPAID")
            db.add(invoice); db.commit()
            self.invoice = invoice.id
        patcher = mock.patch("app.routers.payments.send_payment_notification")
        patcher.start(); self.addCleanup(patcher.stop)

        app = FastAPI()
        for router in (activity, auth, customers, admin, imports, invoices, mr, payments):
            app.include_router(router.router)

        def db_override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def auth(self, code, password):
        response = self.client.post("/auth/login", data={"username": code, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def log(self, headers, **params):
        response = self.client.get("/admin/audit", headers=headers, params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_everything_shows_newest_first_for_every_admin(self):
        rahul = self.auth("MR001", "rahul-pass")
        self.client.post("/auth/login", data={"username": "MR001", "password": "wrong"})
        self.client.post("/auth/login", data={"username": "NOBODY", "password": "x"})
        self.assertEqual(self.client.post("/payments", json={"invoice_id": self.invoice, "amount": 1000, "mode": "UPI"}, headers=rahul).status_code, 200)
        self.client.post("/auth/logout", headers=rahul)
        priya = self.auth("ADMIN01", "admin-pass")
        self.client.put(f"/admin/customers/{self.customer}/mr", json={"mr_id": self.faiyaz}, headers=priya)
        self.client.get("/admin/collections/export", headers=priya, params={"mode": "UPI"})

        # A different Admin sees all of it, including Priya's own actions.
        sameer = self.auth("ADMIN02", "admin2-pass")
        result = self.log(sameer, limit=50)
        actions = [item["action"] for item in result["items"]]
        for expected in ("signed_in", "sign_in_failed", "collected", "signed_out", "customer_mr_changed", "collections_exported"):
            self.assertIn(expected, actions)
        stamps = [item["at"] for item in result["items"]]
        self.assertEqual(stamps, sorted(stamps, reverse=True))

        collected = next(item for item in result["items"] if item["action"] == "collected")
        self.assertEqual((collected["actor"]["name"], collected["amount"], collected["mode"], collected["invoice"]["number"], collected["customer"]["name"]),
                         ("Rahul", 1000, "UPI", "INV-1081", "Dr. Mehta Clinic"))
        mapped = next(item for item in result["items"] if item["action"] == "customer_mr_changed")
        self.assertEqual(mapped["changes"], [{"field": "mr", "old": "Rahul", "new": "Faiyaz"}])
        failures = [item for item in result["items"] if item["action"] == "sign_in_failed"]
        self.assertEqual({item["info"]["employee_code"] for item in failures}, {"MR001", "NOBODY"})
        self.assertEqual({(item["actor"] or {}).get("name") for item in failures}, {"Rahul", None})
        export = next(item for item in result["items"] if item["action"] == "collections_exported")
        self.assertEqual(export["info"]["filters"], {"mode": "UPI"})

    def test_filters_and_paging(self):
        rahul = self.auth("MR001", "rahul-pass")
        self.client.post("/payments", json={"invoice_id": self.invoice, "amount": 500, "mode": "Cash"}, headers=rahul)
        priya = self.auth("ADMIN01", "admin-pass")
        only_money = self.log(priya, type="collections")
        self.assertEqual([item["action"] for item in only_money["items"]], ["collected"])
        only_rahul = self.log(priya, user_id=self.rahul)
        self.assertTrue(only_rahul["items"] and all(item["actor"]["id"] == self.rahul for item in only_rahul["items"]))
        admins = self.log(priya, role="ADMIN")
        self.assertTrue(all(item["actor"]["role"] == "ADMIN" for item in admins["items"]))
        found = self.log(priya, search="Mehta")
        self.assertEqual([item["action"] for item in found["items"]], ["collected"])
        page1 = self.log(priya, limit=1, offset=0)
        page2 = self.log(priya, limit=1, offset=1)
        self.assertEqual(page1["total"], 3)  # Rahul signed in, collected; Priya signed in
        self.assertNotEqual(page1["items"][0]["id"], page2["items"][0]["id"])
        self.assertEqual(self.client.get("/admin/audit", headers=priya, params={"type": "nope"}).status_code, 422)

    def test_mrs_cannot_open_it(self):
        rahul = self.auth("MR001", "rahul-pass")
        self.assertEqual(self.client.get("/admin/audit", headers=rahul).status_code, 403)
        self.assertEqual(self.client.get("/admin/audit").status_code, 401)


if __name__ == "__main__":
    unittest.main()
