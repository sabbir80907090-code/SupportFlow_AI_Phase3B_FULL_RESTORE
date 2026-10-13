# SupportFlow AI — Phase 3C audit (2026-10-14)

Scope: read-only production Supabase review and GitHub feature-branch source review.
Production project: SupportFlow AI (Tokyo). No production data changes were made.

## Verified
- Production Supabase project reports ACTIVE_HEALTHY.
- Phase 3C tables `public.telegram_order_drafts` and `public.order_delivery_details` exist.
- Both Phase 3C tables have RLS enabled.
- `telegram_order_drafts` has no RLS policy and no SELECT privilege for `anon` or `authenticated`. Service role can read it. This is intentionally private, not a missing customer-facing policy.
- `order_delivery_details` has one authenticated read policy (membership-based); `anon` has no SELECT privilege.
- `public.handle_telegram_order_message(uuid,uuid,bigint,text)` is SECURITY DEFINER with an empty search_path; `anon` and `authenticated` cannot execute it, while `service_role` can.
- All 11 public application tables checked have RLS enabled.
- Phase 3C application code is feature-flagged off unless `TELEGRAM_ORDER_FLOW_ENABLED=true`.
- The feature branch is separate from production main.

## Security findings still open
- Supabase Security Advisor flags `public.audit_order_status()` and `public.rls_auto_enable()` as callable by anon/authenticated. They are internal trigger/event-trigger functions; restrict their EXECUTE privileges after controlled review. A proposed SQL migration is in `SupportFlow_AI_Security_Hardening.sql`.
- Supabase Auth leaked-password protection is disabled; requires Auth dashboard configuration, not an SQL change.
- The Security Advisor reports `telegram_order_drafts` has RLS but no policy. This is consistent with its service-role-only design; do not add a public policy to silence the lint.
- Supabase Performance Advisor lists nine foreign keys without covering indexes. Prioritize after measuring real query volume; do not create unnecessary indexes in production solely to clear informational warnings.

## Deployment blockers / not yet tested
- A successful Vercel Preview build is not an end-to-end Telegram test.
- The Preview environment may be pointed at the production Supabase project; do not create test orders or new accounts there without isolation.
- Staging Supabase + separate Telegram test bot required for safe end-to-end order flow tests.
- Do not switch the production Telegram webhook to Preview.
- Production database hardening migration has NOT been applied. An earlier attempt was blocked by tool safety checks.
- No permission is inferred to merge, deploy, delete records, or change the production webhook.

## Required end-to-end test cases (staging only)
1. Start /order, supply name, phone, product, quantity, address, YES. Exactly one pending order + delivery record.
2. Repeat the same webhook message_id; verify no duplicate order.
3. NO and /cancel create no order.
4. Non-order message follows Phase 3B Gemini AI reply path.
5. Human handoff still pauses AI.
6. Owner/admin can review and decide order; unrelated business cannot read address.
7. Telegram delivery failure: verify how the customer recovers (the current handler logs failure but cannot guarantee prompt delivery).

No user secrets, tokens, or personal order data are included in this audit.
