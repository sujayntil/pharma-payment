import os
import tempfile
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
from app.routers import admin, auth, customers, imports, invoices, mr, payments, uploads
from app.security import hash_password


class SessionsAuditUploadsTests(unittest.TestCase):
    """Sessions end on log out / password reset, changes are audited, and
    uploaded files need a login."""

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        with self.Session() as db:
            db.add_all([
                models.User(name="Admin", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
                models.User(name="Neha", employee_code="MR002", role="MR", password_hash=hash_password("neha-pass")),
            ])
            db.commit()
            self.rahul_id = db.query(models.User).filter_by(employee_code="MR001").one().id
            self.neha_id = db.query(models.User).filter_by(employee_code="MR002").one().id
            customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.rahul_id)
            db.add(customer)
            db.commit()
            self.customer_id = customer.id
            invoice = models.Invoice(
                invoice_number="A100", invoice_date=date(2026, 10, 1), customer_id=customer.id, mr_id=self.rahul_id,
                total_amount=1000, paid_amount=0, pending_amount=1000, status="UNPAID", image_path="uploads/abc_bill.jpg",
            )
            db.add(invoice)
            db.commit()
            self.invoice_id = invoice.id

        self.upload_dir = tempfile.TemporaryDirectory()
        with open(os.path.join(self.upload_dir.name, "abc_bill.jpg"), "wb") as handle:
            handle.write(b"fake-image")
        with open(os.path.join(self.upload_dir.name, "other.jpg"), "wb") as handle:
            handle.write(b"someone-else")
        patches = [
            mock.patch.object(uploads, "UPLOAD_DIR", self.upload_dir.name),
            mock.patch("app.routers.payments.send_payment_notification"),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(self.upload_dir.cleanup)

        app = FastAPI()
        for router in (auth, customers, admin, imports, invoices, mr, payments, uploads):
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

    def audit(self, action):
        with self.Session() as db:
            return [(row.user_id, row.old_value, row.new_value)
                    for row in db.query(models.AuditLog).filter_by(action=action).order_by(models.AuditLog.id)]

    # ---- sessions ----

    def test_logout_ends_only_that_session(self):
        phone = self.auth("MR001", "rahul-pass")
        laptop = self.auth("MR001", "rahul-pass")
        self.assertEqual(self.client.get("/auth/me", headers=phone).status_code, 200)
        self.assertEqual(self.client.post("/auth/logout", headers=phone).status_code, 204)
        self.assertEqual(self.client.get("/auth/me", headers=phone).status_code, 401)
        self.assertEqual(self.client.get("/mr/dashboard", headers=phone).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=laptop).status_code, 200)
        self.assertEqual(self.client.post("/auth/logout").status_code, 401)
        # Signing in again works as normal.
        self.assertEqual(self.client.get("/auth/me", headers=self.auth("MR001", "rahul-pass")).status_code, 200)

    def test_password_reset_ends_that_users_sessions(self):
        admin_headers = self.auth("ADMIN01", "admin-pass")
        rahul = self.auth("MR001", "rahul-pass")
        neha = self.auth("MR002", "neha-pass")
        with self.Session() as db:  # make the reset clearly later than the logins
            from datetime import datetime, timedelta, timezone
            later = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=5)
        with mock.patch("app.routers.admin.datetime") as fake:
            fake.now.return_value = later.replace(tzinfo=timezone.utc)
            reset = self.client.put(f"/admin/users/{self.rahul_id}", json={"password": "brand-new-pass"}, headers=admin_headers)
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=rahul).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=neha).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=admin_headers).status_code, 200)
        # Editing a user without a password does not sign them out.
        self.assertEqual(self.client.put(f"/admin/users/{self.neha_id}", json={"phone": "999"}, headers=admin_headers).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=neha).status_code, 200)

    def test_tokens_issued_before_this_change_still_work(self):
        from app.security import ALGORITHM, SECRET_KEY
        from datetime import datetime, timedelta, timezone
        from jose import jwt
        legacy = jwt.encode({"sub": str(self.rahul_id), "role": "MR", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                            SECRET_KEY, algorithm=ALGORITHM)
        self.assertEqual(self.client.get("/auth/me", headers={"Authorization": f"Bearer {legacy}"}).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers={"Authorization": "Bearer junk"}).status_code, 401)

    # ---- audit trail ----

    def test_invoice_edit_and_delete_are_audited_with_payment_history(self):
        admin_headers = self.auth("ADMIN01", "admin-pass")
        rahul = self.auth("MR001", "rahul-pass")
        self.assertEqual(self.client.post("/payments", json={"invoice_id": self.invoice_id, "amount": 400, "mode": "UPI"}, headers=rahul).status_code, 200)
        edited = self.client.put(f"/invoices/{self.invoice_id}", json={"total_amount": 1200, "remarks": "fixed"}, headers=admin_headers)
        self.assertEqual((edited.status_code, edited.json()["pending_amount"]), (200, 800))
        (_user, old, new), = self.audit("invoice_updated")
        self.assertEqual((old["total_amount"], new["total_amount"], new["remarks"], old["invoice_date"]), (1000, 1200, "fixed", "2026-10-01"))

        self.assertEqual(self.client.delete(f"/invoices/{self.invoice_id}", headers=admin_headers).status_code, 204)
        (_user, old, new), = self.audit("invoice_deleted")
        self.assertIsNone(new)
        self.assertEqual((old["invoice_number"], old["paid_amount"]), ("A100", 400))
        self.assertEqual([(p["amount"], p["mode"], p["collected_by"]) for p in old["payments"]], [(400, "UPI", self.rahul_id)])
        self.assertEqual(self.client.get(f"/invoices/{self.invoice_id}", headers=admin_headers).status_code, 404)

    def test_user_customer_and_assignment_changes_are_audited(self):
        admin_headers = self.auth("ADMIN01", "admin-pass")
        created = self.client.post("/admin/users", json={"name": "Temp", "employee_code": "MR009", "role": "MR", "password": "long-enough"}, headers=admin_headers)
        user_id = created.json()["id"]
        self.client.put(f"/admin/users/{user_id}", json={"name": "Temp 2", "password": "another-long-1"}, headers=admin_headers)
        self.assertEqual(self.client.delete(f"/admin/users/{user_id}", headers=admin_headers).status_code, 204)
        self.assertEqual(self.audit("user_created")[0][2]["employee_code"], "MR009")
        (_u, old, new), = self.audit("user_updated")
        self.assertEqual((old["name"], new["name"], new["password_changed"]), ("Temp", "Temp 2", True))
        self.assertNotIn("password", " ".join(new.keys()).replace("password_changed", ""))
        self.assertEqual(self.audit("user_deleted")[0][1]["employee_code"], "MR009")

        self.assertEqual(self.client.put(f"/admin/customers/{self.customer_id}/mr", json={"mr_id": self.neha_id}, headers=admin_headers).status_code, 200)
        (_u, old, new), = self.audit("customer_mr_changed")
        self.assertEqual((old["mr_id"], new["mr_id"]), (self.rahul_id, self.neha_id))
        # Saving the same MR again writes nothing new.
        self.client.put(f"/admin/customers/{self.customer_id}/mr", json={"mr_id": self.neha_id}, headers=admin_headers)
        self.assertEqual(len(self.audit("customer_mr_changed")), 1)
        self.assertEqual(self.client.put(f"/customers/{self.customer_id}", json={"phone": "12345"}, headers=admin_headers).status_code, 200)
        self.assertEqual(self.audit("customer_updated")[0][2]["phone"], "12345")

    # ---- uploads ----

    def test_uploaded_files_need_a_login_and_ownership(self):
        self.assertEqual(self.client.get("/uploads/abc_bill.jpg").status_code, 401)
        rahul = self.auth("MR001", "rahul-pass")
        neha = self.auth("MR002", "neha-pass")
        admin_headers = self.auth("ADMIN01", "admin-pass")
        own = self.client.get("/uploads/abc_bill.jpg", headers=rahul)
        self.assertEqual((own.status_code, own.content), (200, b"fake-image"))
        self.assertEqual(self.client.get("/uploads/abc_bill.jpg", headers=neha).status_code, 404)
        self.assertEqual(self.client.get("/uploads/other.jpg", headers=rahul).status_code, 404)
        self.assertEqual(self.client.get("/uploads/other.jpg", headers=admin_headers).status_code, 200)
        for bad in ("missing.jpg", "..%2F..%2Fapp%2Fmain.py", "%2E%2E", ".env"):
            self.assertEqual(self.client.get(f"/uploads/{bad}", headers=admin_headers).status_code, 404, bad)


if __name__ == "__main__":
    unittest.main()
