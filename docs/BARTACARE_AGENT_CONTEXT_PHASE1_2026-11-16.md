# BartaCare AI Agent — Context Efficiency Phase 1 (2026-11-16)

## User goals
Improve the internal customer-support AI agent while minimizing each business's own provider-token costs. Each business supplies its own encrypted provider key. Keep existing order confirmation, handoff, workspace isolation and roles.

## Verified starting state
- Main AI worker sends up to 16 recent messages, 12 newest knowledge articles (up to 9000 characters), up to 12 product entries and up to 3 catalog images.
- Business-scoped filters exist for keys, knowledge, products, conversation and order draft.
- Existing order extraction, validation, outbox enqueue, human pause recheck and provider fallbacks are preserved.
- Agent/delivery workers have separate feature flags; do not enable either as part of this change.

## Implemented in feature branch
- Relevant keyword-ranked business knowledge (maximum 4 articles / 4200 characters, broad-query fallback 2 articles).
- Conversation provider context trimmed to latest 8 messages (recent user request preserved); DB fetch remains 12 messages for order text validation.
- Product catalog context reduced to 8 matching items or 3 fallback items; visual images only when requested and maximum 2.
- No new API calls, database migrations, customer data changes, model overrides or shared cross-tenant caches.
- Added deterministic unit tests for knowledge relevance, Bengali, history limits, visual requests and catalog bounds.

## Important limitations
- Keyword relevance is lightweight, not semantic retrieval. Complex follow-ups or synonyms may require a later hybrid search and quality evaluation.
- Trimming history may omit older customer details from the model prompt; existing order draft is still included, and server-side order validation remains authoritative.
- No actual token savings percentage can be claimed without provider usage telemetry and a controlled test corpus.
- No automatic generic FAQ reply cache was introduced; such caching risks incorrect answers or cross-tenant leaks.
- No changes to billing, subscriptions, limits or permissions.

## Release / verification
- Source inspection and added tests completed; CI execution and authenticated E2E have NOT been verified.
- Feature branch only; production database and production deployment unchanged.
- Before release: run npm ci, npm run typecheck, node --test tests/*.test.mjs, npm run build, sample Bangla/Banglish and English customer conversations, owner/admin/agent and workspace isolation, order confirmation, handoff, and token/cost comparisons.
