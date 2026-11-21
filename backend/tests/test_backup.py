"""Admin backups: Full file restores exactly; Excel has readable sheets; guards."""
import gzip
import json
import unittest
from datetime import date, datetime
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app import models
from app.backup import SKIP_TABLES, backup_tables, excel_backup, full_backup, restore
from app.database import Base


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine)()


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.engine, self.db = _db()
        admin = models.User(name="Sujay", employee_code="A1", role="ADMIN", password_hash="hash-a")
        mr = models.User(name="Rahul", employee_code="M1", role="MR", password_hash="hash-m")
        self.db.add_all([admin, mr]); self.db.flush()
        cust = models.Customer(name="=Sneaky Name", type="Doctor", area="Pune", mr_id=mr.id, created_at=datetime(2026, 9, 1, 5, 0))
        self.db.add(cust); self.db.flush()
        inv = models.Invoice(invoice_number="INV-1", invoice_date=date(2026, 10, 2), customer_id=cust.id, mr_id=mr.id,
                             total_amount=1000.5, paid_amount=400, pending_amount=600.5, status="PARTIAL", ai_confidence={"x": 0.9})
        self.db.add(inv); self.db.flush()
        self.db.add(models.InvoiceItem(invoice_id=inv.id, product_name="Paracetamol", quantity=10, rate=100.05, amount=1000.5))
        pay = models.Payment(invoice_id=inv.id, amount=400, mode="UPI", payment_date=datetime(2026, 10, 3, 6, 30), collected_by=mr.id, recorded_by=mr.id)
        self.db.add(pay); self.db.flush()
        self.db.add(models.AuditLog(action="invoice_created", user_id=admin.id, new_value={"invoice_number": "INV-1"}))
        self.db.add(models.LoginAttempt(key="x", failures=1))
        self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_full_backup_restores_every_table_exactly(self):
        content, counts = full_backup(self.db)
        data = json.loads(gzip.decompress(content))
        self.assertNotIn("login_attempts", data["tables"])
        self.assertEqual(counts["invoices"], 1)
        engine2, db2 = _db()
        with engine2.begin() as conn:
            done = restore(conn, data)
        self.assertEqual(done["payments"], 1)
        for table in backup_tables():
            before = self.db.execute(select(table)).all()
            after = db2.execute(select(table)).all()
            self.assertEqual(sorted(map(tuple, before), key=repr), sorted(map(tuple, after), key=repr), table.name)
        self.assertEqual(db2.query(models.User).filter_by(employee_code="M1").one().password_hash, "hash-m")
        self.assertTrue(all(t.name not in SKIP_TABLES for t in backup_tables()))
        db2.close(); engine2.dispose()

    def test_restore_refuses_a_database_with_data(self):
        content, _ = full_backup(self.db)
        with self.engine.begin() as conn, self.assertRaises(ValueError):
            restore(conn, json.loads(gzip.decompress(content)))
        self.assertEqual(self.db.query(func.count(models.Invoice.id)).scalar(), 1)

    def test_excel_has_readable_sheets(self):
        content, counts = excel_backup(self.db, date(2026, 11, 21))
        wb = load_workbook(BytesIO(content))
        self.assertEqual(wb.sheetnames, ["About", "Customers", "Invoices", "Invoice items", "Payments", "Products", "Team", "MR targets", "Audit log"])
        self.assertEqual(wb["Customers"]["A2"].value, "'=Sneaky Name")  # never runs as a formula
        self.assertEqual(wb["Customers"]["I2"].value, "Rahul")
        self.assertEqual(wb["Invoices"]["C2"].value, "'=Sneaky Name")
        self.assertEqual(wb["Payments"]["A2"].value, datetime(2026, 10, 3, 12, 0))  # India time
        self.assertEqual(wb["Payments"]["D2"].value, 400)
        self.assertNotIn("Password", [c.value for c in wb["Team"][1]])
        self.assertEqual(counts["Payments"], 1)


class BackupRouteTests(unittest.TestCase):
    def test_download_is_audited_and_guarded(self):
        from fastapi import HTTPException
        from app.routers import backups
        engine, db = _db()
        admin = models.User(name="Sujay", employee_code="A1", role="ADMIN", password_hash="h")
        db.add(admin); db.commit()
        backups.backup_excel(db=db, user=admin)
        with self.assertRaises(HTTPException) as caught:
            backups.backup_excel(db=db, user=admin)
        self.assertEqual(caught.exception.status_code, 429)
        backups.backup_full(db=db, user=admin)  # the other kind still works
        status = backups.backup_status(db=db, user=admin)
        self.assertEqual(status["last"]["kind"], "Full")
        self.assertEqual(status["last"]["by"], "Sujay")
        self.assertEqual(db.query(models.AuditLog).filter_by(action="backup_downloaded").count(), 2)
        db.close(); engine.dispose()


if __name__ == "__main__":
    unittest.main()
