# BartaCare owner-only team management — pending database approval

Status: feature branch code only. No Supabase migration has been applied.

## Permission policy
Only the authenticated user whose ID matches `public.businesses.owner_id` can invite and manage members of that workspace. Other members, including those with the `admin` membership role, cannot manage the team. The owner is protected from removal. Delete requires owner password confirmation.

## Feature activation
The server environment variable `BARTACARE_TEAM_MANAGEMENT_ENABLED` must remain unset until the separate Supabase migration has been approved, applied, and verified. While unset, the existing invitation form and active team listing remain available, but Disconnect/Reconnect/Delete actions are hidden and the members API returns 503.

## Required migration
See the reviewed SQL draft in the user-provided implementation package: `database/owner_team_membership_controls_DRAFT.sql`. This SQL has **not** been executed. It introduces `business_member_disconnections`, an insertion-block trigger, and the server-only `bartacare_manage_team_member` RPC.

Before enabling: review migration privileges, invitation bypass, active membership checks across all service-role APIs, concurrency, owner password/OAuth-only accounts, audit retention, and tenant isolation. Run full typecheck/build and integration tests. Do not enable in production before those checks pass.

## Changed files
- `app/api/team/members/route.ts`
- `app/api/team/invitations/route.ts`
- `components/team-invitations.tsx`
- `components/team-member-actions.tsx`

No database, customer, auth user, or other workspace data was modified by these code commits.
