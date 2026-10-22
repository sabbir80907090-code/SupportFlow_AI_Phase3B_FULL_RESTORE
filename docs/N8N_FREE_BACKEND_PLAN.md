# n8n-free backend migration — implementation plan

Branch: `feature/n8n-free-backend-foundation`. The existing Next.js app, n8n bridge and Supabase data remain unchanged.

## Baseline (verified from repository)
- Next.js 15 app with Supabase Auth, business membership/RLS, orders and knowledge articles.
- Unified inbox schema includes conversations, messages, outbox and pause state.
- Existing Telegram AI MVP relies on a single `TELEGRAM_BUSINESS_ID` environment variable.
- n8n adapter and workflow order bridge exist, but provider delivery workers are not live.

## First additive migration
`database/n8n_free_channel_connections.sql` creates a tenant-scoped channel registry.
It contains **no provider tokens**: `secret_reference` is a pointer to an external
server-side secret store. Authenticated users may read non-secret columns only.
Server-side writes must verify owner/admin membership and validate the provider
account's ownership before enabling it.

## Required backend milestones (not yet implemented)
1. Channel onboarding API: verify signed provider callbacks, map each external
   account to exactly one business, encrypt/store credentials outside browser data.
2. Webhook ingestion: verify Meta/Telegram authenticity before resolving tenant;
   stable provider event IDs, replay protection, payload limits, rate limits.
3. Durable queue: persistent job states, leases, retries, dead-letter handling,
   dedupe and cautious handling of uncertain outbound deliveries.
4. AI orchestrator: business-scoped context, retrieval, message memory and tool
   permissions; never trust model output as an authorization decision.
5. Order state machine: atomic transitions, ownership checks, idempotent create,
   staff approval and notifications with delivery tracking.
6. Knowledge ingestion: tenant-specific chunks, secure uploads, versioning and
   background embedding jobs.
7. Billing/quotas and production observability.

## Rollout / verification
- Back up Supabase before applying migrations.
- Run migration on staging first; confirm RLS with two distinct business users.
- Confirm client queries cannot select `secret_reference` and cannot insert or
  update channel connections directly.
- Run `npm ci && npm run typecheck && npm run build` in a checked-out branch.
- Do not cut over traffic or disable existing n8n workflows until the replacement
  has passed end-to-end tests on every provider.

This commit is a foundation only; it does not establish live n8n-free processing.
