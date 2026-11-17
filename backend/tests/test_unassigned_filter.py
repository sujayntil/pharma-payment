"""MR filter "Unassigned" (mr_id 0) on the Admin customer and invoice lists."""
import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.routers.customers import list_customers
from app.routers.invoices import _admin_invoice_query


class UnassignedFilterTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        mr = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="x")
        self.db.add_all([self.admin, mr]); self.db.flush()
        mine = models.Customer(name="Mine", mr_id=mr.id)
        orphan = models.Customer(name="Orphan", mr_id=None)
        self.db.add_all([mine, orphan]); self.db.flush()
        for number, customer, mr_id in [("A", mine, mr.id), ("B", orphan, None)]:
            self.db.add(models.Invoice(invoice_number=number, invoice_date=date(2026, 11, 1), customer_id=customer.id, mr_id=mr_id,
                                       total_amount=100, paid_amount=0, pending_amount=100, status="UNPAID"))
        self.db.commit()
        self.mr = mr

    def tearDown(self):
        self.db.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def names(self, result):
        items = result["items"] if isinstance(result, dict) else result
        return [item["name"] if isinstance(item, dict) else item.name for item in items]

    def test_customers_unassigned(self):
        self.assertEqual(self.names(list_customers(mr_id=0, limit=50, offset=0, db=self.db, user=self.admin)), ["Orphan"])
        self.assertEqual(self.names(list_customers(mr_id=self.mr.id, limit=50, offset=0, db=self.db, user=self.admin)), ["Mine"])

    def test_invoices_unassigned(self):
        q, _ = _admin_invoice_query(self.db, 0, None, None, None, None, None, False, None)
        self.assertEqual([invoice.invoice_number for invoice in q.all()], ["B"])


if __name__ == "__main__":
    unittest.main()
