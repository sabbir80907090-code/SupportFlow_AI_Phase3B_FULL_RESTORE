# SupportFlow — Supabase SaaS foundation

## Workflow order bridge (18 October 2026)

The supplied Customer Support 5.4 MAIN and ORDER APPROVAL workflows were reviewed. A new Workflow dashboard accepts validated orders through a business-scoped server API, prevents duplicate intake, and exposes pending-only staff approval. Apply `database/workflow_orders.sql` after the core/Telegram scripts. See `docs/N8N_CONNECTION.md` for the exact contract and remaining work. The uploaded workflows have not been activated or edited in n8n. No notification messages were sent.

Verification: `npm run typecheck`, `npm run build`, `node --test tests/workflow-input.test.mjs`, and rollback-only `tests/workflow-orders.sql` on Supabase. Browser interaction and real channel delivery remain unverified.

## Current update

- Business-scoped customer and order dashboard with Supabase Auth and row-level security.
- Owner/admin order decisions through authorized RPCs.
- Knowledge Base CRUD, with business facts included in Telegram AI context.
- Channel setup cards clearly distinguish Telegram integration from planned Messenger, WhatsApp and website chat.
- Default order currency: BDT. Dependencies are pinned; no credentials are committed.

## Fresh database setup

Only when SupportFlow tables do not already exist, apply in this order:

1. `database/supportflow_core.sql`
2. `SupportFlow_AI_Phase3A_Telegram_Inbox.sql`
3. `SupportFlow_AI_Phase3B_Gemini.sql`

Do not replay the core bootstrap against an existing SupportFlow database. These scripts do not alter the existing n8n tables. Configure the variables listed in `.env.example` using your hosting provider's environment settings. The Supabase publishable key is for the client; service-role, Telegram and Gemini keys are server-only. Run `npm ci`, `npm run typecheck`, then `npm run build`.

## Release status

This is a foundation, not a complete commercial omnichannel SaaS. Messenger, WhatsApp, the website widget, subscriptions, team invitations and durable AI workers are not implemented. Telegram supports one configured business per server. Live channel delivery and browser workflows still require end-to-end verification. Knowledge articles are reference facts, not live stock or order data.

## Original Telegram setup guide

# SupportFlow AI — Phase 3B: Gemini Telegram Auto Reply (local MVP)

This ZIP is an update to the user's **working Phase 3A project**. It keeps the existing Supabase orders/customers, Telegram webhook, Telegram inbox, and human reply route, and adds an **optional Gemini AI auto-responder**.

**No credentials are included. AI is OFF by default. This package has NOT been tested against your real Telegram, Gemini or Supabase accounts.**

## Features

- Telegram customer text -> existing webhook -> Supabase -> queued AI job -> Gemini -> Telegram -> Supabase Inbox.
- Recent message context (last 16 messages, including customer, AI and human replies).
- AI ON/OFF + editable store instructions from Inbox and AI Agent dashboard tabs (owner/admin only).
- Per-chat `Human mode / Resume AI` control; sending a manual reply pauses AI for that conversation.
- Basic automatic human handoff when a customer explicitly requests a human in English or Bengali.
- Database-enforced unique AI jobs, atomic claims and at most one processing job per chat.
- Avoids sending an older AI answer when a newer customer message arrives.
- Delivery-uncertain jobs are NOT automatically retried (to avoid duplicate Telegram messages).
- Gemini API key remains **server-only**, never sent to the browser.

## Updating a previously configured Telegram installation

1. **Backup** your current `supportflow-ai-phase3a` folder and `.env.local` privately. Do not upload `.env.local` anywhere.
2. Stop the current Next.js terminal (`Ctrl+C`). You can leave ngrok running if it already forwards to port 3000.
3. Extract the ZIP, open its inner `supportflow-ai-phase3a` folder in VS Code (the one containing `package.json`).
4. In **your existing Supabase project**, go to **SQL Editor**. Execute `SupportFlow_AI_Phase3B_Gemini.sql` **once**. Phase 3A's tables must already exist. This migration adds columns and new tables; it does not remove old orders or messages. Check that the SQL completed successfully.
5. Copy your existing private `.env.local` to this project's inner folder, alongside `package.json`. Keep all existing Supabase/Telegram variables. Add:

   ```dotenv
   GEMINI_API_KEY=PASTE_YOUR_PRIVATE_GEMINI_API_KEY_HERE
   GEMINI_MODEL=gemini-2.5-flash
   ```

   **Never** paste the Gemini key in chat, screenshots, source code or a `NEXT_PUBLIC_` variable. Do not add quotes unless needed. If you change `.env.local`, restart `npm run dev`.
