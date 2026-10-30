# Courier setup and address labels

Checkpoint: 30 October 2026 (Asia/Dhaka).

## Implemented
- Settings offers Pathao, Steadfast and REDX setup separately for each selected business.
- Current owner/admin membership is checked server-side on every read, write and delete. Agents cannot access setup. The client-provided business ID is never accepted without this membership check.
- Credentials use existing AES-256-GCM encryption, bound to `courier:<business ID>:<provider>`. Only a server service role can access the table; API responses explicitly select non-secret metadata. Never log request bodies or secrets.
- Up to three configurations per workspace, enforced by the business/provider primary key. API credential settings are not booking quota or subscription enforcement.
- Orders have an address-label preview and browser Print / Save as PDF. Name, phone and address are required. Any corrections affect only the current printout. No order mutation, COD assumption, courier tracking, external assets, or artificial barcode.
- Workspace-keyed components clear setup drafts and label state when switching businesses.

## Deployment requirements
- Existing server variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY (32 bytes base64). No NEXT_PUBLIC secret.
- Additive migration `courier_connections_secure_setup` applied to the connected Supabase project; source in database/courier_connections.sql. No existing data or policies changed.
- Intentional RLS-no-policy INFO: this is a server-only table. PUBLIC, anon and authenticated privileges are revoked. API checks authorization before the privileged query.

## Validation
- 75 Node tests passed, including four new tests exercising invalid setup, ciphertext tenant/provider binding and tampering, role/workspace authorization, scoped queries and response redaction.
- TypeScript and Next.js production build passed.
- Live database inspection confirms RLS enabled; anon/authenticated cannot SELECT/INSERT/UPDATE/DELETE; service_role can. No courier credentials or customer data inserted during testing.
- Authenticated browser interaction, physical printer/PDF output and real merchant credentials remain untested.

## Deliberately unfinished
Saved setup is always labelled unverified. There is no courier booking endpoint or tracking sync. Do not present this stage as a working courier integration.

Next work requires verified merchant API contracts (Pathao links to Developer API within its merchant panel), safe connection validation, pickup store/area selectors, explicit COD/weight/quantity review, server-side permissions and usage enforcement, atomic per-order idempotency, and reconciliation for requests whose provider response is lost. Do not retry uncertain bookings automatically. Shipment IDs must be scoped to the same business as their orders and connections. Add tracking polling/webhooks only after signature/authentication verification and sandbox tests.

Official entry points checked:
- https://help.pathao.com/integrate-pathao-panel-with-website/
- https://steadfast.com.bd/business
- https://redx.com.bd/developer-api/

Publication state is recorded in the PR/deployment and final handoff; this note does not claim production release.

## Publication checkpoint
- Implementation commit: 7ff565f on feature/courier-connections-labels, based on verified origin/main d1131db.
- Earlier automatic review blocked publication. The user subsequently explicitly authorized GitHub main publication and Vercel production deployment.
- The additive database table has already been applied and verified. Release is proceeding under that authorization; deployment outcome is recorded in the final handoff and Vercel.
