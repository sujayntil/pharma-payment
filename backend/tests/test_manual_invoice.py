import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.deps import get_current_user
from app.routers.admin import router as admin_router


class ManualInvoiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.admin = models.User(
            name="Admin", employee_code="ADMIN", role="ADMIN", password_hash="x"
        )
        self.mr = models.User(
            name="MR One", employee_code="MR001", role="MR", password_hash="x"
        )
        self.db.add_all([self.admin, self.mr])
        self.db.commit()

        app = FastAPI()
        app.include_router(admin_router)

        def db_override():
            yield self.db

        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.current_user = self.admin
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def submit(self, invoice_number="A00100", customer_name="Tulsi Pharmacy"):
        return self.client.post(
            "/admin/manual-invoices",
            json={
                "invoice_number": invoice_number,
                "invoice_date": "2026-10-30",
                "customer_name": customer_name,
                "total_amount": 1592,
            },
        )

    def test_invoice_inherits_assigned_customer_mr(self):
        customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.commit()

        response = self.submit()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["mr_name"], self.mr.name)
        invoice = self.db.query(models.Invoice).one()
        self.assertEqual(invoice.mr_id, self.mr.id)
        self.assertEqual(invoice.pending_amount, 1592)
        self.assertEqual(invoice.status, "UNPAID")
        self.assertEqual(self.db.query(models.Payment).count(), 0)

    def test_new_customer_is_created_unassigned(self):
        response = self.submit(customer_name="New Pharmacy")

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["mr_name"])
        customer = self.db.query(models.Customer).one()
        invoice = self.db.query(models.Invoice).one()
        self.assertEqual(invoice.customer_id, customer.id)
        self.assertIsNone(invoice.mr_id)

    def test_duplicate_invoice_number_is_rejected_case_insensitively(self):
        self.db.add(models.Invoice(
            invoice_number="A00100",
            customer_id=None,
            mr_id=self.mr.id,
            total_amount=100,
            paid_amount=0,
            pending_amount=100,
            status="UNPAID",
        ))
        self.db.commit()

        response = self.submit(invoice_number=" a00100 ")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(models.Invoice).count(), 1)

    def test_ambiguous_duplicate_customer_name_is_rejected(self):
        self.db.add_all([
            models.Customer(name="Tulsi Pharmacy"),
            models.Customer(name="TULSI PHARMACY"),
        ])
        self.db.commit()

        response = self.submit()

        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(models.Invoice).count(), 0)

    def test_mr_cannot_use_admin_manual_entry(self):
        self.current_user = self.mr

        response = self.submit()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.db.query(models.Invoice).count(), 0)


if __name__ == "__main__":
    unittest.main()
