# Automatic AI Model Discovery — 2026-11-16

## Scope
User requested the model picker shown in the BartaCare dashboard to automatically display compatible models for each saved business API key.

## Implemented in feature branch
- Provider-backed discovery for Gemini, OpenAI and Anthropic using each workspace's encrypted server-side key.
- On new key creation, verify the key through model discovery and select a returned recommended model rather than a hard-coded default.
- New authenticated POST /api/ai/keys/models endpoint with workspace-bound key lookup, owner/admin checks, short-lived server cache and explicit refresh.
- Per-key dynamic model list in the existing mobile-friendly dashboard, refresh button, loading/error states and Custom Model ID fallback.
- Existing stored models, priorities, enabled status, ciphertext, AI workers and workspace data are unchanged.
- The OpenAI model-list API does not expose all endpoint capabilities, so filtering is conservative and does not prove generation success.

## Security
- API keys remain encrypted and server-only; discovery never returns raw keys.
- No schema changes or production database writes.
- Agent access to AI key management is denied server-side.
- Cross-workspace model discovery is denied through business_id-qualified lookup.

## Verification and release
- Source review completed against main at 86305293be92da8c047515d16ade31efe62f8559.
- Typecheck, unit tests, build and live provider verification are pending CI/preview checks.
- Feature branch only; no production deployment or database migration.
- Before release: check CI, owner/admin/agent permissions, multiple-workspace isolation, provider failures, custom model fallback, and mobile dropdown usability.

## Mobile picker refinement — 2026-11-16
- Screenshot showed Android native select expanding into a full-screen unsearchable list, including unrelated Gemini image/research/experimental models.
- Replaced native select with mobile bottom-sheet / desktop dialog, search, six suggested choices, Show all, selected-state indicator, clear full model IDs and custom model entry.
- Server-side Gemini discovery now excludes image, audio, research, computer-use and antigravity model families from text support replies.
- No API key, workspace, database or production configuration changes. Existing saved model stays selected until explicit Save Model.
- Pending: CI typecheck, browser/mobile and live provider validation. Preview feature branch only.
