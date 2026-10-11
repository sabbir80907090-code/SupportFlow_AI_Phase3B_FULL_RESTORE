# SupportFlow AI — Phase 3A: Telegram Inbox (Local Development MVP)

**Adds Telegram text-message reception, a real Supabase-backed Inbox, and manual replies to the working Phase 2 app.** All Phase 2 features (login, customers, orders, approval, rejection, audit history) remain.

This is **NOT** yet an AI auto-responder or a production-ready multi-tenant Telegram platform. In this iteration **one Telegram bot is mapped to one business per deployed server** using `TELEGRAM_BUSINESS_ID`. WhatsApp, Messenger, AI, reporting, customer auto-linking, attachment support, and production security hardening are not included.

## Files

- `SupportFlow_AI_Phase3A_Telegram_Inbox.sql` — additional tables, indexes, RLS policies. Run against your EXISTING Phase 2 Supabase project. It does not drop Phase 2 tables.
- `app/api/telegram/webhook/route.ts` — receives private-chat text messages from Telegram after validating the webhook secret.
- `app/api/telegram/reply/route.ts` — validates Supabase login and business membership, sends a Telegram reply, stores the sent message.
- `components/telegram-inbox.tsx` — Inbox UI with conversations, messages and manual replies.
- `scripts/register-telegram-webhook.ps1` — registers a public HTTPS webhook URL with Telegram.

## Windows setup (keep your existing database and account)

1. **Stop the old dev server** with `Ctrl + C` in its PowerShell window.
2. Extract the new ZIP. Open the inner folder `supportflow-ai-phase3a` containing `package.json`.
3. Open Supabase **SQL Editor**, paste `SupportFlow_AI_Phase3A_Telegram_Inbox.sql` from the ZIP, then click **Run**. Verify `telegram_conversations` and `telegram_messages` exist in Table Editor.
4. **Copy** your working Phase 2 `.env.local` into the new `supportflow-ai-phase3a` folder. Keep its two `NEXT_PUBLIC_` lines. Add the FOUR server-only variables below (do not delete your existing lines):

   ```dotenv
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SECRET_OR_SERVICE_ROLE_KEY
   TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
   TELEGRAM_WEBHOOK_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_16_CHARS
   TELEGRAM_BUSINESS_ID=YOUR_BUSINESS_UUID
   ```

   - Supabase server secret: **Project Settings → API Keys → Secret key** (`sb_secret_...`) or legacy `service_role` key. This key bypasses RLS, so **never** put it in a `NEXT_PUBLIC_` variable, frontend, screenshots, or GitHub.
   - `TELEGRAM_BUSINESS_ID`: copy the `id` of your existing **SupportFlow Demo Store** row from Supabase **Table Editor → businesses** (UUID, not the business name).
   - Create a Telegram bot using Telegram's official **@BotFather**. Copy the bot token privately into `.env.local`.
   - Generate a webhook secret using PowerShell: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))` (48 hex chars). Telegram allows A–Z, a–z, 0–9, `_`, `-` in secret tokens.
   - `.env.local` is ignored by Git in this project. Never share it with anyone.
5. In the **new project folder** run:

   ```powershell
   npm install
   npm run dev
   ```

   Visit `http://localhost:3000` and log in with your **existing Supabase account**. Your old customers and orders should still be there. Inbox will be empty until a webhook is connected.
6. Telegram cannot send webhooks to `localhost`. For **local testing only**, start a **public HTTPS tunnel** pointing to port 3000, for example with ngrok (`ngrok http 3000`) or Cloudflare Tunnel. The tunnel URL must reach your running Next.js app. Treat the exposed dev server as temporary and stop the tunnel after testing.
7. In a separate PowerShell window opened in the new project folder run:

   ```powershell
   .\scripts\register-telegram-webhook.ps1
   ```

   Paste the **public HTTPS tunnel base URL** when prompted. The script registers `/api/telegram/webhook` with Telegram and configures your webhook secret. If PowerShell blocks local scripts, you may need to allow local scripts according to your machine's policy; do not change system-wide execution policy just for this app.
8. Open your bot in Telegram and send **Hello** in a private chat. Open SupportFlow AI → **Inbox**; the message should appear within ~8 seconds. Select the chat and send a manual reply.

## Test checklist

- [ ] Phase 2 orders/customers still visible after login.
- [ ] Telegram private message creates exactly one conversation and message in Supabase.
- [ ] Repeated delivery of the same Telegram message does not create duplicate messages.
- [ ] Inbox shows message after refresh; manual reply reaches Telegram and appears in Inbox.
- [ ] Unauthenticated requests to `/api/telegram/reply` are rejected.
- [ ] Invalid webhook secret returns 401.
- [ ] Switching to a different business does not expose another business's messages (RLS).

## Security notes / limitations

- **Server-only** Supabase secret/service role key bypasses RLS. Keep it in `.env.local` on your own machine or a secure deployment secret store; do not expose the dev server as a permanent public service.
- Telegram validates the webhook via `X-Telegram-Bot-Api-Secret-Token` (checked using constant-time comparison).
- Inbox reads are protected by existing Supabase Auth and business-membership RLS. Replies require a valid Supabase access token and business membership checked server-side.
- Only Telegram private **text** messages are ingested. Attachments, voice, media, edits, callbacks and group chats are ignored.
- Message replies are sent first, then stored. If Telegram succeeds but DB write fails, the app warns not to retry automatically because doing so can send a duplicate reply.
- Basic polling every 8 seconds; no realtime subscription or pagination beyond the latest 100 conversations/messages.
- This MVP uses one bot/business per server; proper multi-business deployments need per-business credential storage, webhook routing, encryption, secret rotation and stronger auditing.
- No automated AI replies, so it will **not** answer customers on its own yet.
- Code was prepared and statically reviewed, but **not tested with a real Telegram bot or your live Supabase instance**. Perform the test checklist before relying on it.
