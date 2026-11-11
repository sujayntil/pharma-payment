import unittest
from datetime import timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import login_guard, models
from app.database import Base, get_db
from app.routers import admin, auth, customers, mr
from app.security import hash_password


class SecurityHardeningTests(unittest.TestCase):
    """Login attempt limit, MR-scoped customer list, and password length."""

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        with self.Session() as db:
            db.add_all([
                models.User(name="Admin", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
                models.User(name="Neha", employee_code="MR002", role="MR", password_hash=hash_password("neha-pass")),
            ])
            db.commit()
            rahul = db.query(models.User).filter_by(employee_code="MR001").one()
            neha = db.query(models.User).filter_by(employee_code="MR002").one()
            db.add_all([
                models.Customer(name="Tulsi Pharmacy", phone="111", mr_id=rahul.id),
                models.Customer(name="Shree Distributors", phone="222", mr_id=neha.id),
                models.Customer(name="Walk-in"),
            ])
            db.commit()
            self.neha_id = neha.id

        app = FastAPI()
        for router in (auth, customers, admin, mr):
            app.include_router(router.router)

        def db_override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def login(self, code, password, **kwargs):
        return self.client.post("/auth/login", data={"username": code, "password": password}, **kwargs)

    def auth(self, code, password):
        return {"Authorization": f"Bearer {self.login(code, password).json()['access_token']}"}

    # ---- login attempt limit ----

    def test_wrong_passwords_lock_the_account_then_it_recovers(self):
        for _ in range(login_guard.MAX_FAILURES_PER_ACCOUNT):
            self.assertEqual(self.login("MR001", "wrong").status_code, 401)
        locked = self.login("MR001", "rahul-pass")  # even the right password waits out the lock
        self.assertEqual(locked.status_code, 429)
        self.assertIn("Too many failed sign-in attempts", locked.json()["detail"])
        self.assertIn("retry-after", locked.headers)
        # Employee codes are matched case-insensitively for the limit.
        self.assertEqual(self.login("mr001", "wrong").status_code, 429)
        # Other accounts are not affected.
        self.assertEqual(self.login("MR002", "neha-pass").status_code, 200)
        # After the lock expires the account works again.
        with self.Session() as db:
            row = db.query(models.LoginAttempt).filter_by(key="user:mr001").one()
            row.locked_until = login_guard._now() - timedelta(seconds=1)
            row.window_started_at = login_guard._now() - login_guard.WINDOW - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.login("MR001", "rahul-pass").status_code, 200)

    def test_a_correct_login_clears_earlier_failures(self):
        for _ in range(login_guard.MAX_FAILURES_PER_ACCOUNT - 1):
            self.assertEqual(self.login("MR001", "wrong").status_code, 401)
        self.assertEqual(self.login("MR001", "rahul-pass").status_code, 200)
        for _ in range(login_guard.MAX_FAILURES_PER_ACCOUNT - 1):
            self.assertEqual(self.login("MR001", "wrong").status_code, 401)
        self.assertEqual(self.login("MR001", "rahul-pass").status_code, 200)

    def test_many_failures_from_one_address_are_blocked(self):
        headers = {"X-Forwarded-For": "203.0.113.9"}
        for i in range(login_guard.MAX_FAILURES_PER_ADDRESS):
            self.assertEqual(self.login(f"GUESS{i}", "x", headers=headers).status_code, 401)
        self.assertEqual(self.login("MR001", "rahul-pass", headers=headers).status_code, 429)
        self.assertEqual(self.login("MR001", "rahul-pass", headers={"X-Forwarded-For": "198.51.100.7"}).status_code, 200)

    # ---- customer list ----

    def test_mr_only_lists_own_customers_and_admin_lists_all(self):
        rahul = self.auth("MR001", "rahul-pass")
        mine = self.client.get("/customers", params={"limit": 50, "offset": 0}, headers=rahul).json()
        self.assertEqual([c["name"] for c in mine["items"]], ["Tulsi Pharmacy"])
        # Asking for another MR's customers, or searching, does not widen it.
        other = self.client.get("/customers", params={"mr_id": self.neha_id, "limit": 50}, headers=rahul).json()
        self.assertEqual([c["name"] for c in other["items"]], ["Tulsi Pharmacy"])
        searched = self.client.get("/customers", params={"search": "Shree"}, headers=rahul).json()
        self.assertEqual(searched["items"], [])
        self.assertEqual([c["name"] for c in self.client.get("/customers", headers=rahul).json()], ["Tulsi Pharmacy"])
        # The MR's own screen is unchanged.
        self.assertEqual([c["name"] for c in self.client.get("/mr/customers", headers=rahul).json()], ["Tulsi Pharmacy"])

        admin_headers = self.auth("ADMIN01", "admin-pass")
        everyone = self.client.get("/customers", params={"limit": 50, "offset": 0}, headers=admin_headers).json()
        self.assertEqual(everyone["total"], 3)
        by_mr = self.client.get("/customers", params={"mr_id": self.neha_id, "limit": 50}, headers=admin_headers).json()
        self.assertEqual([c["name"] for c in by_mr["items"]], ["Shree Distributors"])
        self.assertEqual(self.client.get("/customers").status_code, 401)

    # ---- password length ----

    def test_new_and_reset_passwords_need_eight_characters(self):
        headers = self.auth("ADMIN01", "admin-pass")
        new_user = {"name": "Temp", "employee_code": "MR009", "role": "MR", "password": "short"}
        short = self.client.post("/admin/users", json=new_user, headers=headers)
        self.assertEqual((short.status_code, short.json()["detail"]), (400, "Password must be at least 8 characters"))
        created = self.client.post("/admin/users", json={**new_user, "password": "long-enough"}, headers=headers)
        self.assertEqual(created.status_code, 200)
        user_id = created.json()["id"]
        self.assertEqual(self.client.put(f"/admin/users/{user_id}", json={"password": "1234567"}, headers=headers).status_code, 400)
        # Editing without a password still works, and keeps the old one.
        self.assertEqual(self.client.put(f"/admin/users/{user_id}", json={"name": "Temp 2"}, headers=headers).status_code, 200)
        self.assertEqual(self.login("MR009", "long-enough").status_code, 200)
        self.assertEqual(self.client.put(f"/admin/users/{user_id}", json={"password": "another-good-1"}, headers=headers).status_code, 200)
        self.assertEqual(self.login("MR009", "another-good-1").status_code, 200)
        # Existing short passwords (set before this rule) still sign in.
        with self.Session() as db:
            db.query(models.User).filter_by(employee_code="MR002").update({"password_hash": hash_password("mr123")})
            db.commit()
        self.assertEqual(self.login("MR002", "mr123").status_code, 200)


if __name__ == "__main__":
    unittest.main()
