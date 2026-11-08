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
from app.routers.invoices import router as invoices_router
from app.routers.mr import router as mr_router
from app.routers.payments import router as payments_router


class AdminCollectionLedgerTests(unittest.TestCase):
    """Admin collection actions must flow through the payments ledger so
    totals move, and the assigned MR must be able to see them."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.admin = models.User(name="Office Admin", employee_code="ADM", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Ravi MR", employee_code="MR1", role="MR", password_hash="x")
        self.other_mr = models.User(name="Sita MR", employee_code="MR2", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr, self.other_mr])
        self.db.commit()
        customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.commit()
        self.invoice = models.Invoice(
            invoice_number="A100", invoice_date=date(2026, 10, 1), customer_id=customer.id,
            mr_id=self.mr.id, total_amount=1000, paid_amount=0, pending_amount=1000, status="UNPAID",
        )
        self.db.add(self.invoice)
        self.db.commit()

        app = FastAPI()
        for router in (admin_router, invoices_router, mr_router, payments_router):
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
        push_patch = mock.patch("app.routers.payments.send_payment_notification")
        push_patch.start()
        self.addCleanup(push_patch.stop)

    def tearDown(self):
        self.client.close()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def collected_total(self):
        return self.client.get("/admin/collections").json()["total_amount"]

    def test_admin_recorded_payment_counts_in_collections(self):
        response = self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 400, "mode": "UPI"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.collected_total(), 400)
        row = self.client.get("/admin/collections").json()["rows"][0]
        self.assertTrue(row["recorded_by_admin"])
        self.assertEqual(row["mr_name"], "Ravi MR")

    def test_mark_paid_creates_ledger_entry_for_remaining_balance(self):
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 300})
        response = self.client.put(
            f"/admin/invoices/{self.invoice.id}/collection-status",
            json={"status": "PAID", "mode": "Cash"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ledger_amount"], 700)
        self.assertEqual(self.collected_total(), 1000)

    def test_mark_unpaid_reverses_collections(self):
        self.current_user = self.mr
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 600})
        self.current_user = self.admin
        self.assertEqual(self.collected_total(), 600)

        response = self.client.put(
            f"/admin/invoices/{self.invoice.id}/collection-status",
            json={"status": "UNPAID", "reason": "Cheque bounced"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "UNPAID")
        self.assertEqual(response.json()["ledger_amount"], -600)
        self.assertEqual(self.collected_total(), 0)
        reversals = self.client.get("/admin/collections", params={"entry_type": "reversal"}).json()
        self.assertEqual(reversals["total_count"], 1)
        self.assertIn("Cheque bounced", reversals["rows"][0]["transaction_reference"])

    def test_mark_unpaid_with_no_ledger_entries_adds_nothing(self):
        response = self.client.put(
            f"/admin/invoices/{self.invoice.id}/collection-status", json={"status": "UNPAID"}
        )
        self.assertEqual(response.json()["ledger_amount"], 0)
        self.assertEqual(self.collected_total(), 0)

    def test_assigned_mr_sees_admin_activity(self):
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 250, "mode": "Cash"})

        self.current_user = self.mr
        outstanding = self.client.get("/mr/outstanding").json()["items"][0]
        self.assertTrue(outstanding["last_collection_by_admin"])

        mine = self.client.get("/invoices/mine").json()[0]
        self.assertEqual(mine["last_collection_by"], "Office Admin")

        history = self.client.get(f"/invoices/{self.invoice.id}/payments").json()
        self.assertEqual(len(history["payments"]), 1)

    def test_other_mr_cannot_read_payment_history(self):
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 250})
        self.current_user = self.other_mr
        self.assertEqual(self.client.get(f"/invoices/{self.invoice.id}/payments").status_code, 403)

    def test_mr_overdue_alerts_only_show_own_customers(self):
        old = date.today().replace(day=1) - timedelta(days=60)
        other_customer = models.Customer(name="Sita's Chemist", mr_id=self.other_mr.id)
        self.db.add(other_customer)
        self.db.commit()
        self.invoice.invoice_date = old
        self.db.add(models.Invoice(
            invoice_number="B200", invoice_date=old, customer_id=other_customer.id,
            mr_id=self.other_mr.id, total_amount=500, paid_amount=0, pending_amount=500, status="UNPAID",
        ))
        self.db.commit()

        self.current_user = self.mr
        mine = self.client.get("/mr/overdue-alerts").json()
        self.assertEqual([row["customer"] for row in mine], ["Tulsi Pharmacy"])
        self.assertEqual(mine[0]["overdue_amount"], 1000)

        self.current_user = self.other_mr
        theirs = self.client.get("/mr/overdue-alerts").json()
        self.assertEqual([row["customer"] for row in theirs], ["Sita's Chemist"])

        self.current_user = self.admin
        everyone = self.client.get("/admin/overdue-alerts").json()
        self.assertEqual(len(everyone), 2)

    def test_mr_overdue_alerts_ignore_recent_and_paid_invoices(self):
        self.invoice.invoice_date = date.today() - timedelta(days=10)
        self.db.commit()
        self.current_user = self.mr
        self.assertEqual(self.client.get("/mr/overdue-alerts").json(), [])

    def test_recorded_by_filter(self):
        self.current_user = self.mr
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 100})
        self.current_user = self.admin
        self.client.post("/payments", json={"invoice_id": self.invoice.id, "amount": 200})
        self.assertEqual(self.client.get("/admin/collections", params={"recorded_by": "ADMIN"}).json()["total_amount"], 200)
        self.assertEqual(self.client.get("/admin/collections", params={"recorded_by": "MR"}).json()["total_amount"], 100)


if __name__ == "__main__":
    unittest.main()
