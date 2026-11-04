# EarnScore — User Experience Refresh

Updated from the PostgreSQL + RLS project snapshot. Backend routes, access rules, migrations and models are unchanged.

## What changed

- Replaced a marketing-heavy landing page with one clear message, two calls to action, a short three-step explanation, and a sample score clearly marked DEMO.
- Reduced the sidebar to useful, accessible routes only. Unfinished features remain accessible by their original URLs for developers, but no longer dominate the navigation.
- Replaced empty or unavailable metric cards with a role-specific "what would you like to do" dashboard.
- Added `/worker/uploads` as an actual client-side CSV preview instead of a dead-end placeholder. Features: example CSV; header checks; numeric parsing; file size / row limits; estimated outflows; possible earnings; flags for transfers, unknown categories and possible duplicate payouts; filters and a clear/reset action. No uploads, server storage, or credit scores are performed.
- Kept authenticated consent management and admin user management as backend-connected features.
- Preserved the fictional EarnScore assessment sandbox and fictional lender review for interactive demonstration.
- Improved spacing, typography, contrast, mobile layouts, focus visibility and reduced-motion support.
- Simplified "coming soon" pages to an explanation and back button.

## Important product boundaries

- The CSV preview **does not send files to the server**, does not persist transactions, and does not prove account ownership or income.
- Positive unknown or suspicious credits are **not included as possible earnings**. Matching same-day amounts from different sources are flagged but not deduplicated.
- Verification, live assessment generation, lender access to real applications and automated loan decisions are **not** implemented.
- Use fictional records only for hackathon demos. Do not treat local CSV previews as verified financial advice.

## Quick run

Follow the existing README for PostgreSQL/FastAPI setup. For frontend:

```sh
cd frontend
npm install
npm run dev
```

Open `/`, `/demo`, `/worker/uploads` (after worker login), `/worker/assessment`, `/worker/consent`, `/lender/demo`, or `/admin/users` as appropriate.
