# AI worker rollout checklist (not yet deployed)
New route: GET /api/internal/process-ai-jobs
Authentication: Authorization: Bearer <CRON_SECRET>, where CRON_SECRET is a random server-only secret >=24 characters.
Schedule with a trusted external scheduler or Vercel Cron where supported by your plan. A scheduled invocation is required: jobs do NOT run themselves.

Required server-side environment:
- NEXT_PUBLIC_SUPABASE_URL (public URL only)
- SUPABASE_SERVICE_ROLE_KEY (secret; never NEXT_PUBLIC)
- GEMINI_API_KEY (secret)
- GEMINI_MODEL (optional; defaults to gemini-2.5-flash)
- CRON_SECRET (secret)
- SUPPORTFLOW_TELEGRAM_WEBHOOK_SECRETS (per-connection JSON map, see DIRECT_TELEGRAM_INGRESS.md)

Flow: verified Telegram webhook -> ingest_support_message -> enqueue_support_ai_job -> authorized worker -> Gemini -> support_outbox.
The worker does NOT send provider messages. Outbox delivery needs a separate audited worker before live replies.

Safety gates before deployment:
1. Verify npm ci, npm run typecheck and npm run build on development branch.
2. Confirm API and database schema contract matches support_outbox and support_messages.
3. Confirm bot ownership, webhook secret, enabled channel connection and per-business AI opt-in.
4. Verify human-handoff commands pause AI and stop generation; current new ingress has not implemented handoff commands.
5. Test cross-business isolation, replay, rate limits, retry of crashed jobs, and quota controls.
6. Configure worker schedule and provider outbox delivery, then test a non-production Telegram bot.
7. Promote to main only after passing checks. Current production Vercel deployment is untouched.

Known limitations:
- Job claim does not yet recover stuck processing jobs; operator must review/requeue them.
- AI processor currently uses a global GEMINI_API_KEY and simple business-scoped knowledge lookup.
- AI processing must remain disabled until the handoff/opt-in and delivery controls are complete.
- Vercel integration credentials and deployment status have not been inspected.
