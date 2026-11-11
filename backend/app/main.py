import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
# Disabled: uploads are no longer a public folder (see routers/uploads.py).
# from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (ensures models are registered before create_all)
from .database import Base, SessionLocal, engine
from .overdue import process_due_overdue_reminders
from .schema_upgrade import ensure_additive_columns
from .routers import admin, auth, customers, imports, invoices, mr, notifications, payments, uploads

log = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)
ensure_additive_columns(engine)

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


async def overdue_reminder_scheduler():
    while True:
        try:
            await asyncio.to_thread(process_due_overdue_reminders)
        except Exception:
            log.exception("Overdue reminder scheduler failed")
        await asyncio.sleep(6 * 60 * 60)


@asynccontextmanager
async def lifespan(_app):
    # Outstanding reminders remain visible in the dashboard, but their push
    # scheduler is paused. Payment notifications are sent by the payments router.
    yield


# The interactive API pages (/docs, /redoc) and the endpoint list
# (/openapi.json) are off unless ENABLE_API_DOCS=true, so the live server does
# not publish a map of the API. Turn them on locally when developing.
_api_docs = os.getenv("ENABLE_API_DOCS", "").lower() == "true"

app = FastAPI(
    title="Pharma Sales & Collection Management System",
    lifespan=lifespan,
    docs_url="/docs" if _api_docs else None,
    redoc_url="/redoc" if _api_docs else None,
    openapi_url="/openapi.json" if _api_docs else None,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Standard browser protections on every response. They do not change
    what any endpoint returns."""
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    if not request.url.path.startswith(("/docs", "/redoc")):
        # This server only returns data and files, never web pages.
        headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https":
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

# Which websites may call this API from a browser.
#   CORS_ORIGINS set   -> only those addresses (comma-separated), e.g.
#                         CORS_ORIGINS=https://app.example.com,https://www.example.com
#   CORS_ORIGINS unset -> any address may call (as before), but the server no
#                         longer tells browsers to send credentials for them.
# Sign-in uses a bearer token in the Authorization header, not cookies, so
# nothing in the app relies on credentialed cross-site requests.
_cors_origins = [origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the file name of Excel exports.
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(notifications.router)
app.include_router(customers.router)
app.include_router(admin.router)
app.include_router(imports.router)
app.include_router(mr.router)
# Uploaded invoice photos now need a login (Admin: any file; MR: own invoices).
app.include_router(uploads.router)

# Disabled: public folder -- anyone with a link could open a file. Re-enable if needed.
# app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
