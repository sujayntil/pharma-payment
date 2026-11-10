import unittest
from datetime import date
from unittest import mock

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func
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


class CollectionHistoryTests(unittest.TestCase):
    """Admin-only reversals, recorded-by vs credited MR, and the invoice timeline."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.admin = models.User(name="Rahul Sharma", employee_code="ADM", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Ravi", employee_code="MR1", role="MR", password_hash="x")
        self.other_mr = models.User(name="Sita", employee_code="MR2", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr, self.other_mr])
        self.db.commit()
        self.customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.unassigned = models.Customer(name="Walk-in")
        self.db.add_all([self.customer, self.unassigned])
        self.db.commit()
        self.invoice = self._invoice("A100", self.customer, 1000)
        self.paid_invoice = self._invoice("A101", self.customer, 500)
        self.loose_invoice = self._invoice("U100", self.unassigned, 300)

        app = FastAPI()
        for router in (admin_router, customers_router, invoices_router, mr_router, payments_router):
            app.include_router(router)

        def db_override():
            yield self.db

        def admin_only():
            if self.current_user.role != "ADMIN":
                raise HTTPException(403, "Admin only")
            return self.current_user

        self.current_user = self.admin
        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        app.dependency_overrides[require_admin] = admin_only
        self.client = TestClient(app)
        patcher = mock.patch("app.routers.payments.send_payment_notification")
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.client.close()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _invoice(self, number, customer, total):
        invoice = models.Invoice(
            invoice_number=number, invoice_date=date(2026, 10, 1), customer_id=customer.id,
            mr_id=customer.mr_id, total_amount=total, paid_amount=0, pending_amount=total, status="UNPAID",
        )
        self.db.add(invoice)
        self.db.commit()
        return invoice

    def pay(self, invoice, amount, who):
        self.current_user = who
        return self.client.post("/payments", json={"invoice_id": invoice.id, "amount": amount, "mode": "UPI"})

    def reverse(self, payment_id, reason="Cheque bounced", who=None, **extra):
        self.current_user = who or self.admin
        return self.client.post(f"/admin/payments/{payment_id}/reverse", json={"reason": reason, **extra})

    def latest_payment_id(self, invoice):
        return self.db.query(func.max(models.Payment.id)).filter(models.Payment.invoice_id == invoice.id).scalar()

    def mr_collected(self, mr):
        return self.db.query(func.coalesce(func.sum(models.Payment.amount), 0)).filter(
            models.Payment.collected_by == mr.id).scalar()

    # ---- 3i: credited MR vs recorder ----

    def test_admin_collection_is_saved_under_assigned_mr(self):
        self.assertEqual(self.pay(self.invoice, 400, self.admin).status_code, 200)
        payment = self.db.get(models.Payment, self.latest_payment_id(self.invoice))
        self.assertEqual((payment.collected_by, payment.recorded_by), (self.mr.id, self.admin.id))
        self.assertEqual(self.mr_collected(self.mr), 400)
        row = self.client.get("/admin/collections").json()["rows"][0]
        self.assertEqual((row["recorded_by"], row["recorded_by_role"], row["recorded_by_id"]), ("Rahul Sharma", "ADMIN", self.admin.id))

    def test_unassigned_customer_behaves_as_before(self):
        self.pay(self.loose_invoice, 100, self.admin)
        payment = self.db.get(models.Payment, self.latest_payment_id(self.loose_invoice))
        self.assertEqual((payment.collected_by, payment.recorded_by), (self.admin.id, self.admin.id))

    def test_legacy_rows_without_recorded_by_show_collector(self):
        self.db.add(models.Payment(invoice_id=self.invoice.id, amount=100, collected_by=self.mr.id))
        self.invoice.paid_amount, self.invoice.pending_amount, self.invoice.status = 100, 900, "PARTIAL"
        self.db.commit()
        self.current_user = self.mr
        item = self.client.get("/mr/outstanding").json()["items"][0]
        self.assertEqual((item["last_collection_by_id"], item["last_collection_by_role"]), (self.mr.id, "MR"))

    # ---- 3b: reversal ----

    def test_mr_cannot_reverse(self):
        self.pay(self.invoice, 400, self.mr)
        response = self.reverse(self.latest_payment_id(self.invoice), who=self.mr)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.db.query(models.Payment).count(), 1)

    def test_reversal_requires_reason_and_keeps_original(self):
        self.pay(self.invoice, 400, self.mr)
        pid = self.latest_payment_id(self.invoice)
        self.assertEqual(self.reverse(pid, reason="  ").status_code, 422)
        response = self.reverse(pid)
        self.assertEqual(response.status_code, 200, response.text)
        original = self.db.get(models.Payment, pid)
        self.assertEqual(original.amount, 400)
        reversal = self.db.get(models.Payment, response.json()["reversal_id"])
        self.assertEqual((reversal.amount, reversal.reversal_of_id, reversal.recorded_by, reversal.reason),
                         (-400, pid, self.admin.id, "Cheque bounced"))
        # Deducted from the MR the collection was saved under.
        self.assertEqual(reversal.collected_by, self.mr.id)
        self.assertEqual(self.mr_collected(self.mr), 0)
        self.db.refresh(self.invoice)
        self.assertEqual((self.invoice.status, self.invoice.pending_amount), ("UNPAID", 1000))

    def test_reversal_never_exceeds_collected(self):
        self.pay(self.invoice, 400, self.mr)
        pid = self.latest_payment_id(self.invoice)
        self.assertEqual(self.reverse(pid, amount=500).status_code, 400)
        self.assertEqual(self.reverse(pid, amount=150).status_code, 200)
        self.assertEqual(self.reverse(pid, amount=300).status_code, 400)
        self.assertEqual(self.reverse(pid).json()["reversed_amount"], 250)
        self.assertEqual(self.reverse(pid).status_code, 400)  # fully reversed
        reversal_id = self.latest_payment_id(self.invoice)
        self.assertEqual(self.reverse(reversal_id).status_code, 400)  # reversals can't be reversed

    def test_repeated_pay_reverse_cycles_keep_totals(self):
        for _ in range(3):
            self.assertEqual(self.pay(self.invoice, 1000, self.mr).status_code, 200)
            self.assertEqual(self.pay(self.invoice, 1, self.mr).status_code, 400)  # already fully paid
            self.assertEqual(self.reverse(self.latest_payment_id(self.invoice)).status_code, 200)
        self.pay(self.invoice, 600, self.admin)
        self.db.refresh(self.invoice)
        ledger = self.db.query(func.sum(models.Payment.amount)).filter(models.Payment.invoice_id == self.invoice.id).scalar()
        self.assertEqual((self.invoice.paid_amount, ledger, self.invoice.status), (600, 600, "PARTIAL"))
        self.assertEqual(self.mr_collected(self.mr), 600)
        self.assertEqual(self.client.get("/admin/collections").json()["total_amount"], 600)
        self.current_user = self.mr
        ledger_view = self.client.get(f"/customers/{self.customer.id}/ledger").json()
        self.assertEqual(ledger_view["total_paid"], 600)

    # ---- 3c: My Collections lists all invoices ----

    def test_my_collections_lists_all_invoices_with_same_totals(self):
        self.pay(self.paid_invoice, 500, self.mr)
        self.pay(self.invoice, 1000, self.mr)
        self.reverse(self.latest_payment_id(self.invoice))
        self.current_user = self.mr
        default = self.client.get("/mr/outstanding").json()
        everything = self.client.get("/mr/outstanding", params={"include_settled": True}).json()
        self.assertEqual({i["invoice_number"] for i in default["items"]}, {"A100"})
        self.assertEqual({i["invoice_number"] for i in everything["items"]}, {"A100", "A101"})
        self.assertEqual(default["total_outstanding"], everything["total_outstanding"])
        self.assertEqual(everything["filtered_outstanding"], 1000)
        paid = self.client.get("/mr/outstanding", params={"include_settled": True, "status": "PAID"}).json()
        self.assertEqual(([i["invoice_number"] for i in paid["items"]], paid["filtered_outstanding"]), (["A101"], 0))
        reversed_ = self.client.get("/mr/outstanding", params={"include_settled": True, "status": "reversed"}).json()
        self.assertEqual([i["invoice_number"] for i in reversed_["items"]], ["A100"])
        self.assertEqual(self.client.get("/mr/outstanding", params={"status": "bogus"}).status_code, 422)
        by_customer = self.client.get("/mr/outstanding", params={"customer_id": self.customer.id}).json()
        self.assertEqual([i["invoice_number"] for i in by_customer["items"]], ["A100"])

    # ---- 3d/3e: history ----

    def test_history_timeline_order_and_actors(self):
        self.pay(self.invoice, 400, self.mr)
        self.pay(self.invoice, 600, self.admin)
        self.reverse(self.latest_payment_id(self.invoice), reason="Wrong amount")
        self.pay(self.invoice, 600, self.mr)
        self.current_user = self.mr
        response = self.client.get(f"/invoices/{self.invoice.id}/history")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["invoice"]["customer_name"], "Tulsi Pharmacy")
        events = body["events"]
        self.assertEqual([e["type"] for e in events], ["CREATED", "COLLECTED", "COLLECTED", "REVERSED", "COLLECTED"])
        self.assertEqual([e["kind"] for e in events[1:]], ["partial", "full", None, "full"])
        self.assertEqual(events[3]["reason"], "Wrong amount")
        self.assertEqual(events[3]["actor"], {"id": self.admin.id, "name": "Rahul Sharma", "role": "ADMIN"})
        self.assertTrue(events[4]["after_reversal"])
        self.assertEqual(events[-1]["status_after"], "PAID")
        # Admin sees exactly the same events.
        self.current_user = self.admin
        self.assertEqual(self.client.get(f"/invoices/{self.invoice.id}/history").json()["events"], events)

    def test_reversed_collections_are_flagged(self):
        self.pay(self.invoice, 400, self.mr)
        first = self.latest_payment_id(self.invoice)
        self.pay(self.invoice, 100, self.mr)
        self.reverse(first)
        events = self.client.get(f"/invoices/{self.invoice.id}/history").json()["events"]
        collected = [e for e in events if e["type"] == "COLLECTED"]
        self.assertEqual([(e["fully_reversed"], e["reversed_amount"]) for e in collected], [(True, 400), (False, 0)])
        rows = {r["payment_id"]: r for r in self.client.get("/admin/collections").json()["rows"]}
        self.assertTrue(rows[first]["fully_reversed"])

    def test_history_access_is_scoped_for_mr(self):
        self.current_user = self.other_mr
        self.assertEqual(self.client.get(f"/invoices/{self.invoice.id}/history").status_code, 403)
        self.current_user = self.admin
        self.assertEqual(self.client.get(f"/invoices/{self.loose_invoice.id}/history").status_code, 200)
        self.assertEqual(self.client.get("/invoices/99999/history").status_code, 404)

    def test_history_events_are_logged(self):
        self.pay(self.invoice, 400, self.mr)
        self.reverse(self.latest_payment_id(self.invoice))
        types = [e.event_type for e in self.db.query(models.InvoiceEvent).order_by(models.InvoiceEvent.id)]
        self.assertEqual(types, ["COLLECTED", "REVERSED"])

    # ---- Change 2: MR edit/delete disabled ----

    def test_mr_cannot_edit_or_delete_own_invoice(self):
        self.current_user = self.mr
        self.assertEqual(self.client.put(f"/invoices/{self.invoice.id}", json={"remarks": "x"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/invoices/{self.invoice.id}").status_code, 403)
        self.current_user = self.admin
        self.assertEqual(self.client.put(f"/invoices/{self.invoice.id}", json={"remarks": "x"}).status_code, 200)

    def test_admin_invoice_tabs_sort_and_pending_total(self):
        self.pay(self.paid_invoice, 500, self.mr)
        self.pay(self.invoice, 400, self.mr)
        self.reverse(self.latest_payment_id(self.invoice))
        self.current_user = self.admin
        pending = self.client.get("/invoices", params={"pending_only": True, "limit": 50}).json()
        self.assertEqual({i["invoice_number"] for i in pending["items"]}, {"A100", "U100"})
        self.assertEqual(pending["filtered_outstanding"], 1300)
        reversed_ = self.client.get("/invoices", params={"status": "REVERSED", "limit": 50}).json()
        self.assertEqual([i["invoice_number"] for i in reversed_["items"]], ["A100"])
        by_amount = self.client.get("/invoices", params={"sort_order": "amount", "limit": 50}).json()
        self.assertEqual(by_amount["items"][0]["invoice_number"], "A100")
        self.assertEqual(self.client.get("/invoices", params={"sort_order": "bogus"}).status_code, 422)
        # Old-style call is unchanged: a plain list.
        self.assertIsInstance(self.client.get("/invoices").json(), list)

    # ---- Excel export (Admin only, same filters as the lists) ----

    def _sheet(self, response):
        from io import BytesIO
        from openpyxl import load_workbook
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("spreadsheetml", response.headers["content-type"])
        return [list(row) for row in load_workbook(BytesIO(response.content)).active.iter_rows(values_only=True)]

    def test_invoice_export_matches_filters_and_is_admin_only(self):
        self.pay(self.paid_invoice, 500, self.mr)
        self.current_user = self.admin
        rows = self._sheet(self.client.get("/invoices/export"))
        self.assertEqual(rows[0][:4], ["Invoice", "Invoice date", "Customer", "MR"])
        self.assertEqual({r[0] for r in rows[1:]}, {"A100", "A101", "U100"})
        pending = self._sheet(self.client.get("/invoices/export", params={"pending_only": True}))
        self.assertEqual({r[0] for r in pending[1:]}, {"A100", "U100"})
        paid = self._sheet(self.client.get("/invoices/export", params={"status": "PAID"}))
        self.assertEqual([(r[0], r[5], r[7], r[9]) for r in paid[1:]], [("A101", 500, "Paid", "Ravi")])
        self.assertEqual(self.client.get("/invoices/export", params={"status": "nope"}).status_code, 422)
        self.current_user = self.mr
        self.assertEqual(self.client.get("/invoices/export").status_code, 403)

    def test_collections_export_matches_filters_and_is_admin_only(self):
        self.pay(self.invoice, 400, self.mr)
        self.pay(self.invoice, 100, self.admin)
        self.reverse(self.latest_payment_id(self.invoice), reason="=HYPERLINK(1)")
        rows = self._sheet(self.client.get("/admin/collections/export"))
        self.assertEqual(len(rows), 4)
        self.assertEqual(sum(r[5] for r in rows[1:]), 400)
        reversal = [r for r in rows[1:] if r[4] == "Reversal"][0]
        self.assertEqual((reversal[5], reversal[9]), (-100, "Admin - Rahul Sharma"))
        self.assertTrue(reversal[8].startswith("'="))  # formula-like text is neutralised
        by_mr = self._sheet(self.client.get("/admin/collections/export", params={"recorded_by": "MR"}))
        self.assertEqual([r[5] for r in by_mr[1:]], [400])
        self.current_user = self.mr
        self.assertEqual(self.client.get("/admin/collections/export").status_code, 403)

    def test_admin_invoice_filters_are_validated(self):
        self.assertEqual(self.client.get("/invoices", params={"status": "nope"}).status_code, 422)
        self.assertEqual(self.client.get("/invoices", params={"date_from": "2026-10-02", "date_to": "2026-10-01"}).status_code, 422)
        self.assertEqual(self.client.get("/invoices", params={"status": "unpaid", "limit": 50}).json()["total"], 3)


if __name__ == "__main__":
    unittest.main()
