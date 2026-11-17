"""Collect from customer (one amount over several invoices), Undo, the
grouped bell entry, and the MR customer list order."""
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.push import batch_payload
from app.routers.mr import customers as mr_customers
from app.routers.notifications import recent_collections
from app.routers.payments import add_batch_payment, add_batch_payments, add_payment, pending_invoices, undo_payment


class BatchCollectUndoTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="x")
        self.other = models.User(name="Other MR", employee_code="M2", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr, self.other])
        self.db.flush()
        self.customer = models.Customer(name="Dr. Mehta Clinic", mr_id=self.mr.id)
        self.db.add(self.customer)
        self.db.flush()
        # Oldest first: A (Sep), B (Oct), C (Nov)
        self.a = self.invoice("INV-A", date(2026, 9, 30), 5400)
        self.b = self.invoice("INV-B", date(2026, 10, 28), 4800)
        self.c = self.invoice("INV-C", date(2026, 11, 15), 3000)
        self.db.commit()
        self.alerts = patch("app.routers.payments.send_batch_notification").start()
        patch("app.routers.payments.send_payment_notification").start()

    def tearDown(self):
        patch.stopall()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def invoice(self, number, day, amount, customer=None):
        invoice = models.Invoice(
            invoice_number=number, invoice_date=day, customer_id=(customer or self.customer).id, mr_id=self.mr.id,
            total_amount=amount, paid_amount=0, pending_amount=amount, status="UNPAID",
        )
        self.db.add(invoice)
        self.db.flush()
        return invoice

    def batch(self, amount, ids, user=None):
        body = schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=amount, invoice_ids=ids, mode="UPI")
        return add_batch_payment(body, BackgroundTasks(), self.db, user or self.mr)

    def pending(self, invoice):
        self.db.refresh(invoice)
        return invoice.pending_amount

    def test_amount_fills_oldest_ticked_invoices_first(self):
        result = self.batch(8400, [self.c.id, self.a.id, self.b.id])  # order sent doesn't matter
        self.assertEqual([(item["invoice_number"], item["amount"]) for item in result["items"]], [("INV-A", 5400), ("INV-B", 3000)])
        self.assertEqual((result["cleared"], result["left"]), (1, 4800))
        self.assertEqual((self.pending(self.a), self.pending(self.b), self.pending(self.c)), (0, 1800, 3000))
        batch_ids = {payment.batch_id for payment in self.db.query(models.Payment).all()}
        self.assertEqual(len(batch_ids), 1)
        self.assertIsNotNone(batch_ids.pop())

    def test_opened_invoice_is_filled_first(self):
        body = schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=4000, invoice_ids=[self.a.id, self.c.id], first_invoice_id=self.c.id)
        result = add_batch_payment(body, BackgroundTasks(), self.db, self.mr)
        self.assertEqual([(item["invoice_number"], item["amount"]) for item in result["items"]], [("INV-C", 3000), ("INV-A", 1000)])

    def second_customer(self):
        city = models.Customer(name="City Care", mr_id=self.mr.id)
        self.db.add(city)
        self.db.flush()
        x = self.invoice("INV-X", date(2026, 10, 1), 4200, city)
        self.db.commit()
        return city, x

    def test_several_customers_each_get_their_own_amount_and_mode(self):
        city, x = self.second_customer()
        body = schemas.PaymentBatchesCreate(groups=[
            schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=6000, invoice_ids=[self.a.id, self.c.id], mode="Cash"),
            schemas.PaymentBatchCreate(customer_id=city.id, amount=4200, invoice_ids=[x.id], mode="UPI", transaction_reference="UTR1"),
        ])
        result = add_batch_payments(body, BackgroundTasks(), self.db, self.mr)
        self.assertEqual(result["amount"], 10200)
        self.assertEqual((self.pending(self.a), self.pending(self.c), self.pending(x)), (0, 2400, 0))
        modes = {p.invoice_id: p.mode for p in self.db.query(models.Payment).all()}
        self.assertEqual((modes[self.a.id], modes[x.id]), ("Cash", "UPI"))
        self.assertEqual(len({r["batch_id"] for r in result["results"]}), 2)

    def test_several_customers_all_or_nothing(self):
        city, x = self.second_customer()
        body = schemas.PaymentBatchesCreate(groups=[
            schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=5400, invoice_ids=[self.a.id]),
            schemas.PaymentBatchCreate(customer_id=city.id, amount=9999, invoice_ids=[x.id]),  # too much
        ])
        with self.assertRaises(HTTPException):
            add_batch_payments(body, BackgroundTasks(), self.db, self.mr)
        self.assertEqual((self.pending(self.a), self.pending(x)), (5400, 4200))
        self.assertEqual(self.db.query(models.Payment).count(), 0)

    def test_several_customers_rejects_invoice_of_another_customer(self):
        city, x = self.second_customer()
        body = schemas.PaymentBatchesCreate(groups=[schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=100, invoice_ids=[x.id])])
        with self.assertRaises(HTTPException):
            add_batch_payments(body, BackgroundTasks(), self.db, self.mr)

    def test_unticked_invoice_is_skipped(self):
        result = self.batch(8400, [self.a.id, self.c.id])
        self.assertEqual([item["invoice_number"] for item in result["items"]], ["INV-A", "INV-C"])
        self.assertEqual((self.pending(self.a), self.pending(self.b), self.pending(self.c)), (0, 4800, 0))

    def test_too_much_or_wrong_invoices_saves_nothing(self):
        with self.assertRaises(HTTPException) as too_much:
            self.batch(9000, [self.a.id, self.c.id])
        self.assertEqual(too_much.exception.status_code, 400)
        stranger = models.Customer(name="Elsewhere", mr_id=self.mr.id)
        self.db.add(stranger); self.db.flush()
        foreign = self.invoice("INV-X", date(2026, 9, 1), 100, stranger)
        self.db.commit()
        with self.assertRaises(HTTPException):
            self.batch(100, [self.a.id, foreign.id])
        with self.assertRaises(HTTPException) as other_mr:
            self.batch(100, [self.a.id], user=self.other)
        self.assertEqual(other_mr.exception.status_code, 404)
        self.assertEqual(self.db.query(models.Payment).count(), 0)

    def test_admin_collects_for_customer_credited_to_mr_and_sends_no_alert(self):
        self.batch(1000, [self.a.id], user=self.admin)
        payment = self.db.query(models.Payment).one()
        self.assertEqual((payment.collected_by, payment.recorded_by), (self.mr.id, self.admin.id))
        self.alerts.assert_not_called()

    def test_undo_removes_the_whole_split_and_restores_balances(self):
        self.batch(8400, [self.a.id, self.b.id])
        first = self.db.query(models.Payment).order_by(models.Payment.id).first()
        result = undo_payment(first.id, self.db, self.mr)
        self.assertEqual(result["undone"], 2)
        self.assertEqual((self.pending(self.a), self.pending(self.b)), (5400, 4800))
        self.assertEqual(self.db.query(models.Payment).count(), 0)
        self.assertEqual(self.db.query(models.InvoiceEvent).filter(models.InvoiceEvent.event_type == "COLLECTED").count(), 0)
        audit = self.db.query(models.AuditLog).filter_by(action="payment_undone").one()
        self.assertEqual([part["invoice_number"] for part in audit.old_value["payments"]], ["INV-A", "INV-B"])

    def test_undo_only_by_who_saved_it_and_only_straight_away(self):
        add_payment(schemas.PaymentCreate(invoice_id=self.a.id, amount=500, mode="Cash"), BackgroundTasks(), self.db, self.mr)
        payment = self.db.query(models.Payment).one()
        with self.assertRaises(HTTPException) as not_mine:
            undo_payment(payment.id, self.db, self.admin)
        self.assertEqual(not_mine.exception.status_code, 403)
        payment.payment_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=45)
        self.db.commit()
        with self.assertRaises(HTTPException) as late:
            undo_payment(payment.id, self.db, self.mr)
        self.assertEqual(late.exception.status_code, 409)
        self.assertEqual(self.pending(self.a), 4900)

    def test_bell_shows_a_split_as_one_entry_and_alert_text(self):
        self.batch(8400, [self.a.id, self.b.id])
        result = recent_collections(5, self.db, self.admin)
        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        self.assertEqual((item["amount"], item["invoice_count"], item["invoice_number"], item["invoice_id"]), (8400, 2, "INV-A +1", self.a.id))
        self.assertEqual(result["unread"], 1)
        rows = (
            self.db.query(models.Payment, models.User, models.Invoice, models.Customer)
            .join(models.User, models.User.id == models.Payment.collected_by)
            .join(models.Invoice, models.Invoice.id == models.Payment.invoice_id)
            .join(models.Customer, models.Customer.id == models.Invoice.customer_id)
            .order_by(models.Payment.id).all()
        )
        alert = batch_payload(rows)
        self.assertEqual((alert["title"], alert["body"]), ("₹8,400 collected", "Dr. Mehta Clinic · 2 invoices · by Rahul"))
        self.assertEqual(alert["url"], f"/#/admin/invoices?invoice={self.a.id}")

    def test_pending_invoices_oldest_first(self):
        self.batch(5400, [self.a.id])
        result = pending_invoices(self.customer.id, None, self.db, self.mr)
        self.assertEqual([item["invoice_number"] for item in result["items"]], ["INV-B", "INV-C"])

    def test_pending_invoices_from_one_invoice(self):
        result = pending_invoices(None, self.b.id, self.db, self.mr)
        self.assertEqual(result["customer"]["name"], "Dr. Mehta Clinic")
        self.assertEqual(result["selected_invoice_id"], self.b.id)
        self.assertEqual([item["invoice_number"] for item in result["items"]], ["INV-A", "INV-B", "INV-C"])
        with self.assertRaises(HTTPException):
            pending_invoices(None, self.b.id, self.db, self.other)

    def test_mr_customers_oldest_pending_first(self):
        newer = models.Customer(name="Aaa Newer Shop", mr_id=self.mr.id)
        paid = models.Customer(name="Aab Paid Shop", mr_id=self.mr.id)
        self.db.add_all([newer, paid]); self.db.flush()
        self.invoice("INV-N", date(2026, 11, 10), 900, newer)
        self.db.commit()
        names = [row["name"] for row in mr_customers(None, None, "oldest", None, None, self.db, self.mr)]
        self.assertEqual(names, ["Dr. Mehta Clinic", "Aaa Newer Shop", "Aab Paid Shop"])
        self.assertEqual(mr_customers(None, None, "oldest", None, None, self.db, self.mr)[0]["oldest_pending_date"], date(2026, 9, 30))
        self.assertEqual([row["name"] for row in mr_customers(None, None, "name", None, None, self.db, self.mr)][0], "Aaa Newer Shop")
        self.assertEqual([row["name"] for row in mr_customers(None, None, "pending", None, None, self.db, self.mr)][0], "Dr. Mehta Clinic")


if __name__ == "__main__":
    unittest.main()
