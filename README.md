# EarnScore — Simplified UI + PostgreSQL Security

An updated version of your **EarnScore Refined** starter, retaining the animated Next.js interface, three protected roles (worker, lender, admin), JWT sessions, and demo simulator. This update introduces a **PostgreSQL schema, Alembic migrations, row-level security, scoped lender authorization, and a working worker consent screen**.

> **Hackathon prototype.** Do not submit real financial documents or use it to make real credit decisions. The fictional assessment simulator remains fictional.


## What's new in the simplified UI

This build keeps the existing PostgreSQL schema, backend authentication, row-level security, consent API, three user roles, and demo assessments. Its **navigation and frontend have been simplified**:

- **Public homepage:** fewer sections, clearly labeled demo score, clear calls to action.
- **Worker:** Home → Preview a statement → Try EarnScore → Privacy & consent → Account.
- **Lender:** Home → Practice a review → Account.
- **Admin:** Home → Users & roles → Account.
- **Statement preview (`/worker/uploads`):** choose a CSV or try the included sample, inspect income/outflows and duplicate/transfer warnings, filter records, clear the preview. **Client-side only: no upload or database saving.**
- **Assessment sandbox:** collapsible assumptions and reset control.
- **Login / registration:** simpler, mobile-friendly forms and fewer distracting elements.

Unfinished routes remain as honest planned-feature pages, rather than prominent navigation items. See [UX_CHANGES.md](UX_CHANGES.md).

### Try the UI

Run PostgreSQL, the API and the frontend using the instructions below. Open `http://localhost:3000`. Without authentication, open `/demo` to explore the scoring simulation. With a worker account, open `/worker/uploads` and choose **Use sample data** to test the CSV preview. The files are not transmitted to the backend.

## Project structure

```text
earnscore-ui-clean/
├── compose.yaml                         # Local PostgreSQL
├── .env.example                         # Local DB role credentials
├── database/init/01-create-roles.sh     # Local app + processor DB accounts
├── DATABASE_DESIGN.md                   # ER design, permissions and setup
├── backend/
│   ├── alembic.ini
│   ├── migrations/versions/
│   │   ├── 0001_baseline_schema.py
│   │   └── 0002_access_policies.py
│   ├── app/models/entities.py          # ORM models
│   ├── app/core/access.py              # Application access checks
│   ├── app/core/database.py            # Scoped PostgreSQL RLS context
│   ├── app/api/routes.py               # Consent and grant endpoints
│   └── tests/                           # Authorization and optional PG RLS tests
└── frontend/
    ├── src/app/worker/consent/          # Live consent preferences UI
    └── src/app/api/worker/consents/     # Same-origin protected BFF routes
```

## Start PostgreSQL

```bash
cp .env.example .env
# Replace CHANGE_ME_* passwords in root .env with independent random strings.
# For URL compatibility, use letters/numbers for local development passwords.
docker compose up -d postgres
```

Docker Compose binds PostgreSQL **only to localhost:5432**. The Docker database init script creates the runtime app and future processor database roles on the first initialization of the data volume. Keep the data volume; `docker compose down -v` **deletes** it.

## Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

In `backend/.env`, replace `CHANGE_ME_APP` with the same app password as root `.env`, and replace `JWT_SECRET` with a separately generated random secret, for example using:

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

**Migrate as the database owner, not the runtime app user:**

```bash
DATABASE_URL='postgresql+psycopg://earnscore_owner:YOUR_OWNER_PASSWORD@localhost:5432/earnscore' alembic upgrade head
```

Then start the API as **earnscore_app**, using `backend/.env`:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Start frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 to sign in or create a worker account. The app retains `/demo`, `/worker`, `/lender`, and `/admin`. The **worker consent UI** at `/worker/consent` is now live and stores permissions in PostgreSQL, with explicit selection, expiry and revocation. Workers still cannot issue real lender grants from the UI because the real assessment generation module is not built; a scoped access-grant API exists for later integration.

To create a lender/admin account from the backend directory:

```bash
python -m app.cli create-user --email lender@example.com --name 'Demo Lender' --role lender
python -m app.cli create-user --email admin@example.com --name 'Demo Admin' --role admin
```

Passwords are prompted securely. A public registration always creates `worker`.

## Database access endpoints added

| Method | Endpoint | Authorized role |
|---|---|---|
| `POST` | `/api/v1/worker/consents` | Worker |
| `GET` | `/api/v1/worker/consents` | Worker |
| `POST` | `/api/v1/worker/consents/{id}/revoke` | Owning worker |
| `POST` | `/api/v1/worker/access-grants` | Assessment owner + matching consent |
| `POST` | `/api/v1/worker/access-grants/{id}/revoke` | Assessment owner |
| `GET` | `/api/v1/worker/assessments/{id}` | Assessment owner |
| `GET` | `/api/v1/lender/assessments/{id}` | Lender with valid `assessment` scope |
| `GET` | `/api/v1/lender/reports/{id}` | Lender with valid `report` scope |

Other original JWT authentication and admin user management endpoints remain. All decisions remain **human controlled**; no real financial scoring API is implemented. The worker's BFF endpoints require matching `Origin` on state-changing requests.

## Tests

```bash
cd backend
pytest -q
```

SQLite unit tests cover API checks, but **SQLite has no PostgreSQL RLS**. For live RLS tests, first migrate a **throwaway PostgreSQL database** and supply `TEST_POSTGRES_OWNER_URL` and `TEST_POSTGRES_APP_URL` as described in [DATABASE_DESIGN.md](DATABASE_DESIGN.md). The live test is intentionally skipped when those URLs are absent.

Frontend: `npm run test:csv` and `npm run test:demo` can be run with Node 22. For full checks, install dependencies and run `npm run typecheck`, `npm run lint`, `npm run build`. The full Next.js build was **not verified** in this environment because npm dependency installation timed out; TS/TSX syntax checking passed.

## Security limitations

This is not a production IAM/KYC/financial-storage platform. Authentication lookup tables use trusted FastAPI authorization, while financial tables use PostgreSQL RLS as a secondary boundary. Backend SQL injection or compromised app credentials can undermine session-scoped RLS because custom PostgreSQL session settings are changeable. Real deployment requires a security review, hardening, stronger identity/consent verification, rate limiting, encryption and robust monitoring.

See [DATABASE_DESIGN.md](DATABASE_DESIGN.md) for entity details, the full role access matrix, the migration sequence, scope semantics and verification limits.

## Enhanced CSV upload & preview (worker)

The `/worker/uploads` page now provides a **three-step, browser-only review workflow**:

1. Choose or drag-and-drop a `.csv` (maximum 2 MB / 10,000 transactions) or load the fictional example.
2. Review auto-detected headers or manually match date, description, signed amount **or** credit/debit, and optional category/source/reference columns.
3. Inspect parsed summaries, flagged and skipped rows, source/type filters, search, pagination, and a locally downloaded review list.

Recognized dates: `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `DD-MM-YYYY` (day-first for non-ISO). Quoted CSV values, UTF-8 BOM, and credit/debit bank layouts are supported. Potential duplicate payouts, transfers, non-income credits, malformed numbers, and invalid dates are labeled for review. **Previewed data is never sent to the API or saved**; classification is heuristic and does not constitute bank verification or a credit decision. The earnings estimate excludes unknown credits and flagged potential duplicates; outflows include every negative amount and may include transfers.

Run parser/preview checks from `frontend/`:

```bash
npm run test:csv
```

The next development phase is authenticated server ingestion and provenance checks; this feature intentionally does not create saved transactions.
