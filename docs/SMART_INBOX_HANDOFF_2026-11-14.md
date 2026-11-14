# Smart Inbox Priority + Human Handoff — 2026-11-14

## Goal
Keep SupportFlow AI simple: no new dashboard page. Prioritize conversations waiting for replies, and allow one-click human takeover and AI resume in the existing Inbox.

## Changes in this feature branch
- One compact Inbox filter row: All / Needs attention / My chats.
- Waiting time from latest inbound vs latest outbound message. "Needs attention" means unanswered >=2 minutes, or paused AI waiting for human. It is **not** per-user unread status, an SLA, or proof of human delivery.
- Priority order: unanswered in human mode, overdue inbound, recent unanswered, assigned conversations, other chats. Shows latest 100 conversations, not a global count.
- Uses existing `set_support_pause` and `queue_support_reply` RPCs; enhanced functions assign a conversation to the signed-in teammate. Sending a manual reply claims an unclaimed conversation and pauses AI.
- An assigned agent cannot be overridden by a different Agent. Workspace Owner/Admin can take over; resuming AI clears ownership. All mutations are enforced in locked server-side SQL, not just disabled buttons.
- No extra provider calls, AI tokens, seats, or subscription usage are consumed by filtering or assignment.
- No customer PII, credentials, or keys included in this note.

## Required deployment order
1. **Do not apply directly to shared production while reviewing Preview.** This project's Supabase project currently has no development branch; Preview uses the same production database.
2. Create an isolated staging database (or obtain separately approved production migration), then apply `database/inbox_priority_handoff.sql` once after the existing unified Inbox schema.
3. Verify existing replies, manual pause/resume and AI background processing after migration. Since schema is additive and RPC signatures stay unchanged, previous code should still run.
4. Test as workspace A Owner, Admin, Agent A, Agent B and unrelated workspace B; ensure one Agent cannot steal a chat and Owner/Admin can transfer. Test duplicate message ingestion and simultaneous takeovers.
5. Confirm migration and app Preview build, then test at 360, 390, 768 and 1440px. Only after approval should code be merged to `main` and production deployed.

## Validation status at authoring
- Source reviewed against `main`, existing Inbox SQL RPCs and actual production column/function signatures (read-only inspection).
- New pure priority tests supplied at `tests/inbox-priority.test.mjs`.
- Migration **not executed**, no customer data altered, no messages sent.
- Live provider delivery, end-to-end RLS isolation, concurrent handoff and browser mobile UX **not yet verified**.
- Feature branch only, not production.

## Known limitations
- Only the latest 100 conversations are considered by UI priority; a later server-side paginated inbox may be warranted.
- Assignment displays as “teammate” rather than exposing other people's emails; pending cross-workspace membership is still validated at action time.
- No automatic AI confidence-based escalation in this release; explicit human takeover is reliable and simple. Separate automatic escalation would require a trusted worker and testing.
- Existing pending outbox sends are not cancelled on resume; provider workers must still honor existing pause rules.
