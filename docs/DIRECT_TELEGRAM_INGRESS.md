# Dashboard-managed Telegram ingress

Production Telegram updates currently enter through the Supabase Edge Function:
`/functions/v1/supportflow-telegram-webhook/{connectionId}`.
Its versioned source is `supabase/functions/supportflow-telegram-webhook/index.ts`.
The Next.js `/api/channels/telegram/{connectionId}` route is an alternative ingress.

The dashboard verifies and connects each bot. The Edge Function checks the per-connection webhook secret hash, resolves the enabled tenant connection, ingests private-chat text idempotently, and enqueues a tenant-scoped AI job when that business has enabled auto reply. Human handoff pauses the conversation and does not enqueue an AI response. Database failures return 503 so Telegram can retry.

Central Supabase pg_cron invokes the existing Vercel AI and delivery workers every 10 seconds when their queues contain pending work. See `database/supportflow_scheduler.sql` and `docs/AI_WORKER_ROLLOUT.md`. No customer-specific GitHub or Vercel setup is needed.

The function verifies Telegram's secret itself, so its Supabase JWT verification remains disabled. Never expose service-role credentials or decrypted bot/API keys to browsers.

Deploy Edge source separately from the Next.js site; a Vercel deploy does not deploy Supabase functions. Run `node --test tests/telegram-edge-webhook.test.mjs` before deployment. Verify actual Telegram webhook URL, job creation, provider completion, outbox delivery, and duplicate handling afterward.
