"""Margin calculator: Admin only, hand-typed products and schemes, real
customers (name and type only) linked to one scheme per product."""
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.routers import auth, margin
from app.security import hash_password


class MarginCalculatorTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        with self.Session() as db:
            db.add_all([models.User(name="Priya", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                        models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
                        models.Customer(name="Sai Pharma", type="Distributor", phone="9999999999", address="Pune"),
                        models.Customer(name="Dr Mehta", type="Doctor")])
            db.commit()
        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(margin.router)

        def db_override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)
        self.admin = self._login("ADMIN01", "admin-pass")
        self.mr = self._login("MR001", "rahul-pass")

    def tearDown(self):
        self.client.close()
        Base.metadata.drop_all(self.engine)

    def _login(self, code, password):
        token = self.client.post("/auth/login", data={"username": code, "password": password}).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def _ok(self, method, path, **kw):
        r = self.client.request(method, path, headers=self.admin, **kw)
        self.assertLess(r.status_code, 300, r.text)
        return r.json() if r.content else None

    def test_mr_and_anonymous_are_refused(self):
        for headers in (self.mr, {}):
            self.assertIn(self.client.get("/admin/margin", headers=headers).status_code, (401, 403))
            self.assertIn(self.client.get("/admin/margin/customers", headers=headers).status_code, (401, 403))
            self.assertIn(self.client.post("/admin/margin/products", json={}, headers=headers).status_code, (401, 403))

    def test_starts_empty(self):
        self.assertEqual(self._ok("GET", "/admin/margin"), {"products": [], "links": []})

    def test_customers_are_name_and_type_only(self):
        rows = self._ok("GET", "/admin/margin/customers")
        self.assertEqual([r["name"] for r in rows], ["Dr Mehta", "Sai Pharma"])
        self.assertEqual(set(rows[0]), {"id", "name", "type"})

    def test_product_scheme_and_link_flow(self):
        p = self._ok("POST", "/admin/margin/products", json={})
        # Nothing is pre-filled: every value starts empty.
        self.assertEqual({k: p[k] for k in ("name", "mrp", "gst", "retailer_margin", "stockist_margin", "cost", "purchase_gst", "batch")},
                         {"name": "", "mrp": None, "gst": None, "retailer_margin": None, "stockist_margin": None, "cost": None, "purchase_gst": None, "batch": None})
        self.assertEqual(len(p["schemes"]), 1)
        self.assertEqual({k: p["schemes"][0][k] for k in ("name", "sell_at", "discount", "buy", "free")},
                         {"name": "", "sell_at": None, "discount": None, "buy": None, "free": None})
        p = self._ok("PATCH", f"/admin/margin/products/{p['id']}", json={"name": " Product 1 ", "mrp": 199, "cost": 26.845})
        self.assertEqual((p["name"], p["mrp"], p["cost"], p["gst"]), ("Product 1", 199, 26.845, None))
        # An emptied box clears the value.
        p = self._ok("PATCH", f"/admin/margin/products/{p['id']}", json={"cost": None})
        self.assertIsNone(p["cost"])
        s1 = p["schemes"][0]
        s2 = self._ok("POST", f"/admin/margin/products/{p['id']}/schemes", json={"name": "Rate + 10+1", "sell_at": "mrp", "discount": 80, "buy": 10, "free": 1})
        self.assertEqual((s2["sell_at"], s2["discount"], s2["buy"], s2["free"]), ("mrp", 80, 10, 1))
        self.assertIsNone(self._ok("POST", f"/admin/margin/products/{p['id']}/schemes", json={})["discount"])
        self._ok("PATCH", f"/admin/margin/schemes/{s2['id']}", json={"sell_at": "pts", "discount": 72.22})
        with self.Session() as db:
            cust = db.query(models.Customer).filter_by(name="Sai Pharma").one().id
        self._ok("PUT", "/admin/margin/links", json={"customer_id": cust, "product_id": p["id"], "scheme_id": s2["id"]})
        self._ok("PUT", "/admin/margin/links", json={"customer_id": cust, "product_id": p["id"], "scheme_id": s1["id"]})
        data = self._ok("GET", "/admin/margin")
        self.assertEqual(data["links"], [{"customer_id": cust, "product_id": p["id"], "scheme_id": s1["id"]}])
        # Deleting the linked scheme puts the customer back to "not supplied".
        self._ok("DELETE", f"/admin/margin/schemes/{s1['id']}")
        self.assertEqual(self._ok("GET", "/admin/margin")["links"], [])
        for extra in self._ok("GET", "/admin/margin")["products"][0]["schemes"][1:]:
            self._ok("DELETE", f"/admin/margin/schemes/{extra['id']}")
        # The last scheme can't be deleted.
        self.assertEqual(self.client.delete(f"/admin/margin/schemes/{s2['id']}", headers=self.admin).status_code, 400)
        # Clearing a link, then deleting the product.
        self._ok("PUT", "/admin/margin/links", json={"customer_id": cust, "product_id": p["id"], "scheme_id": s2["id"]})
        self._ok("PUT", "/admin/margin/links", json={"customer_id": cust, "product_id": p["id"], "scheme_id": None})
        self._ok("PUT", "/admin/margin/links", json={"customer_id": cust, "product_id": p["id"], "scheme_id": s2["id"]})
        self._ok("DELETE", f"/admin/margin/products/{p['id']}")
        self.assertEqual(self._ok("GET", "/admin/margin"), {"products": [], "links": []})
        with self.Session() as db:
            actions = {a.action for a in db.query(models.AuditLog).all()}
        self.assertTrue({"margin_scheme_deleted", "margin_product_deleted"} <= actions)

    def test_bad_input_is_refused(self):
        p = self._ok("POST", "/admin/margin/products", json={})
        other = self._ok("POST", "/admin/margin/products", json={})
        for body in ({"gst": 150}, {"mrp": -1}, {"name": "x" * 81}, {"unknown": 1}):
            self.assertEqual(self.client.patch(f"/admin/margin/products/{p['id']}", json=body, headers=self.admin).status_code, 422, body)
        sid = p["schemes"][0]["id"]
        for body in ({"sell_at": "abc"}, {"discount": 101}, {"free": -1}):
            self.assertEqual(self.client.patch(f"/admin/margin/schemes/{sid}", json=body, headers=self.admin).status_code, 422, body)
        with self.Session() as db:
            cust = db.query(models.Customer).first().id
        # A scheme from another product is refused; unknown ids are 404.
        r = self.client.put("/admin/margin/links", json={"customer_id": cust, "product_id": other["id"], "scheme_id": sid}, headers=self.admin)
        self.assertEqual(r.status_code, 400)
        r = self.client.put("/admin/margin/links", json={"customer_id": 9999, "product_id": p["id"], "scheme_id": sid}, headers=self.admin)
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
