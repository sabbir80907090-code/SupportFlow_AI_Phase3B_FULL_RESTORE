# Team member removal and Settings UX — 2026-11-18

## Request and verified baseline
- User requested a clearer Team & moderators UI, a remove-member action, and password verification with **Admin-only** removal.
- Inspected existing TeamInvitations component, invitation GET/POST/DELETE endpoints, acceptance RPC, workspace roles and live Supabase schema.
- Existing membership roles are `owner`, `admin`, `agent`; live workspace currently has owners and an agent but no Admin. No role was changed or member removed.
- Team seat limit is five including owner; invitations reserve seats. Existing invitation sending/revocation is owner-only.

## Changes in preview branch
- Redesigned Settings team area with three compact seat counts, member cards and protected Owner indication; kept invitations for Owner.
- Added password-confirmation removal dialog, using the reusable mobile bottom-sheet / desktop popup component from PR #26.
- Added `DELETE /api/team/members`: requires fresh Supabase JWT, workspace `admin` membership, admin password verified with a non-persistent separate auth client, and target role `agent`. Removes only the business membership, **never** the Auth user or other workspace memberships.
- Admin GET team list returns member IDs and roles but not invitation email history. Owner continues to manage invitations.
- Strict Admin-only removal: the Owner is not automatically treated as Admin. The live workspace has no Admin yet, so the feature will be unavailable until an Admin is assigned via a separately reviewed role-management flow.

## Release and QA
- No production DB migration or live user deletion. No passwords or PII stored in this note.
- Pending: CI TypeScript/unit tests, preview deployment, manual owner/admin/agent permission checks, wrong password, cross-workspace removal, concurrent role changes, and mobile/desktop confirmation UX.
- This branch is based on the open PR #26 (dialog foundation); merge PR #26 first or rebase before merging this feature.
