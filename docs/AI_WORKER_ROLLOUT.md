# SupportFlow AI worker production rollout

Production repair: 2026-10-25. Supabase Edge ingress now enqueues AI jobs. Supabase pg_cron is the primary scheduler; Vercel hosts the authenticated workers.

## Current worker architecture
- GET /api/internal/process-ai-jobs: authenticated by CRON_SECRET; processes queued tenant-scoped jobs using each business's encrypted enabled provider keys.
- GET /api/internal/deliver-support-outbox: authenticated by CRON_SECRET; decrypts per-connection Telegram token and delivers queued replies.
- GET /api/internal/supportflow-readiness: authenticated read-only preflight; does not send a message.
- Both processing and delivery are OFF unless SUPPORTFLOW_NEW_AI_ENABLED=true and SUPPORTFLOW_NEW_DELIVERY_ENABLED=true respectively.

## Scheduled invocation
Apply database/supportflow_scheduler.sql for the central Supabase pg_cron scheduler. It checks queues every minute and invokes workers only when work exists. Generation and delivery are separate ticks, so replies typically take one to two minutes plus provider time.

Store the worker credential in Supabase Vault under supportflow_worker_cron_secret, matching Vercel CRON_SECRET. Never put the value in SQL committed to Git. Inspect cron.job_run_details and net._http_response for actual HTTP outcomes; a successful cron SQL run alone does not prove worker success.

The GitHub Actions workflow is now manual-only, as an optional fallback. Its previous scheduled runs failed because its production URL and secret were missing.

Set these values through GitHub repository environment **production**, never in source:
- Variable SUPPORTFLOW_WORKER_BASE_URL = verified HTTPS production origin, no trailing slash.
- Secret SUPPORTFLOW_WORKER_CRON_SECRET = same value as Vercel production CRON_SECRET. Never paste the secret into a PR, issue, or log.

Protect the production environment and main branch. Scheduled runs should use reviewed code only. After merge, trigger workflow_dispatch and verify both endpoint calls return successful results. Keep worker flags disabled until preflight and Telegram E2E pass.

## Production prerequisites
- Vercel production SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY must match the key that encrypted existing dashboard-managed credentials, or customers must reconnect securely. Do not rotate by simply replacing the key.
- Vercel production SUPPORTFLOW_PUBLIC_WEBHOOK_BASE_URL must be the full production ingress prefix ending in /api/channels/telegram (not the legacy webhook).
- Confirm Telegram webhook currently points to the intended production URL; a bot already configured to another webhook is deliberately rejected by Connect Bot.
- Verify Supabase migrations, RLS tenant isolation, business ownership, AI opt-in, disabled channel behavior, human handoff, retries, job recovery and limits.
- Run preview build, integration tests and one live non-production Telegram bot E2E before merge.
- Enable SUPPORTFLOW_NEW_AI_ENABLED and SUPPORTFLOW_NEW_DELIVERY_ENABLED in production only after validation.
- Remove legacy bot environment variables only after safe cutover.

## Known limitations to resolve
- One-minute polling cannot guarantee immediate replies.
- Worker retry/recovery and concurrency must be load-tested before serving many tenants.
- Do not treat a READY build as proof of successful webhook, AI generation, or message delivery.

## 2026-10-25 repair findings
- The deployed Supabase webhook previously returned `ai: disabled` unconditionally and never enqueued jobs. Its source is now versioned and tested.
- GitHub's scheduler lacked its URL/secret. The central scheduler now uses Supabase pg_cron and Vault; GitHub remains manual-only.
- Gemini listed `gemini-2.5-flash` but rejected actual generation with HTTP 404 (no longer available to new users). A live generation test succeeded with `gemini-flash-lite-latest`; this is the new dashboard/server default. Existing affected business keys were updated to that verified model.
- Readiness and authenticated worker calls returned HTTP 200. Webhook replay returned duplicate=true without creating another job.
- Secret values are provisioned separately and are not present in the repository.
