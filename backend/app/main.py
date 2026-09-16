import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (ensures models are registered before create_all)
from .database import Base, SessionLocal, engine
from .routers import admin, auth, customers, invoices, mr, payments

Base.metadata.create_all(bind=engine)

# Optional: create the demo login accounts on startup instead of requiring
# shell access to run seed.py -- useful on hosts like Render's free tier
# that don't offer a shell. Off by default; set SEED_ON_STARTUP=true to
# enable it. Safe to leave on permanently -- it only creates users that
# don't already exist.
if os.getenv("SEED_ON_STARTUP", "").lower() == "true":
    from .seed_data import ensure_demo_users

    _seed_db = SessionLocal()
    try:
        ensure_demo_users(_seed_db)
    finally:
        _seed_db.close()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Pharma Sales & Collection Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(customers.router)
app.include_router(admin.router)
app.include_router(mr.router)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
