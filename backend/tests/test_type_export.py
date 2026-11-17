"""Dashboard export: customers grouped by type, totals, date filter."""
import unittest
from datetime import date
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.routers.admin import _customer_type_filter, _date_range_filter
from app.type_export import build_workbook, collect_rows


class TypeExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        mr = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="x")
        self.db.add(mr); self.db.flush()
        doc = models.Customer(name="Dr. Mehta", type="Doctor", mr_id=mr.id)
        chem = models.Customer(name="City Care", type="chemist", mr_id=mr.id)
        odd = models.Customer(name="Odd One", type=None, mr_id=mr.id)
        self.db.add_all([doc, chem, odd]); self.db.flush()
        for number, customer, day, total, paid in [
            ("A", doc, date(2026, 9, 30), 7400, 0), ("B", doc, date(2026, 11, 14), 2200, 2200),
            ("C", chem, date(2026, 10, 12), 6200, 2000), ("D", odd, date(2026, 11, 1), 1000, 0),
        ]:
            self.db.add(models.Invoice(invoice_number=number, invoice_date=day, customer_id=customer.id, mr_id=mr.id,
                                       total_amount=total, paid_amount=paid, pending_amount=total - paid,
                                       status="PAID" if paid >= total else ("PARTIAL" if paid else "UNPAID")))
        self.db.commit()

    def tearDown(self):
        self.db.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def test_groups_by_type_with_totals_and_sheets(self):
        grouped = collect_rows(self.db, _date_range_filter(None, None), _customer_type_filter(""))
        self.assertEqual(sorted(grouped), ["Chemist", "Doctor", "Other"])
        mehta = grouped["Doctor"][0]
        self.assertEqual((mehta["invoices"], mehta["billed"], mehta["collected"], mehta["pending"]), (2, 9600, 2200, 7400))
        self.assertEqual(mehta["oldest"], date(2026, 9, 30))
        wb = load_workbook(BytesIO(build_workbook(grouped, "All time")))
        self.assertEqual(wb.sheetnames, ["Summary", "Chemist", "Doctor", "Other"])
        summary = wb["Summary"]
        self.assertEqual(summary["A5"].value, "Chemist")
        self.assertEqual(summary.cell(row=summary.max_row, column=1).value, "Total")
        self.assertEqual(summary.cell(row=summary.max_row, column=6).value, 7400 + 4200 + 1000)

    def test_follows_dates_and_type(self):
        grouped = collect_rows(self.db, _date_range_filter(date(2026, 11, 1), date(2026, 11, 30)), _customer_type_filter("doctor"))
        self.assertEqual(list(grouped), ["Doctor"])
        self.assertEqual(grouped["Doctor"][0]["invoices"], 1)  # only INV B is in November


if __name__ == "__main__":
    unittest.main()
