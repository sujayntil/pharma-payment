"""'Month cleared' celebration: when an MR pays off the last open invoice
of a finished invoice month. On time = every invoice paid within 40 days of
its invoice date. Shown once; an undo-and-redo stays quiet."""
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import BackgroundTasks
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.month_clear import IST
from app.routers.admin import delete_user, override_collection_status, reverse_payment
from app.routers.mr import claim_months_cleared
from app.routers.notifications import mark_seen, recent_collections
from app.push import month_alert_payloads
from app.routers.payments import add_batch_payment, add_batch_payments, add_payment, undo_payment

TODAY = datetime.now(IST).date()
THIS_MONTH_START = TODAY.replace(day=1)
LAST_MONTH_END = THIS_MONTH_START - timedelta(days=1)          # always <= 31 days ago: on time
OLD = (LAST_MONTH_END.replace(day=1) - timedelta(days=1)).replace(day=1)  # 2 months back, >= 59 days ago: late


class MonthClearTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr])
        self.db.flush()
        self.customer = models.Customer(name="Dr. Mehta Clinic", mr_id=self.mr.id)
        self.city = models.Customer(name="City Care", mr_id=self.mr.id)
        self.db.add_all([self.customer, self.city])
        self.db.flush()
        patch("app.routers.payments.send_batch_notification").start()
        patch("app.routers.payments.send_payment_notification").start()

    def tearDown(self):
        patch.stopall()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def invoice(self, number, day, amount=1000, customer=None):
        inv = models.Invoice(invoice_number=number, invoice_date=day, customer_id=(customer or self.customer).id, mr_id=self.mr.id,
                             total_amount=amount, paid_amount=0, pending_amount=amount, status="UNPAID")
        self.db.add(inv)
        self.db.commit()
        return inv

    def pay(self, inv, amount=None, user=None, tasks=None):
        body = schemas.PaymentCreate(invoice_id=inv.id, amount=amount or inv.pending_amount, mode="UPI")
        return add_payment(body, tasks if tasks is not None else BackgroundTasks(), self.db, user or self.mr)

    def month_tasks(self, tasks):
        return [task.args for task in tasks.tasks if getattr(task.func, "__name__", "") == "send_month_cleared_notification"]

    def test_last_open_invoice_of_last_month_celebrates_on_time(self):
        a = self.invoice("A", LAST_MONTH_END)
        b = self.invoice("B", LAST_MONTH_END.replace(day=1))
        self.assertEqual(self.pay(a)["months_cleared"], [])          # B still open
        self.assertEqual(self.pay(b, 400)["months_cleared"], [])     # part payment
        months = self.pay(b)["months_cleared"]
        self.assertEqual(len(months), 1)
        self.assertEqual(months[0]["month"], LAST_MONTH_END.strftime("%Y-%m"))
        self.assertEqual(months[0]["invoices"], 2)
        self.assertIn(LAST_MONTH_END.strftime("%B"), months[0]["label"])
        self.assertEqual(months[0]["on_time"], (TODAY - LAST_MONTH_END.replace(day=1)).days <= 40)

    def test_invoice_paid_after_40_days_is_late(self):
        months = self.pay(self.invoice("OLD", OLD))["months_cleared"]
        self.assertEqual(len(months), 1)
        self.assertFalse(months[0]["on_time"])

    def test_on_time_uses_the_day_each_invoice_was_paid(self):
        early = self.invoice("E", OLD)
        self.pay(early)
        # pretend it was paid 10 days after its invoice date
        self.db.query(models.Payment).filter_by(invoice_id=early.id).update({"payment_date": datetime.combine(OLD + timedelta(days=10), datetime.min.time())})
        self.db.commit()
        self.db.query(models.MonthClearance).delete(); self.db.commit()
        later = self.invoice("E2", OLD + timedelta(days=1))
        months = self.pay(later)["months_cleared"]
        self.assertFalse(months[0]["on_time"])                       # E2 paid now, > 40 days

    def test_running_month_never_celebrates(self):
        self.assertEqual(self.pay(self.invoice("NOW", TODAY))["months_cleared"], [])

    def test_shown_once_and_undo_redo_stays_quiet(self):
        a = self.invoice("A", LAST_MONTH_END)
        first = self.pay(a)
        self.assertEqual(len(first["months_cleared"]), 1)
        undo_payment(first["payment_id"], self.db, self.mr)
        record = self.db.query(models.MonthClearance).one()
        self.assertIsNotNone(record.undone_at)                       # month open again
        self.assertEqual(self.pay(a)["months_cleared"], [])          # redo straight after: quiet
        self.db.refresh(record)
        self.assertIsNone(record.undone_at)

    def test_cleared_again_long_after_an_undo_celebrates_again(self):
        a = self.invoice("A", LAST_MONTH_END)
        undo_payment(self.pay(a)["payment_id"], self.db, self.mr)
        record = self.db.query(models.MonthClearance).one()
        record.undone_at = record.undone_at - timedelta(hours=2)
        self.db.commit()
        self.assertEqual(len(self.pay(a)["months_cleared"]), 1)

    def claim(self, mr=None):
        return claim_months_cleared(self.db, mr or self.mr)["months"]

    def test_admin_collecting_saves_it_for_the_mr_next_open(self):
        a = self.invoice("A", LAST_MONTH_END)
        self.assertEqual(self.pay(a, user=self.admin)["months_cleared"], [])   # nothing on the Admin's screen
        record = self.db.query(models.MonthClearance).one()
        self.assertEqual(record.user_id, self.mr.id)
        self.assertIsNone(record.shown_at)
        first = self.claim()
        self.assertEqual([m["month"] for m in first], [LAST_MONTH_END.strftime("%Y-%m")])
        self.assertEqual(self.claim(), [])                                        # only once

    def test_mr_collecting_is_not_shown_again_on_next_open(self):
        self.pay(self.invoice("A", LAST_MONTH_END))
        self.assertEqual(self.claim(), [])

    def test_admin_mark_paid_and_mark_unpaid(self):
        a = self.invoice("A", OLD)
        override_collection_status(a.id, schemas.CollectionStatusUpdate(status="PAID", mode="Cash"), self.db, self.admin)
        record = self.db.query(models.MonthClearance).one()
        self.assertIsNone(record.shown_at)
        override_collection_status(a.id, schemas.CollectionStatusUpdate(status="UNPAID", reason="wrong"), self.db, self.admin)
        self.db.refresh(record)
        self.assertIsNotNone(record.undone_at)
        self.assertEqual(self.claim(), [])                                        # open again: nothing to show

    def test_undone_before_the_mr_opens_the_app_shows_nothing(self):
        a = self.invoice("A", LAST_MONTH_END)
        result = self.pay(a, user=self.admin)
        undo_payment(result["payment_id"], self.db, self.admin)
        self.assertEqual(self.claim(), [])

    def test_month_cleared_while_running_is_shown_once_it_has_ended(self):
        # Paid during last month (no record because it was the running month then).
        a = self.invoice("A", LAST_MONTH_END)
        a.paid_amount, a.pending_amount, a.status = a.total_amount, 0, "PAID"
        self.db.commit()
        self.assertEqual([m["month"] for m in self.claim()], [LAST_MONTH_END.strftime("%Y-%m")])
        self.assertEqual(self.claim(), [])

    def test_open_last_month_or_no_invoices_shows_nothing(self):
        self.assertEqual(self.claim(), [])
        self.invoice("A", LAST_MONTH_END)
        self.assertEqual(self.claim(), [])

    def test_admin_batch_over_two_mrs(self):
        neha = models.User(name="Neha", employee_code="M2", role="MR", password_hash="x")
        self.db.add(neha); self.db.flush()
        other = models.Customer(name="Other", mr_id=neha.id); self.db.add(other); self.db.flush()
        a = self.invoice("A", LAST_MONTH_END)
        b = models.Invoice(invoice_number="B", invoice_date=LAST_MONTH_END, customer_id=other.id, mr_id=neha.id,
                           total_amount=500, paid_amount=0, pending_amount=500, status="UNPAID")
        self.db.add(b); self.db.commit()
        body = schemas.PaymentBatchesCreate(groups=[
            schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=1000, invoice_ids=[a.id], mode="UPI"),
            schemas.PaymentBatchCreate(customer_id=other.id, amount=500, invoice_ids=[b.id], mode="UPI"),
        ])
        self.assertEqual(add_batch_payments(body, BackgroundTasks(), self.db, self.admin)["months_cleared"], [])
        self.assertEqual(len(self.claim()), 1)
        self.assertEqual(len(self.claim(neha)), 1)

    def test_admins_are_alerted_once_when_the_mr_clears_it(self):
        a = self.invoice("A", LAST_MONTH_END)
        tasks = BackgroundTasks()
        self.pay(a, tasks=tasks)
        key = LAST_MONTH_END.strftime("%Y-%m")
        self.assertEqual(self.month_tasks(tasks), [(self.mr.id, [key])])
        first = month_alert_payloads(self.db, self.mr.id, [key]); self.db.commit()
        self.assertEqual(len(first), 1)
        self.assertIn("Rahul cleared", first[0]["title"])
        self.assertEqual(month_alert_payloads(self.db, self.mr.id, [key]), [])   # only once

    def test_no_admin_alert_when_an_admin_cleared_it_or_it_was_undone(self):
        a = self.invoice("A", LAST_MONTH_END)
        tasks = BackgroundTasks()
        self.pay(a, user=self.admin, tasks=tasks)
        self.assertEqual(self.month_tasks(tasks), [])
        key = LAST_MONTH_END.strftime("%Y-%m")
        self.assertEqual(month_alert_payloads(self.db, self.mr.id, [key]), [])
        b = self.invoice("B", OLD)
        undo_payment(self.pay(b)["payment_id"], self.db, self.mr)
        self.assertEqual(month_alert_payloads(self.db, self.mr.id, [OLD.strftime("%Y-%m")]), [])

    def test_undo_and_redo_still_alerts_once(self):
        a = self.invoice("A", LAST_MONTH_END)
        undo_payment(self.pay(a)["payment_id"], self.db, self.mr)
        key = LAST_MONTH_END.strftime("%Y-%m")
        self.assertEqual(month_alert_payloads(self.db, self.mr.id, [key]), [])   # the first alert finds it undone
        self.pay(a)                                                               # redo (quiet for the MR)
        self.assertEqual(len(month_alert_payloads(self.db, self.mr.id, [key])), 1)

    def test_month_noticed_at_month_end_alerts_admins(self):
        a = self.invoice("A", LAST_MONTH_END)
        a.paid_amount, a.pending_amount, a.status = a.total_amount, 0, "PAID"
        self.db.commit()
        tasks = BackgroundTasks()
        claim_months_cleared(self.db, self.mr, tasks)
        self.assertEqual(self.month_tasks(tasks), [(self.mr.id, [LAST_MONTH_END.strftime("%Y-%m")], 0)])

    def test_bell_shows_month_cleared_and_marks_it_seen(self):
        self.pay(self.invoice("A", LAST_MONTH_END))
        self.pay(self.invoice("B", OLD), user=self.admin)                         # Admin's own: not in the bell
        bell = recent_collections(20, self.db, self.admin)
        self.assertEqual([(m["mr_name"], m["is_new"]) for m in bell["months"]], [("Rahul", True)])
        unread = bell["unread"]
        mark_seen(self.db, self.admin)
        bell = recent_collections(20, self.db, self.admin)
        self.assertFalse(bell["months"][0]["is_new"])
        self.assertLess(bell["unread"], unread)

    def test_deleting_an_mr_removes_their_cleared_months(self):
        neha = models.User(name="Neha", employee_code="M2", role="MR", password_hash="x")
        self.db.add(neha); self.db.flush()
        self.db.add(models.MonthClearance(user_id=neha.id, month="2026-01", invoice_count=1, cleared_at=datetime(2026, 2, 1)))
        self.db.commit()
        delete_user(neha.id, self.db, self.admin)
        self.assertEqual(self.db.query(models.MonthClearance).count(), 0)

    def test_admin_reversal_opens_the_month_again(self):
        a = self.invoice("A", LAST_MONTH_END)
        result = self.pay(a)
        reverse_payment(result["payment_id"], schemas.PaymentReversalCreate(reason="Cheque bounced"), self.db, self.admin)
        record = self.db.query(models.MonthClearance).one()
        self.assertIsNotNone(record.undone_at)

    def test_collect_from_customer_and_several_customers(self):
        a = self.invoice("A", LAST_MONTH_END)
        b = self.invoice("B", OLD)
        body = schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=2000, invoice_ids=[a.id, b.id], mode="UPI")
        months = add_batch_payment(body, BackgroundTasks(), self.db, self.mr)["months_cleared"]
        self.assertEqual(sorted(m["month"] for m in months), sorted({LAST_MONTH_END.strftime("%Y-%m"), OLD.strftime("%Y-%m")}))
        # several customers at once: one month split across two customers
        c = self.invoice("C", OLD.replace(day=5))
        d = self.invoice("D", OLD.replace(day=6), customer=self.city)
        self.db.query(models.MonthClearance).delete(); self.db.commit()
        body = schemas.PaymentBatchesCreate(groups=[
            schemas.PaymentBatchCreate(customer_id=self.customer.id, amount=1000, invoice_ids=[c.id], mode="UPI"),
            schemas.PaymentBatchCreate(customer_id=self.city.id, amount=1000, invoice_ids=[d.id], mode="Cash"),
        ])
        months = add_batch_payments(body, BackgroundTasks(), self.db, self.mr)["months_cleared"]
        self.assertEqual([(m["month"], m["invoices"]) for m in months], [(OLD.strftime("%Y-%m"), 3)])


if __name__ == "__main__":
    unittest.main()
