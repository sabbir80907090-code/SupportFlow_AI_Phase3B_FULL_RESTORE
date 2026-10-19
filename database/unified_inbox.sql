begin;
create table public.support_conversations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 channel text not null check(channel in('telegram','messenger','whatsapp','website')),
 sender_id text not null check(length(sender_id) between 1 and 200), display_name text not null default 'Customer',
 ai_paused boolean not null default false, last_message_at timestamptz not null default now(),
 unique(business_id,channel,sender_id),unique(business_id,id)
);
create index support_conversations_recent on public.support_conversations(business_id,last_message_at desc);
create table public.support_messages (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 conversation_id uuid not null, event_id text not null check(length(event_id) between 1 and 200),
 direction text not null check(direction in('inbound','outbound')), text text not null check(length(text) between 1 and 12000),
 kind text not null default 'text' check(kind in('text','voice_transcript','image_description')),
 created_at timestamptz not null default now(),
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade,
 unique(conversation_id,direction,event_id)
);
create index support_messages_conversation on public.support_messages(business_id,conversation_id,created_at);
create table public.support_outbox (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 conversation_id uuid, channel text not null, recipient text not null,
 text text not null check(length(text) between 1 and 4096), request_id uuid not null,
 status text not null default 'queued' check(status in('queued','claimed','sent','needs_review')),
 created_at timestamptz not null default now(), claimed_at timestamptz, finished_at timestamptz,
 claim_token uuid, provider_message_id text,
 unique(business_id,request_id),
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade
);
create index support_outbox_pending on public.support_outbox(business_id,created_at) where status='queued';
create index support_outbox_conversation on public.support_outbox(business_id,conversation_id);
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_outbox enable row level security;
revoke all on public.support_conversations,public.support_messages,public.support_outbox from public,anon,authenticated;
grant select on public.support_conversations,public.support_messages to authenticated;
grant select(id,business_id,conversation_id,channel,recipient,text,request_id,status,created_at,claimed_at,finished_at,provider_message_id) on public.support_outbox to authenticated;
grant all on public.support_conversations,public.support_messages,public.support_outbox to service_role;
create policy support_conversation_read on public.support_conversations for select to authenticated using(business_id in(select business_id from public.business_members where user_id=(select auth.uid())));
create policy support_message_read on public.support_messages for select to authenticated using(business_id in(select business_id from public.business_members where user_id=(select auth.uid())));
create policy support_outbox_read on public.support_outbox for select to authenticated using(business_id in(select business_id from public.business_members where user_id=(select auth.uid())));

create function public.ingest_support_message(p_business_id uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare conv public.support_conversations; mid uuid;
begin
 if coalesce(p_input->>'channel','') not in('telegram','messenger','whatsapp','website') or length(coalesce(p_input->>'senderId','')) not between 1 and 200 or
 length(coalesce(p_input->>'eventId','')) not between 1 and 200 or length(trim(coalesce(p_input->>'text',''))) not between 1 and 12000 or
 coalesce(p_input->>'direction','') not in('inbound','outbound') or coalesce(p_input->>'kind','text') not in('text','voice_transcript','image_description') then raise exception 'Invalid message'; end if;
 insert into public.support_conversations(business_id,channel,sender_id,display_name)
 values(p_business_id,p_input->>'channel',p_input->>'senderId',left(coalesce(nullif(p_input->>'displayName',''),'Customer'),160))
 on conflict(business_id,channel,sender_id) do update set sender_id=excluded.sender_id returning * into conv;
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,kind)
 values(p_business_id,conv.id,p_input->>'eventId',p_input->>'direction',p_input->>'text',coalesce(p_input->>'kind','text'))
 on conflict(conversation_id,direction,event_id) do nothing returning id into mid;
 if mid is not null then update public.support_conversations set last_message_at=now() where id=conv.id; end if;
 return jsonb_build_object('conversationId',conv.id,'duplicate',mid is null,'aiPaused',conv.ai_paused);
