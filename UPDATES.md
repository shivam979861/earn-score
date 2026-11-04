# EarnScore — interaction and accuracy refinements

## What changed

- Public `/demo` financial sandbox and role-protected `/worker/assessment` interactive page.
- Three fictional earning scenarios, monthly income bar visualization, and adjustable expense/debt/source-share sliders.
- Deterministic transparent score (five weighted components) and automatically derived explanatory factors, warnings, and hypothetical EMI stress test.
- **No false evidence verification:** sample scoring always indicates `Not verified`; financial figures stay browser-local; hypothetical EMI never silently changes the baseline score.
- `/lender/demo` fictional case with score details, evidence checklist, and clearly local-only human review notes/actions.
- Admin `/admin/users` search and role filters, active counts, confirmation before deactivation, and improved feedback.
- Password show/hide toggle, registration password length hint, progress animations, hover and entry transitions, responsive polish, skip-to-content link, and reduced-motion mode.
- Corrected backend overviews: modules that do not exist report `null` (unavailable) rather than misleading zero values; admin audit event count is now populated from the database.
- Added pure financial-math tests and one backend accuracy regression test.

## Crucial limitations

This remains a hackathon prototype. Browser-side assumptions are **not** uploaded or persisted. No live CSV ingestion, real income-source reconciliation, credit-bureau integration, evidence validation, production KYC, model calibration, or loan underwriting is implemented. The deterministic score demonstrates signal weighting and is NOT a validated repayment or default prediction. Lender simulation does not submit a real decision. Public user registration is worker-only; admin and lender users are provisioned by trusted administration/CLI.

## Verification

- Backend: `pytest -q` (8 tests passed in this environment).
- Frontend: TypeScript parser scanned all source `.ts/.tsx` files with no syntax errors.
- Math smoke tests: `npm run test:demo` runs on Node 22+ with type stripping.
- Full frontend typecheck / lint / production build must be run after `npm install`. npm registry access was unavailable (`EAI_AGAIN`) in the environment that produced this ZIP.
