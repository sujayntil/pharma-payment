import unittest
from unittest import mock
from datetime import date, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.deps import get_current_user, require_admin
from app.routers.admin import router as admin_router
from app.routers.customers import router as customers_router
from app.routers.invoices import router as invoices_router
from app.routers.mr import router as mr_router
from app.routers.payments import router as payments_router

from app.routers.deletions import router as deletions_router
from app.routers.notifications import router as notifications_router


class DeletionsTests(unittest.TestCase):
    """Deleted › track, reason rule, and restore (invoice with its money, customer)."""

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.admin = models.User(name="Office Admin", employee_code="ADM", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Ravi MR", employee_code="MR1", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr]); self.db.commit()
        self.customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.spare = models.Customer(name="Old Clinic", type="Doctor", area="Thane", mr_id=self.mr.id)
        self.db.add_all([self.customer, self.spare]); self.db.commit()
        self.invoice = models.Invoice(invoice_number="A100", invoice_date=date(2026, 10, 1), customer_id=self.customer.id,
                                      mr_id=self.mr.id, total_amount=1000, paid_amount=0, pending_amount=1000, status="UNPAID")
        self.empty = models.Invoice(invoice_number="A101", invoice_date=date(2026, 10, 2), customer_id=self.customer.id,
                                    mr_id=self.mr.id, total_amount=500, paid_amount=0, pending_amount=500, status="UNPAID")
        self.db.add_all([self.invoice, self.empty]); self.db.commit()
        app = FastAPI()
        for router in (admin_router, invoices_router, payments_router, customers_router, deletions_router, notifications_router):
            app.include_router(router)

        def db_override():
            yield self.db

        self.current_user = self.admin
        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: self.current_user

        def admin_only():
            if self.current_user.role != "ADMIN":
                from fastapi import HTTPException
                raise HTTPException(403, "Admin only")
            return self.current_user

        app.dependency_overrides[require_admin] = admin_only
        self.client = TestClient(app)
        for target in ("app.routers.payments.send_payment_notification", "app.routers.admin.send_office_payment_notification"):
            patcher = mock.patch(target); patcher.start(); self.addCleanup(patcher.stop)

    def tearDown(self):
        self.client.close(); self.db.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def collected(self):
        return self.client.get("/admin/collections").json()["total_amount"]

    def test_reason_needed_only_when_money_was_collected(self):
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 400, "mode": "UPI"})
        r = self.client.delete(f"/invoices/{self.invoice.id}")
        self.assertEqual(r.status_code, 422)
        self.assertIn("400", r.json()["detail"])
        self.assertEqual(self.client.delete(f"/invoices/{self.empty.id}").status_code, 204)   # nothing collected: no reason needed
        r = self.client.post("/invoices/bulk-delete", json={"ids": [self.invoice.id]})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.client.delete(f"/invoices/{self.invoice.id}", params={"reason": "Duplicate"}).status_code, 204)
        rows = self.client.get("/admin/deletions", params={"kind": "invoice"}).json()
        self.assertEqual(rows["invoices"], 2)
        self.assertEqual(rows["collections_removed"], 400)
        self.assertEqual(rows["rows"][0]["reason"], "Duplicate")
        self.assertTrue(rows["rows"][0]["can_restore"])

    def test_restore_invoice_brings_back_money_and_history(self):
        pay = self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 600, "mode": "UPI"}).json()
        pid = pay.get("payment_id") or pay.get("id")
        self.client.post(f"/admin/payments/{pid}/reverse", json={"amount": 200, "reason": "Cheque bounced"})
        before = self.collected()
        history_before = self.client.get(f"/invoices/{self.invoice.id}/payments").json()
        self.assertEqual(self.client.delete(f"/invoices/{self.invoice.id}", params={"reason": "Wrong entry"}).status_code, 204)
        self.assertEqual(self.collected(), 0)
        deletion = self.client.get("/admin/deletions").json()["rows"][0]
        detail = self.client.get(f"/admin/deletions/{deletion['id']}").json()
        self.assertEqual(len(detail["details"]["payments"]), len(history_before["payments"]))
        r = self.client.post(f"/admin/deletions/{deletion['id']}/restore")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.collected(), before)
        self.db.expire_all()
        inv = self.db.get(models.Invoice, self.invoice.id)
        self.assertEqual((inv.paid_amount, inv.pending_amount, inv.status), (before, 1000 - before, "PARTIAL"))
        self.assertEqual(len(self.client.get(f"/invoices/{self.invoice.id}/payments").json()["payments"]), len(history_before["payments"]))
        again = self.client.post(f"/admin/deletions/{deletion['id']}/restore")
        self.assertEqual(again.status_code, 409)
        listed = self.client.get("/admin/deletions").json()
        self.assertEqual(listed["collections_removed"], 0)       # restored ones don't count
        self.assertIsNotNone(listed["rows"][0]["restored"])

    def test_restore_blocked_when_number_added_again(self):
        self.client.delete(f"/invoices/{self.empty.id}")
        self.db.add(models.Invoice(invoice_number="A101", invoice_date=date(2026, 10, 2), customer_id=self.customer.id,
                                   mr_id=self.mr.id, total_amount=500, paid_amount=0, pending_amount=500, status="UNPAID"))
        self.db.commit()
        row = self.client.get("/admin/deletions").json()["rows"][0]
        self.assertFalse(row["can_restore"])
        self.assertIn("added again", row["restore_note"])
        self.assertEqual(self.client.post(f"/admin/deletions/{row['id']}/restore").status_code, 409)

    def test_restore_customer_and_summary(self):
        self.assertEqual(self.client.delete(f"/customers/{self.spare.id}").status_code, 204)
        summary = self.client.get("/admin/deletions/summary").json()
        self.assertEqual(summary["customers"], 1)
        row = self.client.get("/admin/deletions", params={"kind": "customer"}).json()["rows"][0]
        self.assertEqual(row["title"], "Old Clinic")
        self.assertEqual(self.client.post(f"/admin/deletions/{row['id']}/restore").status_code, 200)
        self.db.expire_all()
        back = self.db.get(models.Customer, self.spare.id)
        self.assertEqual((back.name, back.area, back.mr_id), ("Old Clinic", "Thane", self.mr.id))
        self.assertEqual(self.client.get("/admin/deletions/summary").json()["customers"], 0)

    def test_old_style_deletion_restores_with_rebuilt_history(self):
        # Deleted before full copies were kept: only the basic fields and payments.
        self.db.add(models.AuditLog(action="invoice_deleted", user_id=self.admin.id, old_value={
            "invoice_id": 999, "invoice_number": "OLD1", "invoice_date": "2026-09-01", "customer_id": self.customer.id,
            "customer_name": "Tulsi Pharmacy", "mr_id": self.mr.id, "total_amount": 800, "paid_amount": 300,
            "pending_amount": 500, "status": "PARTIAL", "payment_mode": "Cash", "remarks": None,
            "payments": [{"payment_id": 9001, "amount": 300, "mode": "Cash", "transaction_reference": None,
                          "payment_date": "2026-09-05T08:00:00", "collected_by": self.mr.id, "recorded_by": self.mr.id,
                          "reversal_of_id": None, "reason": None}],
        }))
        self.db.commit()
        row = self.client.get("/admin/deletions").json()["rows"][0]
        self.assertEqual(self.client.post(f"/admin/deletions/{row['id']}/restore").status_code, 200)
        history = self.client.get("/invoices/999/payments").json()
        self.assertEqual(len(history["payments"]), 1)
        self.assertEqual(self.collected(), 300)

    def test_export_and_admin_only(self):
        self.client.delete(f"/invoices/{self.empty.id}")
        r = self.client.get("/admin/deletions/export")
        self.assertEqual(r.status_code, 200)
        self.current_user = self.mr
        self.assertEqual(self.client.get("/admin/deletions").status_code, 403)
