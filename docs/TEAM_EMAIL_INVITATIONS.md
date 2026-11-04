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
