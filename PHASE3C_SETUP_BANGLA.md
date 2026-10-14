# SupportFlow AI — Phase 3C (staging branch)

**Status: Code prepared, NOT deployed, NOT verified against live Supabase.**
This branch is intentionally separate from `main`. The existing Phase 3B
Telegram webhook, Inbox and Gemini AI continue working in production.

## What this first Phase 3C version does

- Customer sends `/order` (or `অর্ডার করতে চাই`) to the Telegram bot.
- Deterministic guided flow collects name, phone, product, quantity and delivery address.
- Customer reviews all fields and types YES to submit or NO to cancel.
- A PostgreSQL transaction creates a customer, a **pending** order and a
  private delivery-address record. No price is invented; total is NULL.
- Owner/admin can review the order in the existing Orders dashboard;
  the new Delivery column displays its address.
- Telegram's repeated webhook updates are deduplicated using a row lock and
  per-chat message ID. Only the service role can call the order RPC.
- Ordinary customer messages still go to Gemini when no order is active.
- The entire order flow is **OFF by default** via a server-only flag.

## Important limitations

- This is a guided order form, **not** Gemini extracting orders from free-form
  conversation. This is intentional: avoids unverified fields and phantom orders.
- This version does not auto-notify Telegram on owner approval/rejection,
  handle payments, check inventory, calculate shipping, or quote prices.
- Only one draft per Telegram chat. Sending `/order` restarts it.
- A Telegram send failure is logged, but not automatically resent to avoid
  duplicate messages. A customer can send `/order` to restart if needed.
- The SQL uses currency BDT with an unknown total; change it to match your
  business policy before deployment.
- Requires the existing Phase 3A and Phase 3B schemas and an `orders` table
  with columns `business_id`, `customer_id`, `product_details`,
  `total_amount`, `currency`, `status`, `order_number`.
- Production deployment should only happen after staging migration,
  local build, security review and end-to-end tests.

## Safe installation order (after code review)

1. Backup the existing Supabase project; keep Vercel production unchanged.
2. In a **staging Supabase copy**, run
   `SupportFlow_AI_Phase3C_Telegram_Orders.sql` in SQL Editor.
3. Deploy this feature branch to a **preview** environment with its own
   Telegram test bot and staging Supabase project. Do not point your live
   Telegram webhook at the preview.
4. Add `TELEGRAM_ORDER_FLOW_ENABLED=true` to the preview server environment.
   The existing server-side Supabase and Telegram keys are still required.
5. Test:
   - `/order` -> name -> phone -> product -> quantity -> address -> YES.
   - One pending order and one delivery record are created.
   - Repeated YES update does not create a second order.
   - NO and /cancel create no order.
   - Non-order messages still get Gemini AI replies.
   - A human cannot see another business's delivery details.
   - Owner/admin can approve or reject, and old Phase 3B Inbox still works.
6. After staging tests pass, plan production migration and a controlled
   deployment. Do not merge this PR before review.

**Security:** Never commit `.env.local`, bot tokens, service-role keys or
Gemini API keys. Do not share those values in chat or screenshots.
