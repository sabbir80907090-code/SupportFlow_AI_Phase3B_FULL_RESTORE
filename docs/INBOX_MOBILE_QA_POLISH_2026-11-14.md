# Inbox mobile QA polish — 2026-11-14

## Scope
Small UI improvements following an authenticated production mobile test by the workspace owner. The owner verified Take Chat → My Chats (1) → Resume AI → My Chats (0).

## Changes
- Status labels in each conversation list item now appear as separate, wrapping badges rather than adjacent inline text. Human mode, Assigned to me/teammate, Draft reply, and Waiting/Human reply needed are visually distinct.
- "Needs Reply" tab now filters every unanswered inbound conversation, including those waiting less than two minutes. The existing priority sorter still places long-waiting and human-paused chats first; the old tab inadvertently used the stricter needsAttention threshold even though it was labelled Needs Reply.
- Personalized empty states for My Chats and Needs Reply, plus a Show all conversations button when a filter matches nothing.
- Keeps existing mobile navigation, chat composer, selected-workspace data scoping, and Owner/Admin/Agent RPC enforcement unchanged.
- No database migration, AI token use, subscription, seat or usage changes.

## Validation and rollout
- Code changed only in `components/unified-inbox.tsx` on branch `feature/inbox-mobile-qa-polish-20261114`.
- Vercel Preview build, production release and cross-role browser verification are to be recorded separately after results are known.
- No customer data, private messages, credentials or API keys in this note.

## Release verification
- Feature PR #16 merged into main as commit `3d6438726a68e202e6a28938df5b0782424f65d5`.
- Vercel Preview build was READY for commit `d8c4d9f035004ba5a84aa050882c0b2bbcc7f175`.
- Production deployment `dpl_29zcwwKxSfkdSRjdfttQ3toerjgT` reached READY and was assigned the verified live alias `support-flow-ai-phase3-b-full-resto.vercel.app`.
- No SQL migration or permission change. Existing Take Chat / Resume AI tested successfully by owner in previous screenshots; this release changes only presentation and the Needs Reply UI predicate.
- Remaining: live mobile browser check of wrapping badges, mixed filters, narrow viewports and authenticated Agent/Owner cross-workspace E2E. A build success alone does not prove these interactions.
