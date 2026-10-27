# Chat order intake

The shared Telegram/Messenger/website AI worker collects a single product order, notifies the customer of missing product/quantity/name/Bangladesh mobile/address, and persists a private draft across turns. Optional variant notes (size, colour) are retained. The AI emits internal JSON; the server filters contact details against customer text and checks product IDs against the active tenant catalog. Malformed JSON fails closed rather than creating an order or sending raw JSON.

The server builds the summary and acknowledgement. After the summary is delivered to the channel, the customer must reply `CONFIRM` (also accepts exact yes/হ্যাঁ/কনফার্ম/অর্ডার কনফার্ম/নিশ্চিত). Buying intent by itself never submits an order. Corrections require a fresh summary. `CANCEL` / `বাতিল` clears an unsubmitted draft, and `NEW ORDER` / `নতুন অর্ডার` starts another draft. Unsubmitted drafts expire after 24 hours.

`reply_with_chat_order` is service-role-only, security invoker, with explicit private table grants/RLS. It locks the claimed job and tenant conversation, verifies the current inbound message, enabled AI and handoff state, validates fields, looks up the active tenant product, rechecks price/stock and compares the current snapshot to the delivered summary. Changed prices require consent again. Order/customer inserts and the acknowledgement outbox entry are one transaction. Repeated job calls and fresh repeated confirmations cannot create another order. Catalog price and quantity supply the subtotal; delivery charges are explicitly separate.

Saved orders appear in the existing Orders dashboard with customer name, phone, expandable address, source channel and product/variant. They start **pending**, requiring owner/admin Approve or Reject. Approval notifications, payment collection, stock reservation/deduction, multi-item carts and automatic shipping are not implemented. Do not tell customers that submitting means the shop has approved, payment was received, stock reserved or shipment booked.

## Validation

27 Node tests and production Next.js build pass. The SQL transaction test covers summary-before-consent, undelivered summary rejection, price-change consent, atomic pending order creation, replay and repeated CONFIRM deduplication, conversation separation, insufficient stock, stale jobs, paused AI, draft cancellation, claim-token authentication and no browser access. Test data and outbox rows roll back; no test messages are sent to a customer. Actual provider extraction and Telegram-device conversation remain to be verified with an owner-driven test.

Apply database/support_chat_orders.sql before deploying the worker code. No workflow token is required for native chat orders.
