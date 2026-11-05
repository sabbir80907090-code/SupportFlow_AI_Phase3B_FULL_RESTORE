# Direct Telegram staff replies without n8n

Status: draft, not deployed. This change preserves the existing Telegram and Messenger integrations and Unified Inbox.

The new server endpoint GET /api/internal/dispatch-telegram uses CRON_SECRET bearer authentication and the opt-in SUPPORTFLOW_DIRECT_TELEGRAM_DISPATCH_ENABLED=true flag. It claims up to ten Telegram staff replies at a time across workspaces through a service-role-only RPC, looks up each workspace's encrypted Telegram bot token, delivers directly to Telegram, and acknowledges the provider message ID.

Claiming is atomic using SKIP LOCKED. Failed or uncertain delivery is marked needs_review. Crashed or unacknowledged claims remain claimed. Never automatically resend them: the provider may have delivered the message.

## Before rollout
1. Apply database/direct_telegram_outbox.sql to staging after database/unified_inbox.sql. No live migration has been applied.
2. Set CRON_SECRET to a strong server-only value and enable SUPPORTFLOW_DIRECT_TELEGRAM_DISPATCH_ENABLED only in staging.
3. Configure a protected server-side scheduler to call the endpoint. This PR does not add a schedule.
4. Test staging bot delivery, duplicate invocations, tenant isolation, disabled connections, timeouts, human handoff, and Inbox status.
5. Review TypeScript/build and live integration results before production deployment. Do not disable the old delivery path until a safe cutover.

This slice handles Telegram staff replies only, not Gemini jobs, Messenger, WhatsApp, or website delivery. Subscription and usage limits, provider policy checks, worker monitoring and operational review UI remain future work. No secrets or customer information should be written to project notes.