end $$;
revoke all on function public.ingest_support_message(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_support_message(uuid,jsonb) to service_role;

create function supportflow_private.queue_support_reply(p_conversation_id uuid,p_text text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare conv public.support_conversations; oid uuid;
begin
 select * into conv from public.support_conversations where id=p_conversation_id for update;
 if auth.uid() is null or not found or not exists(select 1 from public.business_members where business_id=conv.business_id and user_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if length(trim(coalesce(p_text,''))) not between 1 and 4096 or p_request_id is null then raise exception 'Invalid reply'; end if;
 select id into oid from public.support_outbox where business_id=conv.business_id and request_id=p_request_id;
 if found then return oid; end if;
 insert into public.support_outbox(business_id,conversation_id,channel,recipient,text,request_id)
 values(conv.business_id,conv.id,conv.channel,conv.sender_id,trim(p_text),p_request_id) returning id into oid;
 update public.support_conversations set ai_paused=true where id=conv.id;
 return oid;
end $$;
revoke all on function supportflow_private.queue_support_reply(uuid,text,uuid) from public,anon;
grant execute on function supportflow_private.queue_support_reply(uuid,text,uuid) to authenticated;
create function public.queue_support_reply(p_conversation_id uuid,p_text text,p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$select supportflow_private.queue_support_reply(p_conversation_id,p_text,p_request_id)$$;
revoke all on function public.queue_support_reply(uuid,text,uuid) from public,anon;
grant execute on function public.queue_support_reply(uuid,text,uuid) to authenticated;

create function public.claim_support_outbox(p_business_id uuid) returns setof public.support_outbox language sql security invoker set search_path='' as $$
 update public.support_outbox set status='claimed',claimed_at=now(),claim_token=gen_random_uuid()
 where id in(select id from public.support_outbox where business_id=p_business_id and status='queued' order by created_at limit 10 for update skip locked) returning *;
$$;
revoke all on function public.claim_support_outbox(uuid) from public,anon,authenticated;
grant execute on function public.claim_support_outbox(uuid) to service_role;

create function public.ack_support_outbox(p_business_id uuid,p_id uuid,p_claim_token uuid,p_sent boolean,p_provider_id text) returns boolean language plpgsql security invoker set search_path='' as $$
declare item public.support_outbox;
begin
 select * into item from public.support_outbox where business_id=p_business_id and id=p_id and claim_token=p_claim_token for update;
 if not found then return false; end if;
 if item.status<>'claimed' then return item.status=case when p_sent then 'sent' else 'needs_review' end; end if;
 if p_sent and length(trim(coalesce(p_provider_id,''))) not between 1 and 200 then raise exception 'Provider message ID required'; end if;
 update public.support_outbox set status=case when p_sent then 'sent' else 'needs_review' end,provider_message_id=p_provider_id,finished_at=now() where id=item.id;
 if p_sent and item.conversation_id is not null then
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text)
 values(item.business_id,item.conversation_id,'outbox:'||item.id::text,'outbound',item.text) on conflict do nothing;
 update public.support_conversations set last_message_at=now() where id=item.conversation_id;
 end if;
 return true;
end $$;
revoke all on function public.ack_support_outbox(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ack_support_outbox(uuid,uuid,uuid,boolean,text) to service_role;
create function supportflow_private.set_support_pause(p_conversation_id uuid,p_paused boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_paused is null or not exists(select 1 from public.support_conversations c join public.business_members m on m.business_id=c.business_id where c.id=p_conversation_id and m.user_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.support_conversations set ai_paused=p_paused where id=p_conversation_id;
end $$;
revoke all on function supportflow_private.set_support_pause(uuid,boolean) from public,anon;
grant execute on function supportflow_private.set_support_pause(uuid,boolean) to authenticated;
create function public.set_support_pause(p_conversation_id uuid,p_paused boolean) returns void language sql security invoker set search_path='' as $$select supportflow_private.set_support_pause(p_conversation_id,p_paused)$$;
revoke all on function public.set_support_pause(uuid,boolean) from public,anon;
grant execute on function public.set_support_pause(uuid,boolean) to authenticated;
commit;