6. Open VS Code terminal in the inner project folder and run:

   ```powershell
   npm install
   npm run dev
   ```

7. Open `http://localhost:3000`, log in and select the business matching `TELEGRAM_BUSINESS_ID`. Confirm your existing orders and Telegram messages are still visible.
8. Open **Inbox** or **AI Agent**. Check **Enable automatic Gemini replies**. Optionally enter store instructions. Click **Save AI settings**. This saves the switch to Supabase, not just browser state.
9. Keep `npm run dev` running. Keep **one** ngrok tunnel forwarding to **port 3000** running. If its HTTPS URL changed, rerun `scripts/register-telegram-webhook.ps1` (existing Phase 3A script). If it didn't change and Telegram already works, do not register again.
10. Send a **new** private message to your Telegram bot, such as “Hello, do you ship internationally?” Wait ~5–30 seconds. It should receive an AI response and the dashboard Inbox should show an outbound bubble labelled **Gemini AI**. Gemini does not reply to old messages from before the switch was enabled.
11. Test manual handoff: send a manual reply in Inbox, then send another Telegram message. AI should stay paused for that chat. Click **Human mode · Resume AI** to allow replies to **future** messages again.

## Troubleshooting

- **Telegram messages appear but no AI reply:** check that Phase 3B SQL ran, `GEMINI_API_KEY` exists in `.env.local`, you restarted the dev server, the dashboard AI switch was saved as ON, the chat is not in Human mode, and the Next.js terminal logs do not show Gemini HTTP errors.
- **No Telegram messages arrive:** this is a Phase 3A webhook/ngrok issue. Confirm ngrok points to the same port as `npm run dev` and the registered webhook URL ends with `/api/telegram/webhook`.
- **AI settings error:** run the Phase 3B SQL migration; ensure the logged-in account belongs to the selected business. Only owners/admins can save the global switch.
- **AI did not respond to an earlier message:** expected; enabling AI does not replay history.
- **Gemini 400/404:** verify your selected `GEMINI_MODEL` is available for your API key. Default is `gemini-2.5-flash`.
- **Gemini 429:** check API quota/billing; this MVP does not auto-retry failed generation.
- **Job stuck in `processing`:** an app shutdown during generation can leave it stuck. Inspect `telegram_ai_jobs` and the Telegram chat before manually recovering it. Never blindly retry `needs_review` because Telegram might already have delivered the reply.

## Quick test checklist

- [ ] Existing login, customers, orders, approval and rejection still work.
- [ ] Telegram webhook stores inbound messages exactly once.
- [ ] AI is OFF by default; no auto reply while disabled.
- [ ] Owner/admin can enable AI and save instructions; agent cannot change global AI settings.
- [ ] A NEW message receives exactly one AI reply and an `ai_generated=true` outbound message appears in Supabase.
- [ ] Repeated Telegram webhook delivery does not send duplicate AI replies.
- [ ] Manual reply pauses AI; Resume AI works for future messages.
- [ ] “I want a human” pauses AI.
- [ ] Turning AI OFF stops future AI replies.
- [ ] Incorrect webhook secret returns HTTP 401; unauthenticated settings/handoff POST fails.

## Architecture and limitations

- **Local MVP, not production-ready.** One Telegram bot is mapped to one business per Next.js server. WhatsApp/Messenger are not integrated.
- Uses Next.js `after()` to start background processing after returning the webhook response. This works in local development; **hosting/serverless platforms may limit background execution**. A production release needs a durable independent worker/queue, retry policy and monitoring.
- SQL job states: `queued`, `processing`, `sent`, `skipped`, `failed`, `needs_review`. Generation failures are logged and **not automatically retried**. A process crash can leave a job in `processing` and block that chat's queue until an operator investigates.
- Gemini has access to the last 16 text messages, **not** your store's live order, inventory or customer data. The system prompt explicitly forbids inventing order statuses or prices.
- AI-generated content may be wrong. Review responses, set clear store instructions and enable only after testing.
- A small race is possible if a human pauses AI exactly while the bot is sending. Full transactional handoff requires stronger coordination.
- No autonomous refund, order approval, order edits, payment handling, or inventory updates.
- Never expose Supabase server keys, Telegram tokens, Gemini keys or ngrok's public dev tunnel permanently. Run a security review before production deployment.

For the original Phase 3A instructions, see `README_PHASE3A_ORIGINAL.md`.
