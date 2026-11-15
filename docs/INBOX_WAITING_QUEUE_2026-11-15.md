# Inbox waiting queue — 2026-11-15

## Verified starting point
- Reviewed the Smart Inbox Handoff and Mobile QA notes and main commit `9832bd9afd08d10bdf4a3f98a977b657e8e374b1`.
- Needs Reply, My Chats, Take chat and Resume AI already exist. Vercel's live alias points to that main commit with READY status.

## Changes
- Add an Unassigned queue for unanswered conversations without an assigned teammate, with a count and actionable empty state.
- Preserve human-handoff priority, then sort oldest latest-unanswered-message first within each waiting tier. Answered conversations retain recency sorting; missing dates have deterministic ordering.
- Show elapsed minutes on human-reply badges and clarify that counts cover only the latest 100 conversations.
- Four queue controls wrap into a two-column layout with existing touch target sizes.
- Existing workspace-scoped reads, SQL ownership checks, Take chat/Resume AI and draft behavior stay in place. No new database migration, paid AI calls, subscription usage, seat provisioning or onboarding steps.
- This is self-assignment via the existing Take chat action, not a new teammate-picker or automatic assignment engine.

## Verification
- TypeScript check passed.
- All 94 existing and new Node tests passed, including unassigned eligibility, ownership filtering, oldest-first priority and timestamp fallbacks.
- Optimized Next.js build passed (30 routes).
- Diff whitespace check passed.
- Attempted local browser interaction testing using synthetic data; Chromium could not start because the environment disallows its singleton socket. No mobile/browser or authenticated cross-role E2E pass is claimed. Temporary QA route removed.
- No customer messages were sent and no production data changed.

## Rollout
- Prepared on `feature/inbox-waiting-queue-20261115` for Preview review; not merged to production.
- Remaining: authenticated mobile checks at 360/390/768/1440px and Owner/Admin/Agent flows against the existing server permissions.
- Known limit: queue covers the latest 100 conversations, not the entire workspace history; waiting time starts from the latest inbound message, not the first unanswered message in a burst.
