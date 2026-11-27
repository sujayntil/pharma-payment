"""Standard exports: the same header (title, filters, who/when, confidential),
a Total row, and Excel or PDF for every Admin export."""
import unittest
from datetime import date
from io import BytesIO

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.deps import get_current_user, require_admin
from app.routers import admin, deletions, invoices, report_tables


class ReportExportTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.admin = models.User(name="Priya", employee_code="ADM", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Amit", employee_code="MR1", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr])
        self.db.flush()
        chem = models.Customer(name="City Care", type="Chemist", mr_id=self.mr.id)
        dist = models.Customer(name="Metro Distributors", type="Distributor", mr_id=self.mr.id)
        self.db.add_all([chem, dist])
        self.db.flush()
        for no, cust, total, paid in [("C1", chem, 1000, 1000), ("C2", chem, 2500, 0), ("D1", dist, 4000, 1500)]:
            inv = models.Invoice(invoice_number=no, customer_id=cust.id, mr_id=self.mr.id, invoice_date=date(2026, 10, 5),
                                 total_amount=total, paid_amount=paid, pending_amount=total - paid,
                                 status="PAID" if paid >= total else ("PARTIAL" if paid else "UNPAID"))
            self.db.add(inv)
            self.db.flush()
            if paid:
                self.db.add(models.Payment(invoice_id=inv.id, amount=paid, mode="UPI", collected_by=self.mr.id))
        self.db.commit()

        app = FastAPI()
        for r in (admin.router, deletions.router, invoices.router, report_tables.router):
            app.include_router(r)
        self.user = self.admin

        def admin_only():
            if self.user.role != "ADMIN":
                raise HTTPException(403, "Admin only")
            return self.user
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[require_admin] = admin_only
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()

    def _xlsx(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        return load_workbook(BytesIO(response.content)).active

    def _pdf(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn(".pdf", response.headers["content-disposition"])

    def test_invoices_header_filters_total_and_pdf(self):
        params = {"customer_type": "Chemist", "status": "UNPAID", "date_from": "2026-10-01", "date_to": "2026-10-31"}
        ws = self._xlsx(self.client.get("/invoices/export", params=params))
        self.assertEqual(ws["A1"].value, "Invoices")
        self.assertEqual(ws["A2"].value, "Filters: Invoice date: 1–31 Oct 2026 · Type: Chemist · Status: Unpaid")
        self.assertIn("by Priya", ws["A3"].value)
        self.assertIn("Confidential – for internal use only", ws["A3"].value)
        self.assertEqual(ws["A5"].value, "Invoice")
        self.assertEqual(ws["A6"].value, "C2")
        self.assertEqual((ws["A7"].value, ws["H7"].value), ("Total", 2500))
        self.assertEqual(ws.auto_filter.ref, "A5:N6")
        self.assertEqual(ws.freeze_panes, "A6")
        disposition = self.client.get("/invoices/export", params=params).headers["content-disposition"]
        self.assertIn("Invoices%20-%20Invoice%20date%201%E2%80%9331%20Oct%202026", disposition)
        self.assertIn('filename="Invoices - Invoice date 1-31 Oct 2026', disposition)
        self._pdf(self.client.get("/invoices/export", params={**params, "format": "pdf"}))
        self.assertEqual(self.client.get("/invoices/export", params={"format": "doc"}).status_code, 422)

    def test_dashboard_collections_and_deleted_in_both_formats(self):
        ws = self._xlsx(self.client.get("/admin/dashboard/export-by-type", params={"customer_type": "Distributor"}))
        self.assertEqual(ws.title, "Distributor")
        self.assertEqual(ws["A6"].value, "Metro Distributors")
        self._pdf(self.client.get("/admin/dashboard/export-by-type", params={"format": "pdf"}))

        ws = self._xlsx(self.client.get("/admin/collections/export"))
        self.assertEqual(ws["A1"].value, "Collections")
        self.assertIn("Net ₹2,500", ws["A4"].value)
        self._pdf(self.client.get("/admin/collections/export", params={"format": "pdf"}))

        ws = self._xlsx(self.client.get("/admin/deletions/export"))
        self.assertEqual(ws["A1"].value, "Deleted items")
        self._pdf(self.client.get("/admin/deletions/export", params={"format": "pdf"}))

    def test_on_screen_table_report(self):
        body = {"title": "Bills owed", "filters": ["Nov 2026", "Type: Doctor"], "format": "xlsx",
                "columns": [{"header": "Customer", "width": 30}, {"header": "Date", "kind": "date"},
                            {"header": "Pending", "kind": "money", "total": True}],
                "rows": [["=HYPERLINK(1)", "2026-11-02", 1200.5], ["Dr Mehta", "2026-11-05", 800]]}
        ws = self._xlsx(self.client.post("/admin/reports/table", json=body))
        self.assertEqual(ws["A2"].value, "Filters: Nov 2026 · Type: Doctor")
        self.assertEqual(ws["A6"].value, "'=HYPERLINK(1)")  # formulas never run
        self.assertEqual(ws["B6"].value.date(), date(2026, 11, 2))
        self.assertEqual((ws["A8"].value, ws["C8"].value), ("Total", 2000.5))
        self._pdf(self.client.post("/admin/reports/table", json={**body, "format": "pdf"}))
        self.assertEqual(self.client.post("/admin/reports/table", json={**body, "columns": []}).status_code, 422)
        self.user = self.mr
        self.assertEqual(self.client.post("/admin/reports/table", json=body).status_code, 403)
        self.assertEqual(self.client.get("/invoices/export").status_code, 403)


if __name__ == "__main__":
    unittest.main()
