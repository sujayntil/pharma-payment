""""Keep me signed in": 30-day renewing session vs 12-hour session, and that
log out / password reset still end it."""
import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.routers import admin, auth
from app.security import create_access_token, decode_access_token, hash_password


class KeepSignedInTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        with self.Session() as db:
            db.add_all([
                models.User(name="Admin", employee_code="ADMIN01", role="ADMIN", password_hash=hash_password("admin-pass")),
                models.User(name="Rahul", employee_code="MR001", role="MR", password_hash=hash_password("rahul-pass")),
            ])
            db.commit()
            self.rahul_id = db.query(models.User).filter_by(employee_code="MR001").one().id
        app = FastAPI()
        app.include_router(auth.router); app.include_router(admin.router)

        def db_override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close(); Base.metadata.drop_all(self.engine); self.engine.dispose()

    def login(self, remember=None, code="MR001", password="rahul-pass"):
        data = {"username": code, "password": password}
        if remember is not None:
            data["remember"] = "true" if remember else "false"
        response = self.client.post("/auth/login", data=data)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    @staticmethod
    def hours_left(token):
        payload = decode_access_token(token)
        return (payload["exp"] - datetime.now(timezone.utc).timestamp()) / 3600

    def h(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_keep_signed_in_lasts_30_days_and_renews(self):
        token = self.login(remember=True)
        self.assertAlmostEqual(self.hours_left(token), 30 * 24, delta=1)
        renewed = self.client.post("/auth/refresh", headers=self.h(token))
        self.assertEqual(renewed.status_code, 200)
        new = renewed.json()["access_token"]
        self.assertAlmostEqual(self.hours_left(new), 30 * 24, delta=1)
        self.assertEqual(self.client.get("/auth/me", headers=self.h(new)).status_code, 200)

    def test_not_kept_is_12_hours_and_not_renewed(self):
        token = self.login(remember=False)
        self.assertAlmostEqual(self.hours_left(token), 12, delta=0.1)
        self.assertEqual(self.client.post("/auth/refresh", headers=self.h(token)).status_code, 400)
        self.assertEqual(self.client.get("/auth/me", headers=self.h(token)).status_code, 200)

    def test_older_app_without_the_option_gets_12_hours(self):
        self.assertAlmostEqual(self.hours_left(self.login()), 12, delta=0.1)

    def test_sessions_from_before_the_option_can_be_renewed(self):
        legacy = create_access_token({"sub": str(self.rahul_id), "role": "MR"})  # no "rmb"
        renewed = self.client.post("/auth/refresh", headers=self.h(legacy))
        self.assertEqual(renewed.status_code, 200)
        self.assertAlmostEqual(self.hours_left(renewed.json()["access_token"]), 30 * 24, delta=1)

    def test_log_out_ends_a_kept_session_and_it_cannot_renew(self):
        token = self.login(remember=True)
        self.assertEqual(self.client.post("/auth/logout", headers=self.h(token)).status_code, 204)
        self.assertEqual(self.client.post("/auth/refresh", headers=self.h(token)).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=self.h(token)).status_code, 401)

    def test_password_reset_ends_kept_sessions_and_renewed_ones(self):
        admin_token = self.login(remember=True, code="ADMIN01", password="admin-pass")
        token = self.login(remember=True)
        renewed = self.client.post("/auth/refresh", headers=self.h(token)).json()["access_token"]
        with self.Session() as db:  # tokens above were issued clearly before the reset
            db.query(models.User).filter_by(id=self.rahul_id).update({"tokens_valid_after": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=2)})
            db.commit()
        for t in (token, renewed):
            self.assertEqual(self.client.get("/auth/me", headers=self.h(t)).status_code, 401)
            self.assertEqual(self.client.post("/auth/refresh", headers=self.h(t)).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=self.h(admin_token)).status_code, 200)

    def test_wrong_password_still_refused(self):
        response = self.client.post("/auth/login", data={"username": "MR001", "password": "nope", "remember": "true"})
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
