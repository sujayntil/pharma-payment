"""Run once to create login accounts:

    docker compose exec backend python seed.py

Creates one Admin and two MR logins if they don't already exist. Safe to
re-run -- it skips anyone who already exists.
"""

from app.database import Base, SessionLocal, engine
from app.seed_data import DEMO_USERS, ensure_demo_users

Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("Seeding users...")
created = ensure_demo_users(db)
for code, name, role, _ in DEMO_USERS:
    print(f"  {code} ({role}) {'created' if code in created else 'already existed, skipped'}")

print()
print("Login credentials:")
print("  Admin -> employee code: ADMIN01 / password: admin123")
print("  MR    -> employee code: MR001   / password: mr123")
print("  MR    -> employee code: MR002   / password: mr123")
print()
print("Change these passwords before using this in production.")

db.close()
