# BartaCare AI Usage & Cost Dashboard — 2026-11-16

## Request
Owner/Admin should see current money, spent money and tokens for each business-owned AI API key/workspace.

## Verified facts
- Main has an Analytics placeholder; business-owned Gemini/OpenAI/Anthropic API keys are already supported.
- Main AI worker did not persist provider-reported token usage.
- Production Supabase does not yet have support_ai_usage, support_ai_usage_rates or support_ai_usage_budgets.
- API keys generally do NOT grant a portable, provider-agnostic account balance or remaining-token endpoint. Never display a made-up provider wallet balance.

## Prepared changes (feature branch, not deployed)
- New server-side ledger records usageMetadata/usage on each successful model HTTP response, including malformed model output; records only workspace ID, job ID, provider/model, key ID and token counts (no prompts, secrets or customer content).
- New RLS-enabled service-role-only tables and tenant-filtered aggregate RPC in database/bartacare_ai_usage_dashboard.sql.
- Owner/Admin authenticated reporting endpoint and rate/budget settings, explicitly scoped to the requested workspace.
- Mobile-friendly Analytics tab: provider balance unavailable, estimated spend, remaining configured budget, input/output/total tokens, model breakdown and manually entered USD-per-million-token rates.
- Missing usage or missing rate makes cost partial/unknown. Budget targets are NOT enforcement; rate updates recalculate past estimates.
- No new AI provider calls, no API key disclosure, no production changes.

## Limits and risk
- Accurate provider wallet balance and remaining provider quota are not available with generic API keys. Workspace-defined budget remaining is not the provider balance.
- Rates are manually configured and estimates may differ from invoices due to caching, taxes, discounts and provider-specific billing.
- Failed HTTP provider calls may still be billable but usually have no usage response; these are not counted. Pre-existing calls before ledger deployment are not recoverable from this app.
- Usage logging is best effort to protect customer replies; if DB insert fails, dashboard becomes incomplete.
- Provider usage for Anthropic/OpenAI/Gemini needs live integration tests; no provider credentials were used.
- This feature does not enforce subscription or token budget limits; hard limits require atomic reservations, retries and fail-safe controls.

## Required verification and rollout
1. Create isolated staging Supabase database; do not apply migration to shared production to test a Preview.
2. Apply and review SQL, inspect RLS and role permissions, confirm function access is service-role-only.
3. Run npm ci, npm run typecheck, node --test tests/*.test.mjs, npm run build.
4. Test Owner/Admin access, Agent denial, cross-business isolation, mobile widths, no data state, model rates, and budget math.
5. Test actual provider token responses and malformed JSON/retries without exposing secrets.
6. After approvals, deploy database before application; monitor usage ledger and worker errors.
Status: feature branch only; no production deployment, DB migration or live E2E verified.

## Execution update — 2026-11-16
- Production currently has 27 AI jobs, 24 completed; no historical provider token counts are stored, so backfill cannot be exact.
- Staging migration tested; a transaction-scoped 1500-token sample with configured rates produced $0.002 exactly; rolled back all test data.
- Production **additive migration applied** after staging verification: support_ai_usage, support_ai_usage_rates, support_ai_usage_budgets, aggregation RPC. Existing business/order/message/key tables untouched. Verified all three tables exist; authenticated cannot execute aggregation RPC, service_role can; initial ledger rows = 0.
- CI on earlier branch commit failed 2 existing engine mocks because the new logging path calls insert and usage helper; updated test mocks in feature branch. Await rerun before merging.
- Production web application has NOT been deployed or merged. Real token collection starts only after updated worker is released and runs.

## Automatic pricing and simplified UI update — 2026-11-16
- User approved removing manual model pricing from normal Analytics and relocating to Settings → collapsed Advanced AI Pricing.
- Added database/bartacare_auto_pricing_catalog.sql with reviewed standard paid-tier **exact model ID** defaults, source URLs and reviewed dates. Workspace manual rates take precedence. Unknown models stay unpriced; no guessing from model name prefixes or aliases.
- Main Analytics shows usage, budget, model breakdown; advanced form is only accessible to Owner/Admin from Settings.
- Provider-reported resolved model is preferred when available for usage ledger records; no extra provider calls.
- Applied automatic pricing migration to **isolated staging only**. Verified eight default rates, authenticated role cannot read rate table, service_role can. Rollback-only test with 1M input + 1M output for gpt-4.1-mini computed $2.00 correctly.
- This is not a live price feed. Pricing can change, cached tokens, context length tiers, discounts, taxes, free tier and other billable modalities can differ; estimates remain approximate.
- Latest CI run is pending; production default pricing migration and production app deployment NOT performed for this update.

## Analytics read-only UX update — 2026-11-18
- User provided desktop preview screenshot and confirmed Analytics should display financial/token data only, not contain settings.
- Removed Monthly Budget editing from Analytics. Analytics now shows read-only estimated spend, provider balance availability, budget remaining, tokens and model usage.
- Moved monthly budget form to Settings → AI monthly budget; Advanced AI Pricing remains under Settings, both Owner/Admin only.
- Existing business-specific API authorization and budget saving logic preserved. No database migration needed for this UI change.
- CI and Vercel Preview validation pending; not merged or released to production as part of this update.

## AI setup consolidation — 2026-11-18
- User explicitly requested all remaining AI-related settings appear under the existing AI setup screen (shown with AI Auto Reply, Custom AI System Prompt, and API Key Management).
- Moved AI monthly budget and Advanced AI Pricing from generic Settings to the existing AI setup tab. Both remain Owner/Admin-only; provider key management remains Owner-only. Analytics remains read-only.
- No API/database changes. GitHub CI and Vercel Preview still require verification for this commit; production unchanged.

## AI setup read-only summary cards — 2026-11-18
- User requested the same four top-level Analytics cards at the very top of AI setup, above Auto Reply, System Prompt and API keys.
- Added a compact two-column mobile / four-column desktop read-only summary with provider balance availability, estimated spend, workspace budget remaining, and recorded token usage. It reuses the existing owner/admin-authorized business-scoped usage API; no duplicate ledger, billing action or migration.
- Existing full Analytics remains read-only and existing AI setup controls unchanged. Real provider balance remains unavailable where unsupported; budget remaining is explicitly a workspace target.
- Pending CI and Preview visual check; no production deployment performed for this update.

## Simplified AI setup UX — 2026-11-18
- User screenshots show overlong prompt textarea, repeated key/model cards and unclear controls. Refactored the existing AI setup UI, retaining the business-scoped data and existing API endpoints.
- Auto Reply now a compact status/toggle card; optional Business Instructions editor is collapsed by default; connected AI provider key and its model are combined into one expandable card per key. Add key, enable/disable, priority, model save and delete actions preserved.
- Budget and advanced pricing remain collapsed under AI setup; Analytics remains read-only. Mobile-friendly controls have at least 44px touch targets.
- No customer data, provider secrets, database migrations or production deployments modified. CI and Preview visual QA pending.
