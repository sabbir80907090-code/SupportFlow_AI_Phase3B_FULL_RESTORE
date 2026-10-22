-- Run on a staging database first. No client access to stored encrypted credentials.
begin;
create table if not exists public.support_telegram_credentials (
 connection_id uuid primary key references public.support_channel_connections(id) on delete cascade,
 bot_token_ciphertext text not null,
 webhook_secret_ciphertext text not null,
 created_at timestamptz not null default now()
);
alter table public.support_telegram_credentials enable row level security;
revoke all on public.support_telegram_credentials from public,anon,authenticated;
grant all on public.support_telegram_credentials to service_role;
create unique index if not exists support_telegram_bot_single_business on public.support_channel_connections(business_id) where channel='telegram';
create unique index if not exists support_telegram_bot_unique_account on public.support_channel_connections(channel,external_account_id) where channel='telegram';
commit;
