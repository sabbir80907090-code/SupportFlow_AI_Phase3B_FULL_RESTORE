# Facebook Messenger setup and verification

## Implemented flow
Business owner → Channels → Continue with Facebook → authorize Pages → select one Page → connected.

Page access tokens remain server-side and encrypted with SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY. A Page may belong to only one tenant, and each tenant may connect one Messenger Page. Sender identities include Page ID to prevent routing historical conversations through a different Page after reconnecting.

Signed text webhooks create unified inbox messages and idempotent AI jobs. The existing central AI worker generates replies. Delivery checks the Page connection again, validates the Page-scoped recipient and Meta's 24-hour response window, and records provider message IDs. Human replies are allowed during handoff. Network-ambiguous delivery is marked needs_review and is not automatically resent.

Attachments, postbacks, proactive marketing messages, Instagram, and WhatsApp are not part of this release.

## One-time platform setup (required before connecting a customer)
1. Create/select a Meta developer app with Messenger and Facebook Login for Business. Configure a User access token login flow, requesting pages_show_list, pages_manage_metadata, and pages_messaging. If using a login configuration, set META_LOGIN_CONFIG_ID.
2. Complete the required Meta business verification/app review and advanced access for public customers. Development-mode testing is limited to roles/testers permitted by Meta. Publish accurate privacy/data deletion policies and complete Meta's required platform settings before public launch.
3. Set production Vercel variables through its secret editor (never put values in Git or chat): META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN (random 32+ characters), SUPPORTFLOW_APP_URL (canonical HTTPS origin). META_GRAPH_VERSION defaults to v25.0.
4. Set Facebook's Valid OAuth Redirect URI to:
   https://support-flow-ai-phase3-b-full-resto.vercel.app/api/channels/messenger/callback
5. Set Messenger webhook callback URL to:
   https://support-flow-ai-phase3-b-full-resto.vercel.app/api/channels/messenger/webhook
   Use the same META_WEBHOOK_VERIFY_TOKEN and subscribe the app to Page messages. Page-specific subscription is performed automatically by Connect selected Page.
6. Redeploy after setting the variables. The canonical callback/webhook URL must be publicly reachable without a Vercel login wall.
7. Apply supabase/migrations/20261025063738_messenger_channel.sql before releasing the delivery-worker changes.

Until variables are configured, Channels displays Setup pending, OAuth/webhooks fail closed, and the Messenger delivery helper does no work. No customer is shown as connected without a successful Page subscription.

## Verification
- npm run typecheck
- node --test tests/*.test.mjs
- npm run build
- Check RLS and grants on all support_messenger_* tables; no anon/authenticated access to tokens or OAuth grants.
- Verify claim_support_outbox_channel cannot claim another channel's queue items; Telegram must not claim Messenger messages.
- Test Meta login cancellation, invalid/expired/replayed state, Page permissions, duplicate ownership, connect and disconnect with a tester Page.
- Send a real text from a tester, observe inbox → completed AI job → sent outbox with provider_message_id.
- Test duplicate webhook delivery, human handoff/manual reply, and a closed 24-hour window.

## Deployment status
Local security/parser tests and the Next.js build can be verified without Meta credentials. Live OAuth, Page subscription, and Messenger sending remain unverified until the platform Meta app is configured. Do not describe this integration as live based on a successful build alone.

## Official references
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/get-started
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages
- https://developers.facebook.com/documentation/pages-api/getting-started
- https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/
