"""Typed text (search, reference, reason, names) must never act as PDF markup."""
import unittest
from datetime import date, datetime

from app import models
from app.ledger_pdf import build_ledger_pdf
from app.reports import Col, Report, Sheet, build_pdf, build_xlsx

BAD = ['R&D <x', '<img src="/etc/hosts"/>', '<a href="javascript:alert(1)">x</a>', '=HYPERLINK("http://x")']


class PdfTextSafeTests(unittest.TestCase):
    def test_report_pdf_and_excel(self):
        for bad in BAD:
            report = Report(title=bad, filters=[f"Search: {bad}"], exported_by=bad, sheets=[
                Sheet(name="S", heading=bad, note=bad, columns=[Col(bad, "text", width=20)], rows=[[bad]])])
            self.assertTrue(build_pdf(report).startswith(b"%PDF"))
            build_xlsx(report)

    def test_ledger_pdf(self):
        for bad in BAD:
            c = models.Customer(id=1, name=bad, type="Chemist", area=bad, phone="98")
            inv = models.Invoice(id=1, invoice_number=bad, invoice_date=date(2026, 1, 1), total_amount=100,
                                 paid_amount=50, pending_amount=50, status="PARTIAL")
            pay = models.Payment(id=1, invoice_id=1, amount=50, mode="UPI", transaction_reference=bad,
                                 payment_date=datetime(2026, 1, 2), collected_by=None, reason=None)
            pdf = build_ledger_pdf(c, bad, [inv], {1: [pay]}, {}, (100, 50), [f"Search: “{bad}”"])
            self.assertTrue(pdf.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
