-- SupportFlow AI: retire data stored by the legacy n8n chat-memory/buffer workflow.
-- Explicit owner request on 2026-11-14. Does not touch current support_* or order tables.
-- Preflight confirmed 10 history rows, 15 processed buffer rows, 0 unprocessed.
-- No raw conversation data is copied, exported or preserved by this migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Prevent concurrent writes between the final count check and the deletion.
lock table public.n8n_chat_histories, public.n8n_support_message_buffer
  in access exclusive mode;

do $$
declare v_histories integer;
declare v_buffer integer;
declare v_pending integer;
begin
  select count(*) into v_histories from public.n8n_chat_histories;
  select count(*),count(*) filter(where not processed) into v_buffer,v_pending
    from public.n8n_support_message_buffer;
  if v_histories <> 10 or v_buffer <> 15 or v_pending <> 0 then
    raise exception 'Legacy n8n records changed; no deletion performed (history %, buffer %, pending %)',
      v_histories,v_buffer,v_pending;
  end if;
end $$;

delete from public.n8n_chat_histories;
delete from public.n8n_support_message_buffer;

-- Keep empty table definitions temporarily for diagnosing stale n8n integrations,
-- but block browser/unauthenticated access and all future client-side writes.
alter table public.n8n_chat_histories enable row level security;
alter table public.n8n_support_message_buffer enable row level security;
revoke all on table public.n8n_chat_histories, public.n8n_support_message_buffer
  from public, anon, authenticated;

do $$
begin
  if exists(select 1 from public.n8n_chat_histories)
     or exists(select 1 from public.n8n_support_message_buffer) then
    raise exception 'Legacy n8n deletion verification failed';
  end if;
end $$;
commit;
