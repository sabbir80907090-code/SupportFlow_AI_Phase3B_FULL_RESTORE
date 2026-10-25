begin;
create table public.support_messenger_credentials (
 connection_id uuid primary key references public.support_channel_connections(id) on delete cascade,
 page_token_ciphertext text not null,
 created_at timestamptz not null default now()
);
create table public.support_messenger_oauth (
 id uuid primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 state_hash text not null unique,
 status text not null default 'pending' check(status in ('pending','exchanging','selecting')),
 token_ciphertext text,
 expires_at timestamptz not null,
 unique(business_id)
);
create table public.support_messenger_windows (
 business_id uuid not null,
 conversation_id uuid primary key,
 last_inbound_at timestamptz not null,
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade
);
alter table public.support_messenger_credentials enable row level security;
alter table public.support_messenger_oauth enable row level security;
alter table public.support_messenger_windows enable row level security;
revoke all on public.support_messenger_credentials,public.support_messenger_oauth,public.support_messenger_windows from public,anon,authenticated;
grant all on public.support_messenger_credentials,public.support_messenger_oauth,public.support_messenger_windows to service_role;
create unique index support_messenger_one_page_per_business on public.support_channel_connections(business_id) where channel='messenger';
create unique index support_messenger_unique_page on public.support_channel_connections(external_account_id) where channel='messenger';
create index support_messenger_windows_business on public.support_messenger_windows(business_id,conversation_id);
create function public.record_messenger_inbound(p_business_id uuid,p_conversation_id uuid,p_received_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_received_at is null or p_received_at>now()+interval '1 minute' or not exists(select 1 from public.support_conversations where id=p_conversation_id and business_id=p_business_id and channel='messenger') then raise exception 'Invalid Messenger event'; end if;
 insert into public.support_messenger_windows(business_id,conversation_id,last_inbound_at)
 values(p_business_id,p_conversation_id,p_received_at)
 on conflict(conversation_id) do update set last_inbound_at=greatest(public.support_messenger_windows.last_inbound_at,excluded.last_inbound_at);
end $$;
revoke all on function public.record_messenger_inbound(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_messenger_inbound(uuid,uuid,timestamptz) to service_role;
create function public.claim_support_outbox_channel(p_business_id uuid,p_channel text,p_limit integer default 10)
returns setof public.support_outbox language sql security invoker set search_path='' as $$
 update public.support_outbox set status='claimed',claimed_at=now(),claim_token=gen_random_uuid()
 where id in(select id from public.support_outbox where business_id=p_business_id and channel=p_channel and status='queued' order by created_at limit greatest(0,least(p_limit,10)) for update skip locked) returning *;
$$;
revoke all on function public.claim_support_outbox_channel(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_support_outbox_channel(uuid,text,integer) to service_role;
-- Prune short-lived encrypted OAuth grants without ever exposing them to clients.
select cron.schedule('supportflow-messenger-oauth-cleanup','*/10 * * * *',$job$delete from public.support_messenger_oauth where expires_at<now();$job$);
commit;
