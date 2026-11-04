# EarnScore — PostgreSQL schema & access-control specification

This project extends the refined Next.js/FastAPI prototype with **15 PostgreSQL tables**, Alembic revisioned schema changes, database RLS policies, and persisted worker consent + lender-specific access grants. The scoring engine and bank/file ingest pipeline remain unimplemented.

> This is a **hackathon prototype**, not a production-authorized credit/lending system. Only load invented test records. A strong financial score does not imply loan approval. GDPR/DPDP/RBI or other legal compliance is **not** established by this schema.

## Entity relationships

```mermaid
erDiagram
    USERS ||--o{ AUTH_SESSIONS : owns
    USERS ||--o| WORKER_PROFILES : has
    USERS ||--o{ CONSENTS : authorizes
    USERS ||--o{ INCOME_SOURCES : receives
    USERS ||--o{ UPLOADS : submits
    USERS ||--o{ TRANSACTIONS : owns
    USERS ||--o{ ASSESSMENTS : subject
    INCOME_SOURCES ||--o{ TRANSACTIONS : categorizes
    UPLOADS ||--o{ TRANSACTIONS : supports
    ASSESSMENTS ||--o{ ASSESSMENT_FEATURES : includes
    ASSESSMENTS ||--o{ RISK_FLAGS : includes
    ASSESSMENTS ||--o{ REPORTS : versions
    CONSENTS ||--o{ LENDER_ACCESS : governs
    ASSESSMENTS ||--o{ LENDER_ACCESS : shared
    USERS ||--o{ LENDER_ACCESS : lender
    ASSESSMENTS ||--o{ REVIEW_REQUESTS : receives
    ASSESSMENTS ||--o{ LENDER_DECISIONS : has
    USERS ||--o{ AUDIT_EVENTS : performs
```

*IDs are UUID strings (`VARCHAR(36)`) to preserve compatibility with the existing FastAPI/JWT code. Change to PostgreSQL native UUID only in a coordinated future migration.*

## Core tables and critical fields

| Table | Key columns | Purpose |
|---|---|---|
| `users` | id, email, full_name, password_hash, role, is_active, created_at | Authenticated account and roles (`worker`, `lender`, `admin`) |
| `auth_sessions` | id, user_id, expires_at, revoked_at | JWT-linked session revocation |
| `worker_profiles` | id, user_id (unique), occupation, primary_platform | Worker work metadata |
| `consents` | id, user_id, purposes JSONB, scopes JSONB, expires_at, revoked_at | Consent preferences; `purposes.lender_review=true` required for sharing |
| `income_sources` | id, user_id, provider, source_type, verification_status | Self-reported/verified income source state |
| `uploads` | id, user_id, file_hash, storage_key, status | Non-public file metadata; secure file storage not implemented |
| `transactions` | id, user_id, income_source_id, upload_id, amount NUMERIC(14,2), occurred_at, classification | Transaction classification, tenant-scoped source FK constraints |
| `assessments` | id, user_id, model_version, status, score (nullable), evidence_confidence | Assessment state and version |
| `assessment_features` | id, assessment_id, feature_name, value JSONB, provenance JSONB | Explainable factor calculation |
| `risk_flags` | id, assessment_id, category, severity, explanation | Concrete assessment limitations / warning factors |
| `reports` | id, assessment_id, version, status | Immutable-ish report version identifiers; report generation not implemented |
| `lender_access` | id, lender_id, assessment_id, consent_id, scopes JSONB, expires_at, revoked_at | Individually scoped and revocable grants |
| `review_requests` | id, lender_id, assessment_id, status, request_details | Human requests for further evidence (DB only) |
| `lender_decisions` | id, lender_id, assessment_id, outcome, reasons JSONB | Human decision audit (DB only) |
| `audit_events` | id, actor_id, action, resource_id, created_at | Basic append-only action records |

### Important integrity guarantees

- A public registration can create a **worker** account only. Administrators provision lenders/admins through guarded APIs or trusted CLI.
- `transactions` has composite foreign keys `(income_source_id, user_id)` and `(upload_id, user_id)` so a transaction cannot reference another worker's source/upload.
- Scores are constrained to 0–1000 if present; NULL means **no score**. Income and money use `NUMERIC(14,2)`, never binary floating point in the DB.
- Each `(assessment_id, feature_name)` is unique; each `(assessment_id, report version)` is unique.
- Consent and grant expiration must be after creation. An active **parent consent** is independently checked on *every lender read*, so revocation takes effect without asynchronously refreshing grants.
- Future assessment writer service has a separate DB login. Ordinary API DB login has **no INSERT/UPDATE grants** on derived scoring tables.

## Access-control matrix

Legend: **Own** = row owned by authenticated worker; **Grant** = matching active lender permission *and* active parent consent; **Limited** = metadata only. Deny-by-default where blank.

| Resource | Worker | Lender | Admin | Scoring processor |
|---|---|---|---|---|
| Own profile / consent | Own read/create/revoke | — | — | — |
| Income sources / uploads / transactions | Own read/write | — | — | Read for calculation |
| Assessment | Own read | **Grant:** `assessment` | — | Read/write |
| Assessment features and risks | Own read | **Grant:** `assessment` | — | Read/write |
| Report | Own read | **Grant:** `report` | — | Read/write |
| Lender access grant | Own issue/revoke/read | Assigned active grant metadata | — | — |
| Review request, lender decision | Read subject's records | **Grant:** `decision`, append-only | — | — |
| Audit log | — | — | Read all basic events | Append |
| Users / sessions | Role-checked API only | Role-checked API only | Admin API provisions/disables | No password hash access |

