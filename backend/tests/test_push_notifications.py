import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.push import office_payment_payloads, payment_payload
from app.routers.admin import reverse_payment
from app.routers.notifications import delete_subscription, mark_mine_seen, mark_seen, my_updates, recent_collections, save_subscription
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

    def test_admin_payment_alerts_the_mr_not_the_admins(self):
        background = BackgroundTasks()
        invoice = self.db.get(models.Invoice, self.invoice.id)
        add_payment(
            schemas.PaymentCreate(invoice_id=invoice.id, amount=40),
            background,
            self.db,
            self.admin,
        )
        self.assertEqual([task.func.__name__ for task in background.tasks], ["send_office_payment_notification"])

    def test_mr_hears_about_office_collections_and_reversals_only(self):
        self.pay(self.mr, 10)       # the MR's own: not news to them
        self.pay(self.admin, 30)    # office recorded it
        office = self.db.query(models.Payment).filter_by(recorded_by=self.admin.id).one()
        mine = self.db.query(models.Payment).filter_by(recorded_by=self.mr.id).one()
        alerts = office_payment_payloads(self.db, [mine.id, office.id])
        self.assertEqual(len(alerts), 1)
        mr_id, alert = alerts[0]
        self.assertEqual(mr_id, self.mr.id)
        self.assertEqual(alert["title"], "₹30 received · Tulsi Pharmacy")
        self.assertIn("recorded by Admin", alert["body"])
        self.assertEqual(alert["url"], f"/#/mr/invoices?invoice={self.invoice.id}")

        reverse_payment(mine.id, schemas.PaymentReversalCreate(reason="Cheque bounced"), BackgroundTasks(), self.db, self.admin)
        reversal = self.db.query(models.Payment).filter(models.Payment.amount < 0).one()
        (_, alert), = office_payment_payloads(self.db, [reversal.id])
        self.assertTrue(alert["title"].startswith("↩️ ₹10 reversed"))
        self.assertIn("Cheque bounced", alert["body"])

        bell = my_updates(10, self.db, self.mr)
        self.assertEqual(bell["unread"], 2)
        self.assertEqual([item["is_reversal"] for item in bell["items"]], [True, False])
        mark_mine_seen(self.db, self.mr)
        self.assertEqual(my_updates(10, self.db, self.mr)["unread"], 0)

    def test_mr_bell_shows_invoices_the_office_removed(self):
        from app.routers.invoices import delete_invoice, delete_invoices
        second = models.Invoice(invoice_number="A00002", customer_id=self.invoice.customer_id, mr_id=self.mr.id,
                                total_amount=50, paid_amount=0, pending_amount=50, status="UNPAID")
        third = models.Invoice(invoice_number="A00003", customer_id=self.invoice.customer_id, mr_id=self.mr.id,
                               total_amount=25, paid_amount=0, pending_amount=25, status="UNPAID")
        self.db.add_all([second, third]); self.db.commit()
        delete_invoice(self.invoice.id, self.db, self.admin)
        delete_invoices(schemas.BulkDelete(ids=[second.id, third.id]), self.db, self.admin)
        bell = my_updates(10, self.db, self.mr)
        removed = [item for item in bell["items"] if item["kind"] == "removed"]
        self.assertEqual(sorted(item["invoice_count"] for item in removed), [1, 2])
        self.assertEqual(sum(item["amount"] for item in removed), 175)
        self.assertEqual(bell["unread"], 2)
        mark_mine_seen(self.db, self.mr)
        self.assertEqual(my_updates(10, self.db, self.mr)["unread"], 0)
        # Not news to an MR whose invoices these weren't.
        other = models.User(name="MR Two", employee_code="M2", role="MR", password_hash="x")
        self.db.add(other); self.db.commit()
        self.assertEqual(my_updates(10, self.db, other)["items"], [])

    def test_clear_all_empties_the_bell_and_new_updates_still_come(self):
        from app.routers.admin import clear_mr_bells
        from app.routers.notifications import clear_mine
        self.pay(self.admin, 30)
        self.assertEqual(len(my_updates(10, self.db, self.mr)["items"]), 1)
        clear_mine(self.db, self.mr)
        bell = my_updates(10, self.db, self.mr)
        self.assertEqual((bell["items"], bell["unread"]), ([], 0))
        self.pay(self.admin, 20)
        bell = my_updates(10, self.db, self.mr)
        self.assertEqual((len(bell["items"]), bell["unread"]), (1, 1))
        self.assertEqual(clear_mr_bells(None, self.db, self.admin), {"cleared": 1})
        self.assertEqual(my_updates(10, self.db, self.mr)["items"], [])

    def test_undone_office_entry_sends_nothing(self):
        self.pay(self.admin, 30)
        office = self.db.query(models.Payment).one()
        gone = office.id
        self.db.delete(office); self.db.commit()
        self.assertEqual(office_payment_payloads(self.db, [gone]), [])


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
