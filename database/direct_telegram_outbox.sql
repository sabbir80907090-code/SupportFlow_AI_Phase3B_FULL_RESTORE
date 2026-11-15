-- Additive migration. Apply only after database/unified_inbox.sql.
-- A central service-role worker claims Telegram replies across businesses without n8n.
-- Other channel replies remain untouched for their own delivery workers.
begin;

create function public.claim_direct_telegram_outbox(p_limit integer default 10)
returns setof public.support_outbox
language sql
security invoker
set search_path = ''
as $$
  update public.support_outbox as item
     set status = 'claimed',
         claimed_at = now(),
         claim_token = gen_random_uuid()
   where item.id in (
     select pending.id
       from public.support_outbox as pending
       join public.support_channel_connections as connection
         on connection.business_id = pending.business_id
        and connection.channel = 'telegram'
        and connection.enabled = true
       join public.support_telegram_credentials as credential
         on credential.connection_id = connection.id
      where pending.channel = 'telegram'
        and pending.status = 'queued'
        and p_limit between 1 and 10
      order by pending.created_at, pending.id
      limit least(p_limit, 10)
      for update of pending skip locked
   )
   returning item.*;
$$;

revoke all on function public.claim_direct_telegram_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_direct_telegram_outbox(integer)
  to service_role;

commit;
