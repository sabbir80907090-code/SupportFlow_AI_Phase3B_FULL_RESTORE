# WhatsApp Cloud API integration

Status: implementation branch; not production-enabled. Draft PR #21 is open against main.

## Scope
- Meta WhatsApp Business Platform Cloud API, Embedded Signup (v4 config).
- One WhatsApp phone number per business workspace in the first release.
- Signed Meta webhook for inbound text messages.
- Reuse the existing business-scoped Unified Inbox, AI job queue, human handoff, and outbox.
- Server-side encrypted per-workspace access tokens. No token is sent to browser storage.
- Text-only initial release. Media, templates, multiple phone numbers, campaigns and subscription metering are deferred.

## Required server/client configuration
- META_APP_ID (server)
- META_APP_SECRET (server-only)
- META_WEBHOOK_VERIFY_TOKEN (server-only, random and at least 24 chars)
- META_LOGIN_CONFIG_ID (server; Embedded Signup v4 configuration ID)
- META_GRAPH_VERSION (currently v25.0)
- SUPPORTFLOW_APP_URL (canonical HTTPS app origin)
- SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY (existing encryption key; do not rotate)
- NEXT_PUBLIC_META_APP_ID (public App ID used by Meta JS SDK)
- NEXT_PUBLIC_META_LOGIN_CONFIG_ID (public Embedded Signup configuration ID)

The app ID and config ID must refer to the same Meta app. Do not commit any credential values.

## Meta dashboard setup still required
1. Confirm the existing Meta app has WhatsApp product and Embedded Signup v4 configuration.
2. Add the exact production and preview callback/origin domains allowed by Meta.
3. Configure the app webhook callback URL: `https://<canonical-origin>/api/channels/whatsapp/webhook`.
4. Subscribe the WhatsApp Business Account webhook field `messages`.
5. Complete Meta business verification, app review and advanced access as required before external customer onboarding.
6. Set secrets in Vercel Preview only after a separate Supabase preview database is available; Production values are not modified by this branch.

## Database
The additive migration creates service-role-only encrypted credential and 24-hour-window tables. It is not applied to the connected production database. Preview currently shares production Supabase, so do not apply it there without an isolated database.

## Safety and policy
- A signed inbound webhook is required; invalid signatures are rejected.
- Duplicate Meta message IDs are idempotent through the existing inbox ingestion RPC.
- One phone number can belong to only one SupportFlow workspace.
- Outbound free-form text is allowed only inside the WhatsApp 24-hour customer service window. Outside that window, a reviewed/approved template is required; template sends are not in this first slice.
- Ambiguous provider outcomes must be marked for review, never blindly retried.
- Each workspace's AI setting and conversation handoff state are checked before AI jobs are enqueued and again by the existing AI worker.
- Subscription/usage metering is not yet implemented for channel messages; do not advertise message quotas as active.

## Rollout gates
- Isolated Supabase branch and migration test.
- Meta test WABA + test phone E2E (inbound, reply, AI opt-in, handoff, 24h expiry, duplicate webhook).
- Workspace A/B isolation and Owner/Admin/Agent permissions.
- Preview typecheck/build and mobile checks.
- Explicit approval before production migration, environment setup, or deployment.

## Progress checkpoint — 2026-11-15
- Branch: `feature/whatsapp-cloud-api-20261115`.
- Draft PR: https://github.com/sabbir80907090-code/SupportFlow_AI_Phase3B_FULL_RESTORE/pull/21
- GitHub Actions typecheck and full Node unit-test job passed on the latest checked commit.
- Vercel Preview deployment is still building at checkpoint; no Preview-ready claim yet.
- No Supabase schema changes have been applied. The production project currently has no development branch; creating one is quoted at USD 0.01344/hour and requires owner approval.
- No Meta App ID/App Secret/Embedded Signup configuration values were added to Vercel. Existing production META_APP_ID and META_APP_SECRET are unset.
- No real Meta WABA, webhook, or outbound customer message has been tested.
- Production remains unchanged.
