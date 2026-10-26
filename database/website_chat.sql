begin;
create table public.support_websites (
 id uuid primary key default gen_random_uuid(), business_id uuid not null unique references public.businesses(id) on delete cascade,
 origin text not null, enabled boolean not null default true,
 minute_at timestamptz not null default now(), minute_count integer not null default 0,
 day_at date not null default current_date, day_count integer not null default 0
);
create table public.support_website_visitors (
 id uuid primary key default gen_random_uuid(), site_id uuid not null references public.support_websites(id) on delete cascade,
 token_hash text not null unique, expires_at timestamptz not null default now()+interval '7 days',
 minute_at timestamptz not null default now(), minute_count integer not null default 0
);
alter table public.support_websites enable row level security;
alter table public.support_website_visitors enable row level security;
revoke all on public.support_websites, public.support_website_visitors from public,anon,authenticated;
grant all on public.support_websites, public.support_website_visitors to service_role;
create function public.website_chat(p_site uuid,p_hash text,p_action text,p_text text default '',p_event text default '',p_handoff boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.support_websites; v public.support_website_visitors; c uuid; mid uuid; r jsonb; item public.support_outbox; result jsonb;
begin
 select * into s from public.support_websites where id=p_site and enabled for update;
 if not found then raise exception 'Chat unavailable'; end if;
 if p_action='start' then
  if length(p_hash)<>64 then raise exception 'Invalid session'; end if;
 else
  select * into v from public.support_website_visitors where site_id=s.id and token_hash=p_hash and expires_at>now() for update;
  if not found then raise exception 'Session expired'; end if;
 end if;
 if p_action in ('start','send') then
  if s.minute_at<now()-interval '1 minute' then s.minute_at=now();s.minute_count=0;end if;
  if s.day_at<>current_date then s.day_at=current_date;s.day_count=0;end if;
  if s.minute_count>=30 or s.day_count>=500 then raise exception 'Chat rate limit reached';end if;
  update public.support_websites set minute_at=s.minute_at,minute_count=s.minute_count+1,day_at=s.day_at,day_count=s.day_count+1 where id=s.id;
 end if;
 if p_action='start' then
  delete from public.support_website_visitors where site_id=s.id and expires_at<now();
  insert into public.support_website_visitors(site_id,token_hash) values(s.id,p_hash);
  return '{}'::jsonb;
 end if;
 if p_action='send' then
  if length(trim(p_text)) not between 1 and 2000 or p_event !~ '^[a-zA-Z0-9-]{16,80}$' then raise exception 'Invalid message';end if;
  if v.minute_at<now()-interval '1 minute' then v.minute_at=now();v.minute_count=0;end if;
  if v.minute_count>=6 then raise exception 'Please wait before sending more messages';end if;
  update public.support_website_visitors set minute_at=v.minute_at,minute_count=v.minute_count+1 where id=v.id;
  r=public.ingest_support_message(s.business_id,jsonb_build_object('channel','website','senderId',v.id::text,'eventId',p_event,'direction','inbound','text',trim(p_text),'displayName','Website visitor'));
  c=(r->>'conversationId')::uuid;
  if p_handoff then update public.support_conversations set ai_paused=true where id=c;end if;
  if not p_handoff and not (r->>'aiPaused')::boolean and exists(select 1 from public.support_ai_settings where business_id=s.business_id and enabled) then
   select id into mid from public.support_messages where conversation_id=c and direction='inbound' and event_id=p_event;
   perform public.enqueue_support_ai_job(s.business_id,c,mid);
  end if;
 elsif p_action<>'poll' then raise exception 'Invalid action';
 end if;
 select id into c from public.support_conversations where business_id=s.business_id and channel='website' and sender_id=v.id::text;
 -- Website delivery is durable history publication; repeat polling returns the same IDs.
 for item in select * from public.support_outbox where business_id=s.business_id and conversation_id=c and channel='website' and recipient=v.id::text and status='queued' order by created_at limit 20 for update skip locked loop
  if exists(select 1 from public.support_ai_jobs where id=item.request_id and business_id=s.business_id) and
   (not exists(select 1 from public.support_ai_settings where business_id=s.business_id and enabled) or exists(select 1 from public.support_conversations where id=c and ai_paused)) then
   update public.support_outbox set status='needs_review',finished_at=now() where id=item.id;
  else
   insert into public.support_messages(business_id,conversation_id,event_id,direction,text) values(s.business_id,c,'outbox:'||item.id::text,'outbound',item.text) on conflict do nothing;
   update public.support_outbox set status='sent',provider_message_id='website:'||item.id::text,finished_at=now() where id=item.id;
  end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at),'[]'::jsonb) into result from (select id,direction,text,created_at from public.support_messages where business_id=s.business_id and conversation_id=c order by created_at desc limit 100) m;
 return jsonb_build_object('messages',result);
end $$;
revoke all on function public.website_chat(uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.website_chat(uuid,text,text,text,text,boolean) to service_role;
commit;
