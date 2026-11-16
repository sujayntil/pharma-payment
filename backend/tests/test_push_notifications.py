import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.push import payment_payload
from app.routers.notifications import delete_subscription, mark_seen, recent_collections, save_subscription
from app.routers.payments import add_payment


class PushNotificationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.mr = models.User(name="MR One", employee_code="M1", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr])
        self.db.flush()
        customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        self.invoice = models.Invoice(
            invoice_number="A00001", customer_id=customer.id, mr_id=self.mr.id,
            total_amount=100, paid_amount=0, pending_amount=100, status="UNPAID",
        )
        self.db.add(self.invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_admin_device_subscription_can_be_saved_and_removed(self):
        subscription = schemas.PushSubscriptionCreate.model_validate({
            "endpoint": "https://push.example.test/subscription/1",
            "keys": {"p256dh": "public-key", "auth": "auth-secret"},
        })
        self.assertEqual(save_subscription(subscription, self.db, self.admin).status_code, 204)
        saved = self.db.query(models.PushSubscription).one()
        self.assertEqual(saved.user_id, self.admin.id)

        removal = schemas.PushSubscriptionDelete(endpoint=subscription.endpoint)
        self.assertEqual(delete_subscription(removal, self.db, self.admin).status_code, 204)
        self.assertEqual(self.db.query(models.PushSubscription).count(), 0)

    def test_mr_payment_is_committed_and_schedules_push(self):
        background = BackgroundTasks()
        with patch("app.routers.payments.send_payment_notification") as send_push:
            result = add_payment(
                schemas.PaymentCreate(invoice_id=self.invoice.id, amount=40, mode="Cash"),
                background,
                self.db,
                self.mr,
            )
            payment = self.db.query(models.Payment).one()
            self.assertEqual(payment.amount, 40)
            self.assertEqual(result["pending_amount"], 60)
            background.tasks[0].func(*background.tasks[0].args, **background.tasks[0].kwargs)
            send_push.assert_called_once_with(payment.id)

    def test_admin_payment_does_not_schedule_mr_alert(self):
        background = BackgroundTasks()
        invoice = self.db.get(models.Invoice, self.invoice.id)
        add_payment(
            schemas.PaymentCreate(invoice_id=invoice.id, amount=40),
            background,
            self.db,
            self.admin,
        )
        self.assertEqual(background.tasks, [])


    def pay(self, user, amount):
        add_payment(schemas.PaymentCreate(invoice_id=self.invoice.id, amount=amount, mode="UPI"), BackgroundTasks(), self.db, user)
        return self.db.query(models.Payment).order_by(models.Payment.id.desc()).first()

    def test_bell_lists_newest_first_and_counts_only_others_entries(self):
        with patch("app.routers.payments.send_payment_notification"):
            self.pay(self.mr, 10)
            self.pay(self.admin, 5)   # the Admin's own entry is never "new" for them
            last = self.pay(self.mr, 20)
        result = recent_collections(20, self.db, self.admin)
        self.assertEqual([item["amount"] for item in result["items"]], [20, 5, 10])
        self.assertEqual(result["unread"], 2)
        first = result["items"][0]
        self.assertEqual((first["invoice_number"], first["customer_name"], first["recorded_by_name"], first["is_new"]),
                         ("A00001", "Tulsi Pharmacy", "MR One", True))
        self.assertFalse(result["items"][1]["is_new"])

        mark_seen(self.db, self.admin)
        self.db.refresh(self.admin)
        self.assertEqual(self.admin.notifications_seen_payment_id, last.id)
        after = recent_collections(20, self.db, self.admin)
        self.assertEqual(after["unread"], 0)
        self.assertFalse(any(item["is_new"] for item in after["items"]))

        with patch("app.routers.payments.send_payment_notification"):
            self.pay(self.mr, 7)
        again = recent_collections(20, self.db, self.admin)
        self.assertEqual(again["unread"], 1)
        self.assertTrue(again["items"][0]["is_new"])

    def test_alert_text_and_link_open_the_invoice(self):
        with patch("app.routers.payments.send_payment_notification"):
            payment = self.pay(self.mr, 40)
        invoice = self.db.get(models.Invoice, self.invoice.id)
        payload = payment_payload(payment, self.mr, invoice, invoice.customer)
        self.assertEqual(payload["title"], "₹40 collected")
        self.assertEqual(payload["body"], "Tulsi Pharmacy · A00001 · by MR One")
        self.assertEqual(payload["url"], f"/#/admin/invoices?invoice={invoice.id}")
        self.assertEqual(payload["tag"], f"payment-{payment.id}")


if __name__ == "__main__":
    unittest.main()
