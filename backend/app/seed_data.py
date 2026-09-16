"""Creates the demo login accounts if they don't already exist. Shared by
seed.py (run manually) and, optionally, app.main on startup when
SEED_ON_STARTUP=true -- useful on hosts with no shell access, like Render's
free tier."""

from sqlalchemy.orm import Session

from . import models
from .security import hash_password

DEMO_USERS = [
    ("ADMIN01", "Admin", models.RoleEnum.ADMIN.value, "admin123"),
    ("MR001", "Rahul", models.RoleEnum.MR.value, "mr123"),
    ("MR002", "Neha", models.RoleEnum.MR.value, "mr123"),
]


def ensure_demo_users(db: Session) -> list[str]:
    """Creates any missing demo users. Returns the employee codes actually
    created (an empty list means everyone already existed)."""
    created = []
    for code, name, role, password in DEMO_USERS:
        existing = db.query(models.User).filter(models.User.employee_code == code).first()
        if existing:
            continue
        db.add(
            models.User(
                name=name,
                employee_code=code,
                role=role,
                password_hash=hash_password(password),
            )
        )
        db.commit()
        created.append(code)
    return created
