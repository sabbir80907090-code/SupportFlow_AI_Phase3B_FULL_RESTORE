-- Central scheduler; no per-customer infrastructure setup.
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Provision supportflow_worker_cron_secret in Vault separately; never commit its value.
select cron.schedule('supportflow-ai-worker','10 seconds',$job$
 select net.http_get(
  url := 'https://support-flow-ai-phase3-b-full-resto.vercel.app/api/internal/process-ai-jobs',
  headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supportflow_worker_cron_secret')),
  timeout_milliseconds := 65000
 ) where exists(select 1 from public.support_ai_jobs where status='queued');
$job$);
select cron.schedule('supportflow-delivery-worker','10 seconds',$job$
 select net.http_get(
  url := 'https://support-flow-ai-phase3-b-full-resto.vercel.app/api/internal/deliver-support-outbox',
  headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supportflow_worker_cron_secret')),
  timeout_milliseconds := 65000
 ) where exists(select 1 from public.support_outbox where status='queued');
$job$);

