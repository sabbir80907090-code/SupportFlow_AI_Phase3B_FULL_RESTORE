# SupportFlow AI — Inbox security and delivery QA (2026-11-14)

## Goal and scope
Strengthen SaaS reliability without adding new customer-facing features or altering successful Mobile Inbox workflows. Explicitly preserve isolated business workspaces, Owner/Admin/Agent permissions, and current channel integrations.

## Completed verification
1. Supabase metadata: `support_conversations`, `support_messages`, `support_outbox`, and `business_members` have RLS enabled; selected-business policies use authenticated `auth.uid()` membership.
2. Existing `tests/unified-inbox.sql` ran successfully as one rollback transaction: duplicate intake, cross-business read isolation, reply idempotency, human pause, outbox claims, claim-token protection, and acknowledgement idempotency.
3. New `tests/inbox-handoff-roles.sql` ran successfully as one rollback transaction on the connected Supabase project. Synthetic Owner A, Admin A, Agent A, Agent B and Owner B exercised the following: agent claim; teammate takeover and reply rejected; outside business read/takeover/reply rejected; Admin takeover and resume; manual reply auto-claim and idempotency; Owner takeover and resume.
4. No test fixture remains after rollback. No real provider send was initiated.
5. The current outbox contains 30 historical records, including 3 `needs_review` records. These must not be retried automatically because provider delivery might have occurred.
6. Readiness response counts previously used `processing`, which is **not** a `support_outbox` status. Updated read-only readiness to count actual `claimed` as processing and report `needs_review` separately. The endpoint remains CRON_SECRET-gated and does not send messages. Added `tests/supportflow-readiness.test.mjs` for this invariant.

## Security risks requiring separately controlled remediation
Supabase security advisor reported two old n8n tables with RLS disabled: `public.n8n_chat_histories` and `public.n8n_support_message_buffer`. The actual grants allow both `anon` and `authenticated` broad read/write access. This is a **high-priority data-exposure risk** and a different legacy integration from the new workspace-scoped Inbox.

Do **not** casually enable RLS or revoke access in production without confirming whether current n8n flows authenticate as `anon`, `authenticated`, or `service_role`. Existing workflow documentation explicitly says a single `channel:senderId` memory key is not sufficient for tenant isolation. Recommend inventorying active n8n queries and credentials, switching to a server-side tenant-scoped access method, testing against an isolated database, then restricting grants/enabling RLS with a rollback plan.

Other advisor notices include mutable `public.match_documents` search path, `pg_net` installed in public, and provider Auth security settings. Triage separately; no unauthorized legacy schema changes have been made.

## Deployment and remaining QA
- Changed only the read-only `app/api/internal/supportflow-readiness/route.ts` in app code; added SQL/Node regression tests, GitHub Actions typecheck/unit-test workflow, and this report on `test/inbox-tenant-handoff-security-20261114`.
- No database migrations, tokens, credentials, customer personal data, subscription configuration or usage limits were modified.
- Preview build and automated GitHub Actions test results should be checked; production release requires separate verified status. The SQL role test was executed via a rollback-only transaction, not from GitHub Actions.
- Remaining: real agent-to-agent browsers, concurrent claims, live channel delivery and platform-provider acknowledgements, unresolved `needs_review` item investigation using provider evidence, and safe remediation of legacy n8n tables.
