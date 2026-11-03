"""Regression coverage for the admin Tally import and mapping base."""

import io
import unittest
from datetime import date, datetime

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
from app.routers.mr import router as mr_router


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
        self.other_mr = models.User(
            name="MR Two", employee_code="MR002", role="MR", password_hash="x"
        )
        self.db.add_all([self.admin, self.mr, self.other_mr])
        self.db.commit()

        app = FastAPI()
        app.include_router(router)
        app.include_router(admin_router)
        app.include_router(invoices_router)
        app.include_router(customers_router)
        app.include_router(mr_router)

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

        reassigned = self.client.put(
            f"/admin/customers/{customer.id}/mr", json={"mr_id": self.other_mr.id}
        )
        self.assertEqual(reassigned.status_code, 200)
        invoice_mrs = {
            invoice.mr_id for invoice in self.db.query(models.Invoice).filter_by(customer_id=customer.id)
        }
        self.assertEqual(invoice_mrs, {self.other_mr.id})

    def test_customer_list_exposes_assignment_and_invoice_count_to_mapping_ui(self):
        self.upload([["01-10-2026", "A00008", "Tulsi Pharmacy", 200, 190, 10]])
        response = self.client.get("/customers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["invoice_count"], 1)
        self.assertIsNone(response.json()[0]["mr_id"])
        self.assertIsNone(response.json()[0]["mr_name"])

    def test_mr_customer_directory_is_scoped_and_summarized(self):
        assigned = models.Customer(name="MR One Customer", mr_id=self.mr.id)
        other = models.Customer(name="MR Two Customer", mr_id=self.other_mr.id)
        self.db.add_all([assigned, other])
        self.db.flush()
        self.db.add(models.Invoice(
            invoice_number="MR-CUSTOMER-01", customer_id=assigned.id,
            mr_id=self.mr.id, total_amount=100, paid_amount=25,
            pending_amount=75, status="PARTIAL", invoice_date=date(2026, 10, 31),
        ))
        self.db.commit()

        response = self.client.get("/mr/customers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["name"] for row in response.json()], ["MR One Customer"])
        self.assertEqual(response.json()[0]["invoice_count"], 1)
        self.assertEqual(response.json()[0]["outstanding"], 75)

        forbidden = self.client.get(f"/customers/{other.id}/ledger")
        self.assertEqual(forbidden.status_code, 404)

    def test_mr_invoice_list_filters_by_date_and_status(self):
        customer = models.Customer(name="Filter Customer", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        self.db.add_all([
            models.Invoice(invoice_number="FILTER-PAID", customer_id=customer.id, mr_id=self.mr.id, total_amount=100, paid_amount=100, pending_amount=0, status="PAID", invoice_date=date(2026, 10, 1)),
            models.Invoice(invoice_number="FILTER-PARTIAL", customer_id=customer.id, mr_id=self.mr.id, total_amount=200, paid_amount=50, pending_amount=150, status="PARTIAL", invoice_date=date(2026, 10, 2)),
            models.Invoice(invoice_number="FILTER-UNPAID", customer_id=customer.id, mr_id=self.mr.id, total_amount=300, paid_amount=0, pending_amount=300, status="UNPAID", invoice_date=date(2026, 10, 3)),
            models.Invoice(invoice_number="OTHER-MR", customer_id=customer.id, mr_id=self.other_mr.id, total_amount=400, paid_amount=400, pending_amount=0, status="PAID", invoice_date=date(2026, 10, 2)),
        ])
        self.db.commit()

        response = self.client.get("/invoices/mine", params={
            "date_from": "2026-10-02", "date_to": "2026-10-03", "status": "UNPAID",
            "limit": 50, "offset": 0,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 1)
        self.assertEqual([row["invoice_number"] for row in response.json()["items"]], ["FILTER-UNPAID"])

    def test_mr_customer_ledger_filters_rows_and_totals_by_date_and_status(self):
        customer = models.Customer(name="Ledger Filter Customer", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        self.db.add_all([
            models.Invoice(invoice_number="LEDGER-PAID", customer_id=customer.id, mr_id=self.mr.id, total_amount=100, paid_amount=100, pending_amount=0, status="PAID", invoice_date=date(2026, 10, 1)),
            models.Invoice(invoice_number="LEDGER-PARTIAL", customer_id=customer.id, mr_id=self.mr.id, total_amount=200, paid_amount=50, pending_amount=150, status="PARTIAL", invoice_date=date(2026, 10, 2)),
            models.Invoice(invoice_number="LEDGER-UNPAID", customer_id=customer.id, mr_id=self.mr.id, total_amount=300, paid_amount=0, pending_amount=300, status="UNPAID", invoice_date=date(2026, 10, 3)),
        ])
        self.db.commit()

        response = self.client.get(f"/customers/{customer.id}/ledger", params={
            "date_from": "2026-10-02", "date_to": "2026-10-03", "status": "UNPAID",
            "limit": 50, "offset": 0,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_invoiced"], 300)
        self.assertEqual(response.json()["total_paid"], 0)
        self.assertEqual(response.json()["outstanding"], 300)
        self.assertEqual([row["invoice_number"] for row in response.json()["invoices"]], ["LEDGER-UNPAID"])

    def test_list_pages_and_search_returns_all_matches(self):
        alpha = models.Customer(name="Alpha Pharmacy", mr_id=self.mr.id)
        alpha_clinic = models.Customer(name="Alpha Clinic", mr_id=self.mr.id)
        beta = models.Customer(name="Beta Chemist", mr_id=self.mr.id)
        self.db.add_all([alpha, alpha_clinic, beta])
        self.db.flush()

        invoices = [
            models.Invoice(invoice_number="A101", customer_id=alpha.id, mr_id=self.mr.id, total_amount=100, paid_amount=10, pending_amount=90, status="PARTIAL", invoice_date=date(2026, 10, 1)),
            models.Invoice(invoice_number="A102", customer_id=alpha.id, mr_id=self.mr.id, total_amount=150, paid_amount=0, pending_amount=150, status="UNPAID", invoice_date=date(2026, 10, 2)),
            models.Invoice(invoice_number="A103", customer_id=alpha_clinic.id, mr_id=self.mr.id, total_amount=200, paid_amount=20, pending_amount=180, status="PARTIAL", invoice_date=date(2026, 10, 3)),
            models.Invoice(invoice_number="B101", customer_id=beta.id, mr_id=self.mr.id, total_amount=300, paid_amount=30, pending_amount=270, status="PARTIAL", invoice_date=date(2026, 10, 4)),
        ]
        self.db.add_all(invoices)
        self.db.flush()
        self.db.add_all([
            models.Payment(invoice_id=invoices[0].id, amount=10, collected_by=self.mr.id),
            models.Payment(invoice_id=invoices[2].id, amount=20, collected_by=self.mr.id),
            models.Payment(invoice_id=invoices[3].id, amount=30, collected_by=self.mr.id),
        ])
        self.db.commit()

        invoice_page = self.client.get("/invoices", params={"limit": 1, "offset": 0}).json()
        self.assertEqual(invoice_page["total"], 4)
        self.assertEqual(len(invoice_page["items"]), 1)

        invoice_search = self.client.get("/invoices", params={
            "search": "Alpha", "limit": 1, "offset": 2,
        }).json()
        self.assertEqual(invoice_search["total"], 3)
        self.assertEqual(len(invoice_search["items"]), 3)
        self.assertIsNone(invoice_search["limit"])
        self.assertEqual(invoice_search["offset"], 0)

        customer_search = self.client.get("/customers", params={
            "search": "Alpha", "limit": 1, "offset": 1,
        }).json()
        self.assertEqual(customer_search["total"], 2)
        self.assertEqual(len(customer_search["items"]), 2)

        mr_customer_search = self.client.get("/mr/customers", params={
            "search": "Alpha", "limit": 1, "offset": 1,
        }).json()
        self.assertEqual(mr_customer_search["total"], 2)
        self.assertEqual(len(mr_customer_search["items"]), 2)

        ledger_page = self.client.get(f"/customers/{alpha.id}/ledger", params={
            "limit": 1, "offset": 0,
        }).json()
        self.assertEqual(ledger_page["invoice_count"], 2)
        self.assertEqual(len(ledger_page["invoices"]), 1)
        ledger_search = self.client.get(f"/customers/{alpha.id}/ledger", params={
            "search": "UNPAID", "limit": 1,
        }).json()
        self.assertEqual(ledger_search["invoice_count"], 1)
        self.assertEqual(len(ledger_search["invoices"]), 1)

        outstanding_search = self.client.get("/mr/outstanding", params={
            "search": "Alpha", "limit": 1, "offset": 1,
        }).json()
        self.assertEqual(outstanding_search["total_count"], 3)
        self.assertEqual(len(outstanding_search["items"]), 3)
        self.assertEqual(outstanding_search["total_outstanding"], 690)

        collection_search = self.client.get("/admin/collections", params={
            "search": "Alpha", "limit": 1, "offset": 1,
        }).json()
        self.assertEqual(collection_search["total_count"], 2)
        self.assertEqual(len(collection_search["rows"]), 2)
        self.assertEqual(collection_search["total_amount"], 30)

    def test_admin_maintenance_keeps_customer_invoice_and_ledger_consistent(self):
        customer = models.Customer(name="Original Chemist", type="Chemist", mr_id=self.mr.id)
        removable = models.Customer(name="Unused Customer", type="Doctor")
        self.db.add_all([customer, removable])
        self.db.flush()
        older = models.Invoice(
            invoice_number="ADMIN-OLD", customer_id=customer.id, mr_id=self.mr.id,
            invoice_date=date(2026, 10, 1), total_amount=100, paid_amount=25,
            pending_amount=75, status="PARTIAL",
        )
        latest = models.Invoice(
            invoice_number="ADMIN-LATEST", customer_id=customer.id, mr_id=self.mr.id,
            invoice_date=date(2026, 10, 5), total_amount=200, paid_amount=0,
            pending_amount=200, status="UNPAID",
        )
        self.db.add_all([older, latest])
        self.db.flush()
        self.db.add(models.Payment(invoice_id=older.id, amount=25, collected_by=self.mr.id))
        self.db.commit()

        filtered = self.client.get("/customers", params={"mr_id": self.mr.id, "customer_type": "chemist"})
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([row["name"] for row in filtered.json()], ["Original Chemist"])

        updated = self.client.put(f"/customers/{customer.id}", json={
            "name": "Updated Chemist", "type": "Distributor", "phone": "9000000000",
            "mr_id": self.other_mr.id,
        })
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["name"], "Updated Chemist")
        self.assertEqual(self.db.get(models.Invoice, latest.id).mr_id, self.other_mr.id)
        self.app.dependency_overrides[get_current_user] = lambda: self.other_mr

        blocked_delete = self.client.delete(f"/customers/{customer.id}")
        self.assertEqual(blocked_delete.status_code, 400)
        self.assertEqual(self.client.delete(f"/customers/{removable.id}").status_code, 204)

        invoices = self.client.get("/invoices", params={"limit": 50}).json()
        self.assertEqual([row["invoice_number"] for row in invoices["items"]], ["ADMIN-LATEST", "ADMIN-OLD"])

        ledger = self.client.get(f"/customers/{customer.id}/ledger", params={
            "date_from": "2026-10-05", "date_to": "2026-10-05", "limit": 50,
        })
        self.assertEqual(ledger.status_code, 200)
        self.assertEqual(ledger.json()["total_invoiced"], 200)
        self.assertEqual(ledger.json()["outstanding"], 200)
        self.assertEqual([row["invoice_number"] for row in ledger.json()["invoices"]], ["ADMIN-LATEST"])

        marked_paid = self.client.put(
            f"/admin/invoices/{latest.id}/collection-status", json={"status": "PAID"}
        )
        self.assertEqual(marked_paid.status_code, 200)
        self.assertEqual(marked_paid.json()["pending_amount"], 0)
        self.assertEqual(self.db.get(models.Invoice, latest.id).status, "PAID")

        marked_unpaid = self.client.put(
            f"/admin/invoices/{latest.id}/collection-status", json={"status": "UNPAID"}
        )
        self.assertEqual(marked_unpaid.status_code, 200)
        self.assertEqual(marked_unpaid.json()["pending_amount"], 200)
        self.assertEqual(self.db.query(models.AuditLog).filter_by(action="admin_collection_status_override").count(), 2)

    def test_manual_invoice_uses_selected_existing_customer_id(self):
        first = models.Customer(name="Same Name", mr_id=self.mr.id)
        second = models.Customer(name="Same Name")
        self.db.add_all([first, second])
        self.db.commit()

        response = self.client.post("/admin/manual-invoices", json={
            "invoice_number": "SELECTED-CUSTOMER", "invoice_date": "2026-10-30",
            "customer_id": first.id, "total_amount": 250,
        })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.db.query(models.Invoice).one().customer_id, first.id)

    def test_admin_can_edit_and_delete_invoice(self):
        customer = models.Customer(name="Invoice Customer", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        invoice = models.Invoice(
            invoice_number="EDIT-DELETE-01", customer_id=customer.id, mr_id=self.mr.id,
            invoice_date=date(2026, 10, 1), total_amount=100, paid_amount=40,
            pending_amount=60, status="PARTIAL",
        )
        self.db.add(invoice)
        self.db.flush()
        self.db.add(models.Payment(invoice_id=invoice.id, amount=40, collected_by=self.mr.id))
        self.db.commit()
        self.app.dependency_overrides[get_current_user] = lambda: self.admin

        updated = self.client.put(f"/invoices/{invoice.id}", json={
            "invoice_number": "EDIT-DELETE-UPDATED", "invoice_date": "2026-10-06",
            "total_amount": 125, "payment_mode": "UPI", "remarks": "Corrected by admin",
        })
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["pending_amount"], 85)
        self.assertEqual(updated.json()["status"], "PARTIAL")

        self.assertEqual(self.client.delete(f"/invoices/{invoice.id}").status_code, 204)
        self.assertEqual(self.db.query(models.Invoice).count(), 0)
        self.assertEqual(self.db.query(models.Payment).count(), 0)

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

    def test_collections_filters_and_uses_ist_date_boundaries(self):
        customer = models.Customer(name="Collections Customer", mr_id=self.mr.id)
        self.db.add(customer)
        self.db.flush()
        invoice = models.Invoice(
            invoice_number="COLLECT-IST-01",
            invoice_date=date(2026, 10, 30),
            customer_id=customer.id,
            mr_id=self.mr.id,
            total_amount=100,
            paid_amount=50,
            pending_amount=50,
            status="PARTIAL",
        )
        self.db.add(invoice)
        self.db.flush()
        before_ist_day = models.Payment(
            invoice_id=invoice.id,
            amount=15,
            mode="UPI",
            collected_by=self.mr.id,
            payment_date=datetime(2026, 10, 30, 18, 29),
        )
        inside_ist_day = models.Payment(
            invoice_id=invoice.id,
            amount=35,
            mode="UPI",
            collected_by=self.mr.id,
            payment_date=datetime(2026, 10, 30, 18, 45),
        )
        self.db.add_all([before_ist_day, inside_ist_day])
        self.db.commit()

        response = self.client.get("/admin/collections", params={
            "date_from": "2026-10-31",
            "date_to": "2026-10-31",
            "mr_id": self.mr.id,
            "mode": "UPI",
            "search": "COLLECT-IST-01",
        })

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_count"], 1)
        self.assertEqual(data["total_amount"], 35)
        self.assertEqual(data["rows"][0]["payment_id"], inside_ist_day.id)

        dashboard = self.client.get("/admin/dashboard", params={
            "date_from": "2026-10-31", "date_to": "2026-10-31",
        })
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["collected"], 35)

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
