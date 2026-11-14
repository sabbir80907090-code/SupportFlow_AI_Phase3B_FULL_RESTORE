# Phase 1: Delivery Review reliability update — 2026-11-14

## Context
The latest Production Supabase check found 3 Telegram outbox records in `needs_review` and none in `queued` or `claimed`. These are uncertain delivery outcomes and must **not** be retried automatically; a provider may already have accepted the message. Previous role and workspace isolation SQL tests passed. Legacy n8n history/buffer tables were retired and now contain zero records, with RLS enabled and browser roles revoked.

## Update in this branch
- A minimal delivery-review banner is shown in the existing Inbox only for **Owner/Admin** when there is unresolved outbox activity for the selected workspace.
- Uses current `support_outbox` RLS and column-level SELECT grants; queries only `conversation_id`, an exact count, the current `business_id`, and status `needs_review`. Does **not** load customer message content or provider credentials.
- `Review` shows applicable conversations; `Show all` resets the filter. The Inbox still limits its list to the latest 100 conversations. A warning explains that older reviews may not appear in the recent list.
- The banner never triggers a retry, acknowledgement or status change. All existing reply processing, AI pause/resume, Owner/Admin/Agent privileges, subscription and usage controls remain unchanged.
- On query errors, the page shows a discreet 'Delivery check unavailable' notice instead of incorrectly claiming no unresolved items.
- Regression tests ensure the scope and read-only behavior remain in place.

## Remaining testing and limits
- The 3 historical Telegram delivery cases require manual cross-checking with Telegram/provider evidence before any action.
- Actual browser role/workspace switching, concurrent agent handoff, message-delivery E2E and provider receipts remain unverified by this UI-only release.
- If an external n8n workflow is still active with privileged credentials, it is outside this UI change; its retired storage tables must remain monitored.
- Verify Vercel Preview and GitHub Actions; only report Production success after the deployment is READY and assigned the live alias.

## Confidentiality
No passwords, tokens, raw customer messages, contact details or business identifiers are stored in this note.

## Verified release result
- GitHub PR #19 merged into `main` at `1ba28488ff639d01f32448af8cb04d625fd862a4`.
- GitHub Actions checks (TypeScript and unit tests) passed on the PR head.
- Vercel Preview deployment at commit `e80f8fde9f1e44c4efba34baae4aece9ddeb2c4d` reached READY.
- Production deployment `dpl_YWCABvXQ3JrqyNGJvgYKYqHjWro3` reached READY and received the verified live alias `support-flow-ai-phase3-b-full-resto.vercel.app`.
- This release is UI/read-only only; no schema, membership, billing, credentials, queues or worker behavior changed.
- Historical Telegram `needs_review` items have **not** been manually reconciled or retried; actual multi-workspace browser and provider-delivery E2E remain to be performed.
