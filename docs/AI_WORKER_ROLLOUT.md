# SupportFlow AI worker production rollout

Status: NOT LIVE until main deployment, credentials, gates, and real end-to-end verification succeed.

## Current worker architecture
- GET /api/internal/process-ai-jobs: authenticated by CRON_SECRET; processes queued tenant-scoped jobs using each business's encrypted enabled provider keys.
- GET /api/internal/deliver-support-outbox: authenticated by CRON_SECRET; decrypts per-connection Telegram token and delivers queued replies.
- GET /api/internal/supportflow-readiness: authenticated read-only preflight; does not send a message.
- Both processing and delivery are OFF unless SUPPORTFLOW_NEW_AI_ENABLED=true and SUPPORTFLOW_NEW_DELIVERY_ENABLED=true respectively.

## Scheduled invocation
The GitHub Actions workflow .github/workflows/supportflow-workers.yml invokes both endpoints every five minutes on default branch main only. GitHub schedule timing is best effort and may be delayed; it is NOT real-time. It will not execute while the workflow exists only on a feature branch.

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
- Five-minute polling cannot guarantee immediate replies.
- Worker retry/recovery and concurrency must be load-tested before serving many tenants.
- Do not treat a READY build as proof of successful webhook, AI generation, or message delivery.
