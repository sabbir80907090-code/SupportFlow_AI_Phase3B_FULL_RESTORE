# Browser + AI product import

Owners paste a URL in Products. Standard reading runs first; an unreadable page, empty result, network failure or server failure triggers one Browser + AI attempt when the service is configured. Authentication, permission, invalid-request and quota responses do not trigger that retry. Progress text identifies the current stage. It sends the supplied public HTTPS URL to Firecrawl v2 Scrape, which renders the page and extracts products with a JSON schema. The fallback uses a separate endpoint from the standard HTML parser; no domain adapter is required by this path.

## Configuration

- Apply `supabase/migrations/20261029042155_browser_import_quota.sql` before enabling the feature.
- Recommended: configure `FIRECRAWL_API_KEY` as a server-only secret in Vercel for the desired environment, then redeploy. Never use a NEXT_PUBLIC variable or commit the key.
- Limited trial: `FIRECRAWL_ALLOW_ANONYMOUS=true` explicitly permits Firecrawl's anonymous endpoint. This is enabled only for the feature branch preview. Availability and provider limits can change; use an account/key for dependable production operation. No key is returned to the client.
- The current function budget is 60 seconds; provider timeout 40 seconds, HTTP timeout 45 seconds, client timeout 55 seconds. Requires a hosting plan supporting the configured duration.

## SaaS and data handling

- Existing owner authentication resolves the business server-side; request-supplied business IDs are ignored.
- A service-only, RLS-enabled table atomically limits each business to 2 attempts per minute and 20 per UTC day. Failed provider requests count as attempts. No product/customer data is stored in this quota table.
- The target URL is sent to Firecrawl. No account cookies, customer records, database keys or business credentials are forwarded to the target website. No persistent browser profile or browser actions are requested. Basic proxy mode is explicit; no enhanced-proxy retries or challenge solving.
- Public HTTPS and DNS checks run before the request; remote renderer network/redirect isolation remains Firecrawl's responsibility. Existing pinned-fetch protection remains on image downloads and the standard importer.
- Only one page is processed. No automatic pagination, infinite-scroll traversal, linked-product-detail crawl, login or CAPTCHA access.
- JSON model output is untrusted. Up to 100 drafts are normalized and checked against returned markdown evidence. Source URLs must appear in the page and belong to the input origin; unknown descriptions, links and ambiguous price/currency are discarded. Stock is always left blank for review. Evidence matching reduces hallucinations but does not prove prices or details are correct.
- Browser results default to inactive; the owner reviews and explicitly enables them if appropriate. Nothing is saved until Add selected. The existing tenant-bound batch save path is reused.
- Saved-HTML import and standard import remain available when the service is unavailable. This does not guarantee support for every website.

## Verification

- Provider requests against Star Tech page 2 returned 20 normalized products, including descriptions and image URLs.
- A separate JavaScript/Ajax storefront test returned six normalized products, without a site adapter. Dollar-only currency was deliberately left blank.
- Unit tests cover authentication, quota denial, public address rejection, bounded response sizes, safe errors, evidence validation, unknown stock and model-invented links.
- Quota SQL checked in a rollback-only transaction (minute/day denial and reset); authenticated clients cannot read or invoke it, service_role can.
- Actual authenticated app import/save must still be checked before production release. The two provider tests did not create any product records.

Provider docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape and https://docs.firecrawl.dev/features/llm-extract

Automatic fallback validation: six orchestration tests cover standard success without browser cost, fallback, authorization/quota stops, unavailable service, provider failure and empty browser results. All 41 import tests, TypeScript and the production build pass. Authenticated UI/save testing remains pending.
