-- SupportFlow AI: least-privilege permissions for internal trigger functions.
-- These functions run through PostgreSQL triggers, not as application RPCs.
-- No table rows are inserted, updated or deleted by this migration.
-- Apply separately after review in a controlled database maintenance window.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.audit_order_status()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Read-only verification (run separately):
-- SELECT p.oid::regprocedure AS function_name,
--        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
--        has_function_privilege('authenticated',p.oid,'EXECUTE') AS user_can_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname IN ('audit_order_status','rls_auto_enable');
