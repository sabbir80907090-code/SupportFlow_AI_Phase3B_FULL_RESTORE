# BartaCare application rename — 2026-11-16

## Decision
User requested an immediate application-name change from SupportFlow AI to **BartaCare**. No logo, domain, trademark registration, legal-entity rename or broader redesign is requested. Brand/domain/trademark clearance is **not confirmed**.

## Changes prepared in preview branch
- `app/layout.tsx`: browser title to `BartaCare | Dashboard`.
- `app/page.tsx`: setup, login, desktop/mobile sidebar and footer branding.
- `components/channels.tsx`: user-facing disconnect confirmation text.
- `package.json` and `package-lock.json`: synchronized npm package name `bartacare`.

## Intentionally unchanged
- GitHub repository name and current Vercel production URL.
- Supabase project, schema, RLS, tenant/workspace identifiers, customer/order/conversation data, role permissions.
- Existing API routes, environment variable names (e.g. `SUPPORTFLOW_APP_URL`), widget localStorage key `supportflow-chat-`, Telegram/webhook endpoints, SQL migration filenames and historical documentation. These are internal compatibility identifiers, not customer-facing brand strings.
- Pricing, subscriptions, limits, onboarding, channel integrations and functional logic.

## Verification and rollout
- Reviewed main branch `c2b0798b1fabee56537b66b6e5b20ec13a583f76` and relevant files before changes.
- Exact-occurrence checks applied to all replacements; both modified JSON files parsed successfully.
- **Not yet run:** npm typecheck, unit tests, Next.js build, authenticated browser/mobile QA, Vercel preview deployment check.
- **Status:** feature branch only, not merged into main; production unchanged.
- Prior staging sign-in issue remains outside the scope of this branding-only change.

## Next
Run CI and preview checks; confirm Owner/Admin/Agent login and isolated workspaces; then merge and verify production only after checks pass.
