# Pharma Sales & Collection Management System

A two-module system for pharma field sales:

- **MR app** — upload a photo of an invoice, AI reads it and pre-fills a review
  screen, MR confirms, and can later log payments against outstanding invoices.
- **Admin app** — sales/collection totals, MR-wise performance, per-customer
  ledgers, and large-outstanding alerts.

Stack: **FastAPI** backend, **PostgreSQL** database, a plain **HTML/CSS/JS**
frontend (no build step, no framework).

```
pharma-app/
├── backend/          FastAPI app (routers, models, AI extraction)
├── frontend/          index.html (login), mr.html, admin.html + css/js
└── docker-compose.yml Postgres + backend
```

## 1. Run it

You need Docker installed. From the project root:

```bash
docker compose up --build
```

This starts:
- **Postgres** on `localhost:5432` (db: `pharma_db`, user/pass: `pharma`/`pharma`)
- **Backend API** on `http://localhost:8000` (interactive docs at `/docs`)

The first time, create the demo login accounts:

```bash
docker compose exec backend python seed.py
```

This prints out:
```
Admin -> employee code: ADMIN01 / password: admin123
MR    -> employee code: MR001   / password: mr123
MR    -> employee code: MR002   / password: mr123
```

**Change these passwords** (via the Admin > Users tab, or directly) before
using this anywhere real.

## 2. Open the frontend

The frontend is static files — no server needed. Just open
`frontend/index.html` directly in a browser, or serve the folder with
anything simple, e.g.:

```bash
cd frontend
python3 -m http.server 5500
```

then visit `http://localhost:5500`. Sign in with one of the seeded logins
above. Admins land on the Admin app, MRs land on the MR app.

If your backend isn't at `http://localhost:8000` (e.g. you deployed it
somewhere), edit the one line at the top of `frontend/js/api.js`:

```js
const API_BASE = window.API_BASE || "http://localhost:8000";
```

## 3. Turn on real AI invoice extraction

Out of the box, the "Upload Invoice" flow works but the AI step returns an
empty draft with a note to fill it in manually — this keeps the whole app
usable with zero config.

To have AI actually read the invoice photo:

1. Get an API key from [aistudio.google.com](https://aistudio.google.com/app/apikey).
2. Put it in `backend/.env`:
   ```
   GEMINI_API_KEY=AIza...
   ```
3. Restart the backend: `docker compose restart backend`

Now every upload sends the photo to Gemini's vision model, which returns
invoice number, date, customer, amount, payment status, and a confidence
score per field. Low-confidence fields (< 60%) are highlighted in the MR's
review screen so nothing gets auto-trusted blindly — the MR still confirms
before it saves.

Extraction lives in one place, `backend/app/ai/extractor.py`, if you'd
rather wire up a different OCR/vision provider (Anthropic, Textract, Google
Vision, an in-house model, etc.) — the function signature and return shape
are documented at the top of that file.

## 4. How the data model works

- **Invoice status** (`PAID` / `PARTIAL` / `UNPAID`) and **pending amount**
  are always derived as `pending = total - paid`, never entered directly —
  this is enforced server-side in `app/utils.py::compute_status`.
- **Payments** are their own table, not just an overwritten `paid_amount`
  column, so you get a full collection history per invoice (who collected
  what, when, by which mode, with what reference number).
- **Customers** are looked up by name and auto-created the first time an MR
  invoices them — no separate "add customer first" step is required, though
  Admin can also add them manually from the Customers tab.
- Uploaded invoice photos are saved under `backend/uploads/` and served at
  `/uploads/<filename>` so they stay linked to the invoice record.

## 6. Deploying it for free

Free hosting tiers move fast and change often — this is what's actually
free and durable as of when this was written. If something below has
changed by the time you read it, the shape of the setup (external Postgres
+ a container host + a static host) stays the same even if the specific
providers don't.

**Database — [Neon](https://neon.tech):** a genuinely permanent free
Postgres tier (not a trial), no credit card. Render's own free Postgres
self-destructs after 30 days, which is why this uses Neon instead.

1. Sign up, create a project, and copy the connection string it gives you
   (it already includes `?sslmode=require`).

**Backend — [Render](https://render.com), Web Service:**

1. Push this project to a GitHub repo.
2. New → Web Service → connect the repo → set **Root Directory** to
   `backend` → environment **Docker** (it'll pick up the existing
   `Dockerfile`).
3. Add environment variables:
   - `DATABASE_URL` — the Neon connection string from above
   - `SECRET_KEY` — any long random string
   - `SEED_ON_STARTUP` — `true` (creates the demo logins automatically;
     Render's free tier has no shell to run `seed.py` by hand — turn this
     back to `false` once you've logged in and changed the passwords)
   - `GEMINI_API_KEY` / `GEMINI_MODEL` — optional, for real AI extraction
4. Deploy. Render gives you a URL like `https://your-app.onrender.com`.

**Frontend — Render, Static Site:**

1. New → Static Site → same repo → **Root Directory** `frontend`, no
   build command, publish directory `.`.
2. Before deploying, edit `frontend/js/api.js` and change `API_BASE` to
   your backend's Render URL from the step above.
3. Deploy. This is the link you actually give people to use the app.

**What to expect on the free tier:**
- The backend sleeps after 15 minutes idle and takes 30-50 seconds to wake
  on the next request — fine for an internal tool used a few times a day,
  annoying if someone's waiting on it.
- The static frontend doesn't sleep.
- **The backend's filesystem is ephemeral on Render's free tier** — files
  in `backend/uploads/` (the invoice photos) are wiped on every restart or
  redeploy. The database data itself is safe since it lives on Neon, not
  on Render. If you need uploaded photos to persist long-term, that needs
  either a paid Render disk or swapping the upload storage to something
  like Cloudflare R2 (which also has a free tier) — say so if you want that
  wired in.

## 7. What's deliberately left as a next step

This covers the core MR → Invoice → Customer → Payment → Outstanding →
Admin loop end to end. Natural next additions, following the same patterns
already in the code:

- **Invoice line items** — the `InvoiceItem` model and `InvoiceCreate.items`
  field already exist; the review screen just doesn't collect them yet
  (most invoices only need header-level totals for collection tracking).
- **Products table** — modeled (`brand_name`, `product_name`, `mrp`,
  `gst_rate`) but not yet wired into the UI; useful once you want
  product-wise sales analysis.
- **Audit log** — the `AuditLog` table is ready for tracking who changed
  what (e.g. an admin correcting an AI-extracted amount) but nothing
  writes to it yet.
- **Alembic migrations** — the app currently calls
  `Base.metadata.create_all()` on startup, which is fine for getting going
  but won't handle schema changes on an existing database gracefully.
  Worth switching to Alembic before this holds real production data.
