# Telegram self-service Preview rollout checklist

Production `main` and legacy `/api/telegram/webhook` are out of scope.

## Completed
- Preview-only `SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY` is stored as an encrypted Vercel environment variable scoped to the development branch.
- Encrypted credential table exists with RLS and no anon/authenticated access.
- Unique indexes prevent multiple Telegram connections per business, duplicate bot account IDs, and multiple owned businesses.
- Self-service UI and API code are committed on `feature/n8n-free-backend-foundation`.

## Must verify before live connection
1. Configure `SUPPORTFLOW_PUBLIC_WEBHOOK_BASE_URL` to a **stable, publicly reachable HTTPS preview hostname** that is not blocked by Vercel Deployment Protection/SSO. Telegram cannot send updates to an SSO-protected webhook. Never point to production or an ephemeral deployment URL.
2. Verify the preview hostname's webhook path is publicly reachable while admin pages and internal routes remain protected. Prefer a separate webhook-only public host/route rather than disabling protection for the whole preview.
3. Redeploy the development branch after setting environment variables. Confirm the deployment is READY.
4. Connect a **new, unused test bot** with no existing webhook. Never connect the legacy production bot.
5. Verify `getWebhookInfo` points to the intended preview endpoint and an inbound message is stored in the correct business.
6. Enable AI/delivery flags only after worker readiness and outbound message checks. Validate handoff and cross-tenant isolation.
7. Disconnect the test bot and verify Telegram `getWebhookInfo` shows no webhook.

## Rollout blockers
- Without a stable public preview webhook hostname, Connect must fail safely with 'Webhook base URL not configured'.
- The AI worker/delivery flags remain off. A connected bot does not imply automated replies are enabled.
- Existing signup still asks the user to create their initial workspace; full automatic business creation is a separate change.
