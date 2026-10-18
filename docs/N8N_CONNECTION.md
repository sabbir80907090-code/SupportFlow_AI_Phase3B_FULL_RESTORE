# Connect the supplied Customer Support 5.4 workflow

Status: the web app now provides business-scoped order intake, exact channel/sender status lookup, and dashboard approval. The uploaded workflows have been analyzed, not deployed to your n8n account. Keep the original workflows backed up. Do not run the old Google Sheets approval workflow against new Supabase orders.

## Setup

1. Deploy this Next.js app to an HTTPS host; configure `.env.example` variables. The bridge needs Supabase URL, publishable key and server-only service-role key, but does not require Telegram environment variables.
2. Sign in, select the business, then open **Workflow**. Owner/admin can generate a workflow key. A replacement immediately invalidates the previous key.
3. In n8n, save it as an HTTP Header Auth credential: header `Authorization`, value `Bearer sf_...`. Never put it in a client-side chat widget, uploaded JSON, system prompt or public repository. This credential grants order intake and lookup for exactly one business; use a separate credential per business.
4. Add an HTTP Request integration to the order-tool branch after the agent has collected valid details. Use POST `https://YOUR_HOST/api/bridge/orders` with JSON:

```json
{
  "idempotencyKey": "platform-event-id:purchase-1",
  "channel": "telegram",
  "senderId": "platform-sender-id",
  "name": "Customer Name",
  "phone": "01700000000",
  "email": "customer@example.com",
  "address": "Full delivery address",
  "product": "Product, size, colour and quantity"
}
```

`channel` and `senderId` MUST come from the verified platform trigger / Detect Message Type node, never from AI output or customer-supplied identity fields. Preserve Meta signature verification. The current bridge trusts your authenticated n8n server to supply this identity. Use one stable idempotency key per purchase; retries must reuse it, a new purchase must use a new key. The database generates the immutable order number. Remove the old random-ID/collision loop and Google Sheets save step for migrated orders. Do not write the same order to both stores.

The response contains `orderId`, `status`, `duplicate`. Only report a saved order after a successful response. New orders are always pending; input cannot approve them, assign another business or set a price. Prices still need a verified product catalog before adding trusted price calculations.

5. Replace status lookup for migrated orders with GET `/api/bridge/orders?orderId=...&channel=...&senderId=...` using the same credential and verified sender identity. A mismatch returns 404 without contact details. Legacy email/phone fallback is intentionally not enabled; cross-channel requests require staff help.
6. A representative signs into the web app and opens **Workflow** to approve/reject. The database locks each order and allows only one decision while pending. Approval is never performed by GET or by the workflow token. These routes do not yet send approval emails or channel notifications.

## What still needs wiring / implementation

- n8n HTTP Request/AI-tool nodes and actual account testing.
- Unified message ingestion and staff reply delivery.
- Durable notification delivery with idempotent claims, acknowledgement and uncertain-delivery review.
- Per-business settings, Meta onboarding, website widget and visitor rate limiting.
- Voice/image processing and Drive knowledge sync in the app. These remain in the original n8n workflow for now.
- Verified cancellation and email-correction endpoints. Do not let the agent fall back to old Sheets tools for migrated orders.
- Subscription billing and production deployment.

## Findings in the supplied workflow

Main: Telegram/Messenger/WhatsApp -> signature checks where configured -> typed text, voice transcription or image understanding -> message buffer/debounce -> Gemini with vector knowledge and chat memory -> order/status/email/cancellation/handoff tools -> channel reply. A scheduled Drive ingestion branch refreshes vector documents.

Approval: GET validates secret + order and renders confirmation; POST validates again, updates pending order, then emails and sends a channel result. The app keeps human confirmation and pending-only decisions, but uses authenticated business roles instead of a shared query-string secret.

SaaS conversion must add business identity to memory, buffer, vector retrieval and every external account. The existing `channel:senderId` memory key is insufficient for multiple businesses. The prompt also contradicts itself about cancelling confirmed orders; this needs an explicit product rule before implementing cancellation. Existing webhook-trigger verification and delivery semantics must be preserved, not replaced with AI-only instructions.
