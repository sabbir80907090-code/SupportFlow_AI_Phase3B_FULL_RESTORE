# SupportFlow AI usability and workspace isolation

Date: 2026-11-07. Base: main aaf150bf06bf6c2e88e06e6408c94aa94f96e22e.
Status: review branch; production unchanged. No database migration or permission expansion.

## Implemented
- Channel connections, AI key management and remote product import send the selected workspace explicitly. The shared server helper validates the signed-in user and the selected business owner; it never guesses the only owned business. Missing/invalid workspace headers fail closed. Existing external callers must now send `x-business-id`.
- Owner-only channel/key controls match the existing backend policy. Admins retain business AI instruction and catalogue editing; Agents no longer see the channel shortcut. Settings remount and reset per workspace; old customer/order forms reset when switching workspaces.
- Messenger OAuth returns to its originating workspace. URL workspace selection is checked against the user's accessible workspace list; the server still independently checks ownership.
- Login includes show/hide password, autocomplete, clear signup guidance and password recovery. `/reset-password` supports a session established by the recovery link and requires matching new passwords. No reset email was sent during development.
- Customers have mobile cards and name/email/phone filtering with explicit latest-200 scope and loading/error/empty states.
- Inbox can load earlier messages with a timestamp + ID cursor, preserving loaded history during polling. An unsent draft prompts before leaving Inbox, switching workspace, signing out or unloading the page; drafts are not saved to browser storage.
- Setup guidance links channels, knowledge, AI setup and a test conversation; it does not claim steps are complete. AI setup labels are consistent; Analytics is marked Soon.
- Team seats show active members plus unexpired pending invitations against the existing five-seat limit. This is not paid subscription billing.

## Validation
- `npm run typecheck`: passed.
- `node --test tests/*.test.mjs`: 79 passed, 0 failed, including multi-workspace owner selection, invalid/foreign workspace rejection and existing Messenger OAuth checks.
- Local `npm run build` was blocked by this sandbox's `uv_resident_set_memory` ENOENT runtime limitation. A successful Vercel Preview build is required before release.
- No live Supabase records, channel connections, provider keys, memberships or permissions were changed.
- Full authenticated mobile, two-tenant end-to-end and live provider delivery checks remain necessary. Unit tests do not prove live RLS behavior.

## Release checks
- Supabase Auth redirect allowlist must include the trusted Preview and production `/reset-password` URLs. Verify the recovery email template uses the configured confirmation URL; test successful, expired and reused reset links with a test account. Do not broaden redirect allowlists to all Vercel apps.
- Verify Owner with two owned businesses; Owner of A/Admin of B; Agent; unrelated user; switching workspace while an old request is pending. Each channel/key/import request must affect only its authorized workspace.
- Verify Messenger canonical-origin redirect and Facebook return preserve the correct business. Existing OAuth state/cookie validation is unchanged.
- At 360/390/768/1440px check Customers, forms, Inbox composer and navigation. Test older messages with identical timestamps, polling overlap, cancelled draft-discard prompt and keyboard focus.

## Remaining roadmap
Server-wide customer/conversation search and pagination; unread/assigned/resolved inbox state; saved replies; full onboarding completion tracking; paid subscriptions and usage metering; team name/resend/member removal; bilingual UI. These require additional product/backend work and are not claimed complete by this change.
