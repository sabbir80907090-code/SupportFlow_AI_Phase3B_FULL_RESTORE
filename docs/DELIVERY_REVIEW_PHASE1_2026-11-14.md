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
