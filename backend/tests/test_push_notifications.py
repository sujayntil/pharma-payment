import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.routers.notifications import delete_subscription, save_subscription
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


if __name__ == "__main__":
    unittest.main()
