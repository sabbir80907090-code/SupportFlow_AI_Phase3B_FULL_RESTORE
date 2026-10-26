# Website Chat

Owner setup: Channels → Website Chat → exact HTTPS origin → Enable → copy script before </body>. A www host is a separate origin. Test chat opens a first-party preview. Enabling is opt-in; installation is not performed automatically.

Public site IDs are not credentials. Visitor tokens are random 256-bit values, hashed in the database, expire in 7 days and are scoped to a site. No service key or workflow token is embedded. Browser storage may be unavailable in embedded/private contexts; in that case the session lasts only while the frame is open. New chat resets the visitor's local token, not the team's history. All message text is rendered with textContent. CSP frame-ancestors restricts embedding to the configured origin. This controls embedding, not bots: public endpoints also enforce aggregate database rate limits (30 starts/sends per minute, 500 per day/site; 6 sends/minute/visitor).

Inbound messages and AI enqueue commit atomically. Existing AI settings and worker apply. Human requests pause AI; team manual replies use the existing Inbox RPC. The widget polls every 5 seconds while visible. Website outbox replies are published durably to history on visitor polling, and marked Sent (published), not read. Retrying polling returns stable IDs without duplicate replies. Disabled sites refuse sessions/messages/polling. There is no automatic resend of ambiguous deliveries from other channels.

Text only; no uploads, email capture, typing indicators or notifications. No production site is enabled by deployment. Domains, business privacy notice and actual external embed testing are the owner's next steps. Meta verification is not used.

Validation: npm run build; node --test tests/*.test.mjs; tests/website-chat.sql (transaction rollback). SQL covers visitor isolation, duplicates, manual reply publication, handoff, limits and disabled sites. Apply database/website_chat.sql once through migration tooling. Both new tables have RLS and service-role-only grants; public visitors must use the scoped endpoints.
