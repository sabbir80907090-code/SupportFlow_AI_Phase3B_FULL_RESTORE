# Email moderator invitations

Status: **Draft, not deployed.** No production database migration, email or user membership has been created by this change.

## User flow

The workspace Owner opens **Settings → Team & moderators**, enters an email address, and sends an invitation. A new user receives a Supabase Auth invite; an existing user receives a passwordless sign-in email. The link redirects to the configured SUPPORTFLOW_APP_URL with a teamInvite query parameter. After Supabase signs in the user with their **verified invited email**, the dashboard calls POST /api/team/accept. Only then is the account granted the existing **agent** role in that business. Agent is the moderator role in this first release.

Invitations expire after seven days, may be cancelled by the Owner, and cannot be accepted by another email. The app lists team member IDs and invitations only to the Owner. It does not expose cross-business users. Pending invites reserve seats.

## Security and limits

- Business owner is checked against businesses.owner_id on the server; arbitrary client business IDs do not grant access.
- The invitation and acceptance database functions are service-role only; the invitee's user ID and verified email are obtained from Supabase Auth getUser, never trusted from the request.
- All invitations are tenant-scoped. The new table has RLS enabled and no browser data grants. Membership inserts are done by the server using an atomic database function.
- Five total team seats including Owner; ten invitation attempts per workspace per day. The limit is a temporary conservative SaaS default, **not a paid subscription integration**.
- Agent cannot invite, revoke, or promote teammates. Existing product/settings permissions are unchanged.
- No secrets or private customer data should be stored in project notes.

## Staging checklist

1. Review and apply database/team_email_invitations.sql in **staging** only. No live migration has been applied.
2. Configure SUPPORTFLOW_APP_URL for the **staging** domain and allow it as an Auth redirect URL in Supabase. Verify SMTP/email sender limits, sender identity, and invitation email template. The project currently uses Supabase Auth email delivery.
3. Deploy the branch to Preview, invite a new address, verify the email, accept and confirm the Agent sees only the invited business. Repeat for an already-registered email address.
4. Test non-owner rejection, wrong-email acceptance rejection, duplicate invitation, expiration, revocation, seat limit, daily limit, two concurrent invites, and two unrelated businesses.
5. Test agent access to Inbox and denied access to Settings/Products modification. Verify desktop and mobile Settings.
6. Run typecheck/build and migration tests before merging. Production must remain unchanged until all checks pass.

## Known limitations

- The initial release supports **Agent moderators only**. Admin invitation, role changes, removal of accepted members, audit logs, resend, custom subscription quotas, and granular channel permissions remain follow-ups.
- Owner-only team management is deliberate. The app currently has a single owner per business.
- If email delivery fails, the pending invitation is revoked; a failed invite may still have created an unconfirmed Supabase Auth user. Email provider configuration must be tested.
- Email delivery is dependent on Supabase Auth SMTP settings and rate limits.

## 2026-11-04 verification update

- Inspected current Supabase production schema, role constraints, RLS and Vercel environment variable **names only**. No credentials or customer records were copied into notes.
- Vercel generated a READY preview for the initial PR commit. Later hardening commits still require their final preview build result.
- Fixed lock ordering in invite acceptance, refused unconfigured redirect URLs, surfaced team-list query errors, and prevented new moderators from seeing the create-business onboarding before accepting their invitation.
- Supabase currently has **no development branches**. Applying this SQL now would modify production; do not do so until an isolated staging environment is available or the change is explicitly reviewed and authorized for production.
- Vercel currently has SUPPORTFLOW_APP_URL for **production only**, not preview. Configure a trusted preview origin and Supabase Auth redirect allowlist before attempting email delivery in Preview.
- A Vercel team authorization prompt is pending for reading detailed deployment logs; a READY preview alone does not prove end-to-end invitation delivery.
- Security advisor currently reports unrelated legacy n8n tables with RLS disabled and match_documents mutable search_path. Track these separately; do not change them as part of team invitations.
- No emails sent, no invitation memberships created, no migration applied, no production release.

## 2026-11-04 live database correction

- User observed missing RPC error in Preview. Applied additive `business_team_email_invitations` migration to the shared Supabase production project after confirming live constraints and migration history. Migration succeeded.
- Verified the invitations table exists, both service-role-only RPCs exist, and RLS is enabled. No invitation records existed immediately after migration; no email was sent during the migration.
- Latest Preview commit `4a202e2` is READY in Vercel. Production application code remains unchanged, but production database schema is now updated because Preview shares the live Supabase project.
- Security advisor lists the new invitations table as RLS-enabled with no policies. This is intentional: direct client access is revoked; only the service-role server API accesses it. Other pre-existing advisor findings are tracked separately.
- Next: authenticated Owner send-email test, Supabase email template/redirect allowlist verification, invitee acceptance, and cross-tenant/role E2E. Do not claim email flow is proven yet.

## 2026-11-04 invitation email localhost redirect investigation

- User confirmed invite email arrived, but the Accept Invitation link redirected to localhost:3000. The server API sends an explicit `redirectTo`, so the most likely cause is the Supabase Auth URL allowlist not containing the Preview URL, which makes Auth fall back to its Site URL. This must be verified in the Auth dashboard; connector does not expose an Auth URL configuration write action.
- Added Vercel branch-scoped Preview `SUPPORTFLOW_APP_URL` = `https://support-flow-ai-phase3-b-full-restore-git-feature-e652f2-nax10.vercel.app`. Production environment remains unchanged. This change needs a fresh Preview deployment to be picked up.
- Operator action: Supabase Dashboard → Authentication → URL Configuration: set Site URL to the production website if it is localhost, and add the exact Preview origin plus `/**` to Redirect URLs. Keep only trusted origins; do not allow all Vercel apps globally.
- After a fresh Preview deployment and Supabase allowlist update, Owner must revoke the broken pending invite and send a new invite. Do not send invitation tokens or private auth links to support chat.
- Verify end-to-end on the invitee's own browser and confirm `business_members.role = agent` in the correct business without exposing cross-tenant data.

## 2026-11-04 follow-up: user requests direct configuration

- Confirmed Supabase connector exposes database and project operations but **no Auth URL Configuration update action**. Do not claim Supabase Site URL or redirect allowlist has been changed; this requires a privileged Supabase Dashboard action.
- Preview-only `SUPPORTFLOW_APP_URL` is set on Vercel for branch `feature/email-moderator-invitations`, with the stable branch alias.
- Triggered a new staging/Preview redeployment (`dpl_3g7NZSdYX4hMQdjXY78RYiZXy77Y`) to pick up environment settings. Build was still running at last check.
- The existing email's `localhost:3000` redirect remains unfixed until Supabase Authentication → URL Configuration is updated. Site URL should use the actual production origin and the exact trusted Preview alias should be allowed under Redirect URLs.
- No Supabase Auth config change, new email, or user invitation acceptance was performed in this step.
