-- Requires the existing pg_cron, pg_net and worker secret setup.
-- Set bartacare_push_worker_url in Vault to the approved deployment's HTTPS
-- /api/internal/deliver-inbox-push URL before scheduling.
select cron.schedule('bartacare-inbox-push','10 seconds',$job$
 select net.http_post(url:=u.decrypted_secret, body:='{}'::jsonb,
  headers:=jsonb_build_object('Authorization','Bearer '||s.decrypted_secret),
  timeout_milliseconds:=30000)
 from vault.decrypted_secrets u, vault.decrypted_secrets s
 where u.name='bartacare_push_worker_url' and s.name='supportflow_worker_cron_secret'
 and exists(select 1 from public.inbox_push_queue where due_at<=now());
$job$);