**Administrative authority does not automatically include viewing workers' financial records.** It is intentionally separate from financial-data access.

## Runtime roles and RLS

- `earnscore_owner`: **schema/migration owner**. Never configure FastAPI with these credentials. Table owner bypasses RLS by PostgreSQL design; this ownership is used by narrow `SECURITY DEFINER` helper functions to check consent/grants without recursive RLS joins.
- `earnscore_app`: non-owner FastAPI role, `NOBYPASSRLS`; has limited DML grants. Financial tables have PostgreSQL row-level security enabled.
- `earnscore_processor`: separate `NOBYPASSRLS` future scoring worker; can read selected inputs and write derived assessment tables. **No API currently uses these credentials.**
- DB actor identity is set using `set_config('app.user_id', ..., true)` and `set_config('app.actor_role', ..., true)` **only after** JWT + stored-session + active-user checks, or during trusted worker-registration transaction. `true` makes values transaction-local. Pooled DB connections do not retain the context.
- Missing context is **deny-by-default** for financial RLS tables.
- The `earnscore_can_read_assessment(assessment_id, scope)` helper verifies current worker ownership or a lender's unexpired, unrevoked grant AND parent consent with compatible scope, plus an active lender account.
- Lender access never includes raw transactions in this phase. Access grants cannot exceed the parent consent scopes or expiry; no unlisted scope is permitted.
- Revoked and expired grants are not valid. Parent consent revocation also cuts off lender access.

### Boundaries of this security model

This is **defense in depth**, not end-to-end production security. A backend using a single PostgreSQL app login controls the actor context and must never execute user-supplied SQL. A compromised backend/DB login could manipulate custom settings and impersonate an actor. Production deployments should consider stronger DB identity designs, isolated credentials, controlled security-definer APIs, independent security review, proper encryption, object-storage access policies, rate limits, account recovery, MFA, and formal threat modeling.

`users` and `auth_sessions` are *not* RLS-protected in this phase because unauthenticated login and registration need controlled access. Their authorization is performed in FastAPI; no direct SQL interface is exposed to browsers. `audit_events` are a **basic append-only application log**, not a tamper-proof evidentiary trail.

The worker can store a consent preference without immediately issuing lender access. A separate `lender_access` row is required to disclose a specific assessment, only to a specific eligible lender. A full consent UX and the underlying provider verification still require real-world implementation.

## Migration and deployment order

1. Create root `.env` from `.env.example`, replacing all placeholders with independent random secrets.
2. `docker compose up -d postgres` creates a local development PostgreSQL database and the `earnscore_app`/`earnscore_processor` logins.
3. Install backend dependencies: `cd backend && pip install -r requirements-dev.txt`.
4. Configure `backend/.env` from its example, **using the same app password as root `.env`**. Set a strong independent `JWT_SECRET`.
5. Run migrations **as owner**, temporarily overriding the backend app URL:

   ```bash
   cd backend
   DATABASE_URL='postgresql+psycopg://earnscore_owner:YOUR_OWNER_PASSWORD@localhost:5432/earnscore' alembic upgrade head
   ```

6. Start the API as `earnscore_app`: `uvicorn app.main:app --reload --port 8000`.
7. Start the existing frontend from `frontend/` with `npm install && npm run dev`.
8. **Never run Alembic from the app login**. The owner connection must only be used for migrations. Do not give the app login membership in the owner role.

Use URL-encoded passwords in connection URLs if they contain punctuation reserved in URLs. The Docker role-init script is run only when its data volume is initialized. Changing environment variables later does not rotate existing database passwords; use PostgreSQL `ALTER ROLE` under DBA controls for rotation. Do not run `docker compose down -v` unless intentionally destroying your local test database.

### Migration history

- `0001_baseline_schema`: creates all 15 relational tables, indexes, constraints, JSONB on PostgreSQL.
- `0002_access_policies`: least-privilege GRANTs, RLS policies and scoped access helper functions; it is a no-op on SQLite. The database must already have the runtime roles when applying this revision.

For an **existing SQLite prototype**, this is a *new PostgreSQL database*. There is no automatic import of old SQLite users or sessions. Plan a separate controlled ETL migration if data retention matters.

## Tests

```bash
cd backend
pytest -q                          # FastAPI / SQLite application authorization tests
alembic current                   # run using OWNER database URL
```

An optional integration suite executes actual PostgreSQL RLS checks when you supply separate test URLs (use an **isolated, migrated test database**, never production):

```bash
TEST_POSTGRES_OWNER_URL='postgresql+psycopg://earnscore_owner:...@localhost/earnscore' \
TEST_POSTGRES_APP_URL='postgresql+psycopg://earnscore_app:...@localhost/earnscore' \
pytest -q tests/test_postgres_rls.py
```

The integration suite tests missing actor denial, worker separation, admin exclusion from financial data, lender grant visibility, no raw transaction reads, and consent revocation.

## Not implemented yet

- Real bank integration, uploaded financial parsing, storage encryption or provenance checks.
- Real assessment calculation, factor normalization, model governance, processor worker, or risk training.
- Generated lender report PDFs, lender-requested documents and lender UI for issuance of real loan decisions.
- Enterprise-grade verification/identity, notification delivery, retention/deletion, and compliance controls.
