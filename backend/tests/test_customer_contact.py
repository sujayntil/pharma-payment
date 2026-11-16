"""Customer phone numbers: MRs may add, change or clear them for their own
customers; Admins see and edit the alternate number; formats are checked."""

import unittest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.deps import get_current_user, require_admin
from app.routers.customers import router as customers_router
from app.routers.invoices import router as invoices_router
from app.routers.mr import router as mr_router
from app.utils import normalize_phone, same_phone


class PhoneFormatTests(unittest.TestCase):
    def test_mobile_forms_are_stored_as_ten_digits(self):
        for raw in ("9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "919876543210", "098765 43210"):
            self.assertEqual(normalize_phone(raw), "9876543210", raw)

    def test_landlines_keep_area_code_as_typed(self):
        self.assertEqual(normalize_phone("080-12345678"), "080-12345678")
        self.assertEqual(normalize_phone("0821 2345678"), "0821 2345678")
        self.assertEqual(normalize_phone("(080) 1234-5678"), "080 1234-5678")
        self.assertEqual(normalize_phone(" 022  2345 6789 "), "022 2345 6789")

    def test_blank_is_no_number(self):
        self.assertIsNone(normalize_phone(None))
        self.assertIsNone(normalize_phone("   "))

    def test_bad_numbers_are_rejected(self):
        for raw in ("12345", "5876543210", "phone", "+44 2079460000", "98765+43210", "0012345678", "98765432101"):
            with self.assertRaises(ValueError, msg=raw):
                normalize_phone(raw)

    def test_same_phone_ignores_punctuation(self):
        self.assertTrue(same_phone("080-12345678", "08012345678"))
        self.assertFalse(same_phone("9876543210", "9876543211"))
        self.assertFalse(same_phone(None, None))


class CustomerContactApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.admin = models.User(name="Office Admin", employee_code="ADM", role="ADMIN", password_hash="x")
        self.mr = models.User(name="Ravi MR", employee_code="MR1", role="MR", password_hash="x")
        self.other_mr = models.User(name="Sita MR", employee_code="MR2", role="MR", password_hash="x")
        self.db.add_all([self.admin, self.mr, self.other_mr])
        self.db.commit()
        self.mine = models.Customer(name="Tulsi Pharmacy", type="Chemist", mr_id=self.mr.id)
        self.theirs = models.Customer(name="Other Medicals", type="Chemist", phone="9000000001", mr_id=self.other_mr.id)
        self.db.add_all([self.mine, self.theirs])
        self.db.commit()

        app = FastAPI()
        app.include_router(customers_router)
        app.include_router(mr_router)
        app.include_router(invoices_router)

        def db_override():
            yield self.db

        def admin_only():
            if self.current_user.role != "ADMIN":
                raise HTTPException(403, "Admin only")
            return self.current_user

        self.current_user = self.mr
        app.dependency_overrides[get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        app.dependency_overrides[require_admin] = admin_only
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def put_contact(self, customer, **body):
        return self.client.put(f"/mr/customers/{customer.id}/contact", json=body)

    def test_mr_adds_both_numbers_and_they_are_listed_and_searchable(self):
        response = self.put_contact(self.mine, phone="+91 98765 43210", alternate_phone="080-12345678")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"id": self.mine.id, "phone": "9876543210", "alternate_phone": "080-12345678", "whatsapp_on": "main"})
        rows = self.client.get("/mr/customers", params={"limit": 20, "offset": 0}).json()["items"]
        self.assertEqual(rows[0]["alternate_phone"], "080-12345678")
        found = self.client.get("/mr/customers", params={"search": "12345678"}).json()["items"]
        self.assertEqual([row["name"] for row in found], ["Tulsi Pharmacy"])
        ledger = self.client.get(f"/customers/{self.mine.id}/ledger").json()["customer"]
        self.assertEqual((ledger["phone"], ledger["alternate_phone"]), ("9876543210", "080-12345678"))

    def test_mr_changes_numbers_and_the_change_is_audited(self):
        self.put_contact(self.mine, phone="9876543210")
        response = self.put_contact(self.mine, phone="9123456780")
        self.assertEqual(response.status_code, 200, response.text)
        logs = self.db.query(models.AuditLog).filter_by(action="customer_contact_updated").all()
        self.assertEqual(len(logs), 2)
        self.assertEqual((logs[-1].old_value["phone"], logs[-1].new_value["phone"]), ("9876543210", "9123456780"))
        self.assertEqual(logs[-1].user_id, self.mr.id)

    def test_alternate_can_be_cleared_but_main_cannot(self):
        self.put_contact(self.mine, phone="9876543210", alternate_phone="9123456780")
        cleared = self.put_contact(self.mine, alternate_phone="")
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["alternate_phone"])
        removed = self.put_contact(self.mine, phone="")
        self.assertEqual(removed.status_code, 422)
        self.db.refresh(self.mine)
        self.assertEqual(self.mine.phone, "9876543210")

    def test_alternate_needs_main_and_must_differ(self):
        self.assertEqual(self.put_contact(self.mine, alternate_phone="9123456780").status_code, 422)
        self.assertEqual(self.put_contact(self.mine, phone="080-12345678", alternate_phone="08012345678").status_code, 422)

    def test_bad_format_is_rejected_without_saving(self):
        response = self.put_contact(self.mine, phone="12345")
        self.assertEqual(response.status_code, 422)
        self.assertIn("10-digit mobile", response.json()["detail"])
        self.db.refresh(self.mine)
        self.assertIsNone(self.mine.phone)

    def test_mr_cannot_touch_another_mrs_customer(self):
        response = self.put_contact(self.theirs, phone="9876543210")
        self.assertEqual(response.status_code, 404)
        self.db.refresh(self.theirs)
        self.assertEqual(self.theirs.phone, "9000000001")

    def test_admin_cannot_use_the_mr_endpoint(self):
        self.current_user = self.admin
        self.assertEqual(self.put_contact(self.mine, phone="9876543210").status_code, 403)

    def test_admin_sees_and_edits_alternate(self):
        self.put_contact(self.mine, phone="9876543210", alternate_phone="9123456780")
        self.current_user = self.admin
        listed = self.client.get("/customers").json()
        self.assertEqual({row["name"]: row["alternate_phone"] for row in listed}["Tulsi Pharmacy"], "9123456780")
        changed = self.client.put(f"/customers/{self.mine.id}", json={"alternate_phone": "0821 2345678"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(changed.json()["alternate_phone"], "0821 2345678")
        bad = self.client.put(f"/customers/{self.mine.id}", json={"alternate_phone": "123"})
        self.assertEqual(bad.status_code, 422)

    def test_admin_adds_and_changes_main_phone(self):
        self.current_user = self.admin
        added = self.client.put(f"/customers/{self.mine.id}", json={"phone": "+91 98765 43210", "whatsapp_on": "main"})
        self.assertEqual(added.status_code, 200, added.text)
        self.assertEqual(added.json()["phone"], "9876543210")
        self.assertEqual(added.json()["whatsapp_on"], "main")
        self.assertEqual(self.client.put(f"/customers/{self.mine.id}", json={"phone": "12345"}).status_code, 422)
        # An older number that doesn't fit today's rules is kept when unchanged.
        self.mine.phone = "Shop 22-334"; self.db.commit()
        kept = self.client.put(f"/customers/{self.mine.id}", json={"phone": "Shop 22-334", "alternate_phone": "9123456780"})
        self.assertEqual(kept.status_code, 200, kept.text)
        self.assertEqual(kept.json()["phone"], "Shop 22-334")

    def test_admin_adds_a_customer_with_numbers(self):
        self.current_user = self.admin
        made = self.client.post("/customers", json={"name": " Shree Medicals ", "type": "Chemist", "mr_id": self.mr.id,
                                                   "phone": "98765 43210", "alternate_phone": "0821 2345678", "whatsapp_on": "alternate"})
        self.assertEqual(made.status_code, 200, made.text)
        body = made.json()
        self.assertEqual((body["name"], body["phone"], body["alternate_phone"], body["whatsapp_on"], body["mr_id"]),
                         ("Shree Medicals", "9876543210", "0821 2345678", "alternate", self.mr.id))
        self.assertEqual(self.client.post("/customers", json={"name": "shree medicals"}).status_code, 409)
        self.assertEqual(self.client.post("/customers", json={"name": "Bad", "phone": "12"}).status_code, 422)
        self.assertEqual(self.client.post("/customers", json={"name": "Alt only", "alternate_phone": "9876543210"}).status_code, 422)
        self.current_user = self.mr
        self.assertEqual(self.client.post("/customers", json={"name": "Nope"}).status_code, 403)

    def test_main_mobile_is_ticked_for_whatsapp_automatically(self):
        saved = self.put_contact(self.mine, phone="9876543210", alternate_phone="080-12345678").json()
        self.assertEqual(saved["whatsapp_on"], "main")

    def test_landline_main_is_not_ticked_automatically_but_can_be_chosen(self):
        saved = self.put_contact(self.mine, phone="080-12345678").json()
        self.assertIsNone(saved["whatsapp_on"])
        chosen = self.put_contact(self.mine, whatsapp_on="main").json()
        self.assertEqual(chosen["whatsapp_on"], "main")

    def test_mr_moves_whatsapp_to_alternate_and_back_to_none(self):
        self.put_contact(self.mine, phone="9876543210", alternate_phone="9123456780")
        self.assertEqual(self.put_contact(self.mine, whatsapp_on="alternate").json()["whatsapp_on"], "alternate")
        self.assertIsNone(self.put_contact(self.mine, whatsapp_on="").json()["whatsapp_on"])

    def test_whatsapp_must_point_at_a_filled_number(self):
        self.put_contact(self.mine, phone="9876543210")
        self.assertEqual(self.put_contact(self.mine, whatsapp_on="alternate").status_code, 422)
        self.assertEqual(self.put_contact(self.mine, whatsapp_on="telegram").status_code, 422)

    def test_clearing_the_whatsapp_alternate_falls_back_to_main_mobile(self):
        self.put_contact(self.mine, phone="9876543210", alternate_phone="9123456780", whatsapp_on="alternate")
        self.assertEqual(self.put_contact(self.mine, alternate_phone="").json()["whatsapp_on"], "main")

    def test_invoice_list_carries_customer_numbers(self):
        from datetime import date
        self.db.add(models.Invoice(invoice_number="B1", invoice_date=date(2026, 11, 1), customer_id=self.mine.id,
                                   mr_id=self.mr.id, total_amount=100, paid_amount=0, pending_amount=100, status="UNPAID"))
        self.db.commit()
        self.put_contact(self.mine, phone="9876543210", alternate_phone="080-12345678", whatsapp_on="alternate")
        item = self.client.get("/mr/outstanding", params={"limit": 10, "offset": 0}).json()["items"][0]
        self.assertEqual((item["customer_phone"], item["customer_alternate_phone"], item["customer_whatsapp_on"]),
                         ("9876543210", "080-12345678", "alternate"))

    def test_admin_sets_whatsapp_choice(self):
        self.put_contact(self.mine, phone="9876543210", alternate_phone="9123456780")
        self.current_user = self.admin
        changed = self.client.put(f"/customers/{self.mine.id}", json={"whatsapp_on": "alternate"})
        self.assertEqual(changed.json()["whatsapp_on"], "alternate")
        self.assertEqual(self.client.put(f"/customers/{self.mine.id}", json={"whatsapp_on": "bad"}).status_code, 422)

    def test_invoice_panel_carries_customer_numbers(self):
        from datetime import date
        invoice = models.Invoice(invoice_number="H1", invoice_date=date(2026, 11, 1), customer_id=self.mine.id,
                                 mr_id=self.mr.id, total_amount=100, paid_amount=0, pending_amount=100, status="UNPAID")
        self.db.add(invoice)
        self.db.commit()
        self.put_contact(self.mine, phone="9876543210", alternate_phone="080-12345678")
        body = self.client.get(f"/invoices/{invoice.id}/history").json()["invoice"]
        self.assertEqual((body["customer_phone"], body["customer_alternate_phone"], body["customer_whatsapp_on"]),
                         ("9876543210", "080-12345678", "main"))

    def test_customer_screen_lists_pending_oldest_first_then_paid_newest_first(self):
        from datetime import date
        rows = [("P-new", date(2026, 11, 10), 100), ("P-old", date(2026, 9, 1), 50),
                ("S-new", date(2026, 11, 12), 0), ("S-old", date(2026, 8, 1), 0)]
        for number, day, pending in rows:
            self.db.add(models.Invoice(invoice_number=number, invoice_date=day, customer_id=self.mine.id, mr_id=self.mr.id,
                                       total_amount=100, paid_amount=100 - pending, pending_amount=pending,
                                       status="UNPAID" if pending == 100 else ("PARTIAL" if pending else "PAID")))
        self.db.commit()
        listed = self.client.get(f"/customers/{self.mine.id}/ledger", params={"limit": 20, "offset": 0}).json()["invoices"]
        self.assertEqual([row["invoice_number"] for row in listed], ["P-old", "P-new", "S-new", "S-old"])

    def test_admin_customer_list_shows_pending_and_last_invoice_and_sorts_by_pending(self):
        from datetime import date
        for number, day, customer, pending in [("C1", date(2026, 10, 1), self.mine, 300), ("C2", date(2026, 11, 2), self.mine, 0),
                                               ("C3", date(2026, 11, 5), self.theirs, 900)]:
            self.db.add(models.Invoice(invoice_number=number, invoice_date=day, customer_id=customer.id, mr_id=customer.mr_id,
                                       total_amount=1000, paid_amount=1000 - pending, pending_amount=pending,
                                       status="PAID" if not pending else "PARTIAL"))
        self.db.commit()
        self.current_user = self.admin
        rows = {row["name"]: row for row in self.client.get("/customers").json()}
        self.assertEqual((rows["Tulsi Pharmacy"]["pending_amount"], rows["Tulsi Pharmacy"]["latest_invoice_date"]), (300, "2026-11-02"))
        by_pending = self.client.get("/customers", params={"sort": "pending", "limit": 10, "offset": 0}).json()["items"]
        self.assertEqual([row["name"] for row in by_pending], ["Other Medicals", "Tulsi Pharmacy"])
        self.assertEqual(self.client.get("/customers", params={"sort": "bogus"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
