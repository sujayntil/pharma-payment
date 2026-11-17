"""King / Queen title on users: defaults to King, Admin can set Queen."""
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.routers.admin import create_user, update_user


class UserTitleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.admin = models.User(name="Admin", employee_code="A1", role="ADMIN", password_hash="x")
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_title_defaults_to_king_and_can_be_queen(self):
        user = create_user(schemas.UserCreate(name="Rahul", employee_code="M1", role="MR", password="secret123"), self.db, self.admin)
        self.assertEqual(schemas.UserOut.model_validate(user).title, "KING")
        queen = create_user(schemas.UserCreate(name="Priya", employee_code="M2", role="MR", password="secret123", title="queen"), self.db, self.admin)
        self.assertEqual(queen.title, "QUEEN")
        updated = update_user(user.id, schemas.UserUpdate(title="QUEEN"), self.db, self.admin)
        self.assertEqual(updated.title, "QUEEN")
        self.assertEqual(schemas.UserOut.model_validate(self.admin).title, "KING")  # never set


if __name__ == "__main__":
    unittest.main()
