"""Admin multi-delete: invoices (any) and customers (no invoices), max 20."""
import unittest
from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.routers.customers import delete_customers
from app.routers.invoices import delete_invoices


class BulkDeleteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.db.add(self.admin); self.db.flush()
        self.busy = models.Customer(name="Busy")
        self.empty1 = models.Customer(name="Empty 1")
        self.empty2 = models.Customer(name="Empty 2")
        self.db.add_all([self.busy, self.empty1, self.empty2]); self.db.flush()
        self.invoices = []
        for number in ("A", "B", "C"):
            invoice = models.Invoice(invoice_number=number, invoice_date=date(2026, 11, 1), customer_id=self.busy.id,
                                     total_amount=100, paid_amount=0, pending_amount=100, status="UNPAID")
            self.db.add(invoice); self.invoices.append(invoice)
        self.db.commit()

    def tearDown(self):
        self.db.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def test_delete_invoices_together_and_audited(self):
        delete_invoices(schemas.BulkDelete(ids=[self.invoices[0].id, self.invoices[1].id]), self.db, self.admin)
        self.assertEqual([i.invoice_number for i in self.db.query(models.Invoice).all()], ["C"])
        self.assertEqual(self.db.query(models.AuditLog).filter_by(action="invoice_deleted").count(), 2)

    def test_missing_invoice_deletes_nothing(self):
        with self.assertRaises(HTTPException):
            delete_invoices(schemas.BulkDelete(ids=[self.invoices[0].id, 9999]), self.db, self.admin)
        self.assertEqual(self.db.query(models.Invoice).count(), 3)

    def test_customers_only_without_invoices(self):
        with self.assertRaises(HTTPException):
            delete_customers(schemas.BulkDelete(ids=[self.empty1.id, self.busy.id]), self.db, self.admin)
        self.assertEqual(self.db.query(models.Customer).count(), 3)
        delete_customers(schemas.BulkDelete(ids=[self.empty1.id, self.empty2.id]), self.db, self.admin)
        self.assertEqual([c.name for c in self.db.query(models.Customer).all()], ["Busy"])

    def test_at_most_20(self):
        with self.assertRaises(ValidationError):
            schemas.BulkDelete(ids=list(range(1, 22)))


if __name__ == "__main__":
    unittest.main()
