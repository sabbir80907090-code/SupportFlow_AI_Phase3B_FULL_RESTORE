begin;

create table public.support_whatsapp_credentials (
 connection_id uuid primary key references public.support_channel_connections(id) on delete cascade,
 waba_id text not null check(waba_id ~ '^[0-9]{1,40}$'),
 phone_number_id text not null check(phone_number_id ~ '^[0-9]{1,40}$'),
 access_token_ciphertext text not null,
 verified_name text not null default '',
 display_phone_number text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.support_whatsapp_windows (
 business_id uuid not null references public.businesses(id) on delete cascade,
 conversation_id uuid primary key,
 last_inbound_at timestamptz not null,
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade
);
alter table public.support_whatsapp_credentials enable row level security;
alter table public.support_whatsapp_windows enable row level security;
revoke all on public.support_whatsapp_credentials,public.support_whatsapp_windows from public,anon,authenticated;
grant all on public.support_whatsapp_credentials,public.support_whatsapp_windows to service_role;
create unique index support_whatsapp_one_number_per_business on public.support_channel_connections(business_id) where channel='whatsapp';
create unique index support_whatsapp_unique_phone_number on public.support_whatsapp_credentials(phone_number_id);
create index support_whatsapp_windows_business on public.support_whatsapp_windows(business_id,conversation_id);

create function public.record_whatsapp_inbound(p_business_id uuid,p_conversation_id uuid,p_received_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_received_at is null or p_received_at>now()+interval '1 minute' or not exists(
  select 1 from public.support_conversations where id=p_conversation_id and business_id=p_business_id and channel='whatsapp'
 ) then raise exception 'Invalid WhatsApp event'; end if;
 insert into public.support_whatsapp_windows(business_id,conversation_id,last_inbound_at)
 values(p_business_id,p_conversation_id,p_received_at)
 on conflict(conversation_id) do update set last_inbound_at=greatest(public.support_whatsapp_windows.last_inbound_at,excluded.last_inbound_at);
end $$;
revoke all on function public.record_whatsapp_inbound(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_whatsapp_inbound(uuid,uuid,timestamptz) to service_role;
commit;
