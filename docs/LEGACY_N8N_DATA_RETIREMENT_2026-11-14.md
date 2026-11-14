# Legacy n8n data retirement — 2026-11-14

## Scope and explicit authorization
User asked to delete old n8n data from SupportFlow AI. Only two identified legacy tables were targeted: `public.n8n_chat_histories` and `public.n8n_support_message_buffer`. No current workspace-scoped support conversation, message, outbox, business, or order tables were targeted.

## Pre-deletion checks
- `n8n_chat_histories`: 10 records.
- `n8n_support_message_buffer`: 15 records, all `processed=true`, latest created 2026-10-09.
- No related foreign keys, noninternal triggers, database functions, views, publication entries, or cron commands referencing those tables were identified.
- Code repository had no direct identified references to the table names. An externally hosted n8n workflow may still access the tables; it cannot be completely ruled out from the current repository/database inspection.
- Previously both tables had RLS off and broad `anon` and `authenticated` access.

## Executed production migration
- Supabase project: `rpsesxoatdydmuaqfwqq`.
- Migration: `retire_legacy_n8n_data_20261114`, version `20261114095720`.
- A single transaction took locks, required the exact prechecked row counts and zero unprocessed buffer records, deleted the 10+15 records, enabled RLS on both emptied tables, and revoked table access from `public`, `anon` and `authenticated`.
- The empty table schemas were intentionally retained as a compatibility/debugging measure; no destructive DROP TABLE was performed.
- No separate record-level backup was exported or retained; deleted records should not be described as recoverable from this change. Provider backups/PITR may exist, but were not independently verified.

## Post-change checks
- Both legacy tables have zero records.
- RLS enabled for both.
- `anon` and `authenticated` SELECT/INSERT privileges both false; privileged `service_role` can still access those empty tables.
- Core table counts: 2 conversations, 60 messages, 30 outbox records, 2 businesses. No core table records intentionally changed.
- Supabase Security Advisor no longer lists either table as `rls_disabled_in_public`. It lists them as `rls_enabled_no_policy` INFO, expected for intentionally inaccessible tables.

## Remaining considerations
- If an old external n8n workflow still writes through `anon` or `authenticated`, it will now fail (intentional retirement); if it uses a privileged server role, it may recreate entries. Confirm external n8n workflows are disabled or cut over separately.
- No app source runtime changes were required. This is a live **production database** change, not a new frontend deployment.
- No credentials or private customer message contents are copied into this note.
