"""Regression coverage for the admin Tally import and mapping base."""

import io
import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.deps import get_current_user, require_admin
from app.routers.admin import router as admin_router
from app.routers.customers import router as customers_router
from app.routers.imports import router
from app.routers.invoices import router as invoices_router


def workbook_bytes(rows, include_tax=True):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["SALES BOOK"])
    sheet.append(["01-10-2026 to 28-10-2026"])
    headers = ["DATE", "BILL NO.", "PARTY NAME", "BILL AMT."]
    if include_tax:
        headers.extend(["TAXABLE", "TAX"])
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ImportInvoicesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.Session()
        self.admin = models.User(
            name="Admin", employee_code="ADMIN", role="ADMIN", password_hash="x"
        )
        self.mr = models.User(
            name="MR One", employee_code="MR001", role="MR", password_hash="x"
        )
        self.db.add_all([self.admin, self.mr])
        self.db.commit()

        app = FastAPI()
        app.include_router(router)
        app.include_router(admin_router)
        app.include_router(invoices_router)
        app.include_router(customers_router)

        def db_override():
            yield self.db

        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[require_admin] = lambda: self.admin
        app.dependency_overrides[get_current_user] = lambda: self.mr
        self.app = app
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def upload(self, rows, filename="sales.xlsx", include_tax=True):
        return self.client.post(
            "/admin/import-invoices",
            files={"file": (filename, workbook_bytes(rows, include_tax), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )

    def test_unmapped_invoice_imported_and_repeat_is_idempotent(self):
        row = ["01-10-2026", "A00001", "Tulsi Pharmacy", 7069, 6732.32, 336.64]
        response = self.upload([row])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 1)
        self.assertEqual(response.json()["unmapped_customers"][0]["customer_name"], "Tulsi Pharmacy")

        invoice = self.db.query(models.Invoice).one()
        self.assertEqual(invoice.total_amount, 7069)
        self.assertEqual(invoice.taxable_amount, 6732.32)
        self.assertEqual(invoice.tax_amount, 336.64)
        self.assertEqual(invoice.pending_amount, 7069)
        self.assertIsNone(invoice.mr_id)

        repeated = self.upload([["01-10-2026", " a00001 ", "TULSI PHARMACY", 7069, 6732.32, 336.64]])
        self.assertEqual(repeated.json()["created"], 0)
        self.assertEqual(repeated.json()["duplicates"], 1)
        self.assertEqual(self.db.query(models.Invoice).count(), 1)

    def test_existing_bill_number_is_updated_without_losing_collections(self):
        self.upload([["01-10-2026", "A00002", "Tulsi Pharmacy", 100, 90, 10]])
        invoice = self.db.query(models.Invoice).one()
        invoice.paid_amount = 40
        invoice.pending_amount = 60
        invoice.status = "PARTIAL"
        self.db.add(models.Payment(invoice_id=invoice.id, amount=40, collected_by=self.mr.id))
        self.db.commit()

        response = self.upload([["02-10-2026", "A00002", "Another Party", 125, 110, 15]])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated"], 1)
        self.assertEqual(response.json()["conflicts"], [])
        self.assertEqual(self.db.query(models.Invoice).count(), 1)
        invoice = self.db.query(models.Invoice).one()
        self.assertEqual(invoice.invoice_date.isoformat(), "2026-10-02")
        self.assertEqual(invoice.customer.name, "Another Party")
        self.assertEqual(invoice.total_amount, 125)
        self.assertEqual(invoice.taxable_amount, 110)
        self.assertEqual(invoice.tax_amount, 15)
        self.assertEqual(invoice.paid_amount, 40)
        self.assertEqual(invoice.pending_amount, 85)
        self.assertEqual(invoice.status, "PARTIAL")
        self.assertEqual(self.db.query(models.Payment).count(), 1)

    def test_mapping_backfills_unassigned_invoices_and_future_imports(self):
        self.upload([["01-10-2026", "A00003", "Tulsi Pharmacy", 200, 190, 10]])
        customer = self.db.query(models.Customer).one()
        response = self.client.put(
            f"/admin/customers/{customer.id}/mr", json={"mr_id": self.mr.id}
        )
        self.assertEqual(response.status_code, 200)
        invoice = self.db.query(models.Invoice).one()
        self.assertEqual(invoice.mr_id, self.mr.id)

        later = self.upload([["02-10-2026", "A00004", "TULSI PHARMACY", 300, 285, 15]])
        self.assertEqual(later.json()["created"], 1)
        self.assertEqual(self.db.query(models.Invoice).filter_by(invoice_number="A00004").one().mr_id, self.mr.id)

    def test_customer_list_exposes_assignment_and_invoice_count_to_mapping_ui(self):
        self.upload([["01-10-2026", "A00008", "Tulsi Pharmacy", 200, 190, 10]])
        response = self.client.get("/customers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["invoice_count"], 1)
        self.assertIsNone(response.json()[0]["mr_id"])
        self.assertIsNone(response.json()[0]["mr_name"])

    def test_invalid_rows_are_reported_without_becoming_invoices(self):
        response = self.upload([["not-a-date", "A00005", "Tulsi Pharmacy", "bad", 0, 0]])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 0)
        self.assertEqual(len(response.json()["row_errors"]), 1)
        self.assertEqual(self.db.query(models.Invoice).count(), 0)

    def test_workbook_without_optional_tax_columns_is_accepted(self):
        response = self.upload(
            [["01-10-2026", "A00009", "Tulsi Pharmacy", 50]], include_tax=False
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 1)
        invoice = self.db.query(models.Invoice).one()
        self.assertIsNone(invoice.taxable_amount)
        self.assertIsNone(invoice.tax_amount)

    def test_non_xlsx_upload_is_rejected(self):
        response = self.upload([], filename="sales.xls")
        self.assertEqual(response.status_code, 400)

    def test_recent_collection_feed_uses_existing_payment_ledger(self):
        customer = models.Customer(name="Tulsi Pharmacy", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        invoice = models.Invoice(
            invoice_number="A00007",
            customer_id=customer.id,
            mr_id=self.mr.id,
            total_amount=100,
            paid_amount=40,
            pending_amount=60,
            status="PARTIAL",
        )
        self.db.add(invoice)
        self.db.flush()
        self.db.add(models.Payment(invoice_id=invoice.id, amount=40, collected_by=self.mr.id))
        self.db.commit()

        response = self.client.get("/admin/recent-payments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["invoice_number"], "A00007")
        self.assertEqual(response.json()[0]["amount"], 40)

    def test_mr_manual_invoice_flow_remains_available_but_blocks_tally_duplicate(self):
        new_invoice = {
            "invoice_number": "MR-001",
            "invoice_date": "2026-10-01",
            "customer_name": "Tulsi Pharmacy",
            "total_amount": 100,
        }
        added = self.client.post("/invoices", json=new_invoice)
        self.assertEqual(added.status_code, 200)

        self.upload([["02-10-2026", "TALLY-001", "Tulsi Pharmacy", 200, 190, 10]])
        duplicate = self.client.post(
            "/invoices",
            json={**new_invoice, "invoice_number": "TALLY-001", "confirm_duplicate": True},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.db.query(models.Invoice).count(), 2)

    def test_import_route_requires_admin_dependency(self):
        def forbidden():
            raise HTTPException(status_code=403, detail="Admin only")

        self.app.dependency_overrides[require_admin] = forbidden
        response = self.upload([["01-10-2026", "A00006", "Tulsi Pharmacy", 10, 9, 1]])
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
