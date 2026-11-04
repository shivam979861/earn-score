# Changes from EarnScore Refined

- Kept existing animated Next.js site, public fictional simulator, protected worker/lender/admin layouts, JWT authentication, account security, and admin account management.
- Added PostgreSQL Compose service and separate owner/application/scoring DB roles.
- Added `0001` Alembic baseline schema for 15 tables and `0002` PostgreSQL RLS migration.
- Added consent and access grant association, `review_requests`, data-integrity checks, JSONB fields, and bounded score constraints.
- Added worker-specific RLS policies, lender-specific scoped assessment/report access, admin financial exclusion, audit-log rules, and processor-only derived assessment writes.
- Added PostgreSQL transaction-local actor binding after authenticated session verification.
- Added real worker consent create/list/revoke endpoints, restricted lender read endpoints, scoped grant create/revoke endpoints.
- Added an interactive authenticated `/worker/consent` UI with permission toggles, expiry controls, history, status, and revocation.
- Added unit tests for consent and scoped lender access; optional live PostgreSQL RLS integration test.

Remaining out of scope: real scoring, CSV ingestion, verified bank sources, file storage security, automatic decisions, report generation and full production hardening.
