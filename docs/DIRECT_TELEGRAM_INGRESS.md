# Direct Telegram ingress (experimental; disabled by default)

New endpoint: `POST /api/channels/telegram/{connectionId}`.

## Prerequisites
1. Apply `database/n8n_free_channel_connections.sql` to a **staging** Supabase database after the core schema and `database/unified_inbox.sql`.
2. Create a `support_channel_connections` row on the server for a verified Telegram bot, with `channel='telegram'`, its correct `business_id` and `enabled=true`. Do not enable connections from untrusted client input.
3. Set `SUPPORTFLOW_TELEGRAM_WEBHOOK_SECRETS` **server-side** to JSON mapping connection UUIDs to random secrets of at least 16 characters, e.g. `{"<connection-uuid>":"<random-secret>"}`. Never commit real values.
4. Register that bot's webhook with Telegram using the endpoint URL and its matching `secret_token`. Telegram permits one webhook URL per bot; do not replace a production webhook without an approved cutover plan.

The route checks the header with constant-time comparison, bounds the payload, looks up the enabled business-scoped connection, and inserts private-chat text into `ingest_support_message` using a stable message ID. Duplicate events are not inserted twice.

## Limitations
- **Inbound only**: no AI generation, outbox delivery, attachment handling or worker execution yet.
- No browser-facing connection-management API; connections must be provisioned by a trusted operator.
- Telegram webhook secret is an authentication factor, not proof of bot ownership. Verify bot ownership during provisioning and restrict secrets to that bot.
- Only Telegram private-chat text messages are supported; other updates are acknowledged and ignored.
- The legacy `/api/telegram/webhook` endpoint is unchanged. No live traffic was migrated.
- Requires staging tests for valid/invalid secrets, cross-tenant isolation, duplicate updates and database failures before use.
