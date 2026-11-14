-- SupportFlow AI: additive Smart Inbox Priority + Human Handoff migration.
-- Apply only after database/unified_inbox.sql, on an approved staging database first.
-- DOES NOT run automatically. Existing conversations/messages remain untouched.
begin;

alter table public.support_conversations
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz;

-- Backfill timestamps from actual message history; timestamps, not read receipts.
with activity as (
  select business_id, conversation_id,
         max(created_at) filter(where direction='inbound') as incoming,
         max(created_at) filter(where direction='outbound') as outgoing
  from public.support_messages group by business_id, conversation_id
)
update public.support_conversations c
set last_inbound_at = case when a.incoming is null then c.last_inbound_at
                          else greatest(coalesce(c.last_inbound_at,a.incoming),a.incoming) end,
    last_outbound_at = case when a.outgoing is null then c.last_outbound_at
                           else greatest(coalesce(c.last_outbound_at,a.outgoing),a.outgoing) end
from activity a where c.business_id=a.business_id and c.id=a.conversation_id;

-- Existing message ingestion, AI sends and outbox acknowledgements all insert
-- support_messages. A trigger keeps priority metadata correct without changing workers.
create or replace function supportflow_private.track_support_message_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.support_conversations
  set last_inbound_at = case when new.direction = 'inbound'
      then greatest(coalesce(last_inbound_at,new.created_at),new.created_at) else last_inbound_at end,
      last_outbound_at = case when new.direction = 'outbound'
      then greatest(coalesce(last_outbound_at,new.created_at),new.created_at) else last_outbound_at end
  where business_id = new.business_id and id = new.conversation_id;
  return new;
end $$;
revoke all on function supportflow_private.track_support_message_activity() from public,anon,authenticated;
drop trigger if exists support_message_activity on public.support_messages;
create trigger support_message_activity
  after insert on public.support_messages for each row
  execute function supportflow_private.track_support_message_activity();

-- Reuse the existing authenticated RPC so older clients continue to work.
-- An agent may take an unclaimed chat, but may not steal a teammate's chat.
-- Owner/Admin can explicitly take over or release an assigned conversation.
create or replace function supportflow_private.set_support_pause(
  p_conversation_id uuid, p_paused boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.support_conversations;
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null or p_paused is null then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into v_conv from public.support_conversations
    where id=p_conversation_id for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select role into v_role from public.business_members
    where business_id=v_conv.business_id and user_id=v_uid;
  if v_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if v_conv.assigned_to is not null and v_conv.assigned_to <> v_uid
     and v_role not in ('owner','admin') then
    raise exception 'Another teammate owns this chat' using errcode='42501';
  end if;
  update public.support_conversations
  set ai_paused=p_paused,
      assigned_to=case when p_paused then v_uid else null end
  where id=v_conv.id and business_id=v_conv.business_id;
end $$;
revoke all on function supportflow_private.set_support_pause(uuid,boolean)
  from public,anon;
grant execute on function supportflow_private.set_support_pause(uuid,boolean)
  to authenticated;

-- A manual reply automatically claims an unclaimed chat and pauses AI.
-- If another agent owns it, an ordinary reply cannot override that assignment.
create or replace function supportflow_private.queue_support_reply(
  p_conversation_id uuid, p_text text, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.support_conversations;
  v_uid uuid := auth.uid();
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_conv from public.support_conversations
    where id=p_conversation_id for update;
  if not found or not exists (
    select 1 from public.business_members
    where business_id=v_conv.business_id and user_id=v_uid
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  if length(trim(coalesce(p_text,''))) not between 1 and 4096
     or p_request_id is null then raise exception 'Invalid reply'; end if;
  select id into v_existing from public.support_outbox
    where business_id=v_conv.business_id and request_id=p_request_id;
  if found then return v_existing; end if;
  if v_conv.assigned_to is not null and v_conv.assigned_to <> v_uid then
    raise exception 'Another teammate owns this chat. Ask an admin to transfer it.'
      using errcode='42501';
  end if;
  insert into public.support_outbox(
    business_id,conversation_id,channel,recipient,text,request_id
  ) values (
    v_conv.business_id,v_conv.id,v_conv.channel,v_conv.sender_id,
    trim(p_text),p_request_id
  ) returning id into v_existing;
  update public.support_conversations set ai_paused=true,assigned_to=v_uid
    where id=v_conv.id and business_id=v_conv.business_id;
  return v_existing;
end $$;
revoke all on function supportflow_private.queue_support_reply(uuid,text,uuid)
  from public,anon;
grant execute on function supportflow_private.queue_support_reply(uuid,text,uuid)
  to authenticated;

-- These columns use the existing workspace-scoped SELECT policy; no browser
-- UPDATE grant is added. Mutation stays in membership-checked RPCs.
commit;
