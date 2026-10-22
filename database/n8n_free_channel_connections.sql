-- SupportFlow n8n-free foundation: tenant-scoped channel connections.
-- Apply after database/supportflow_core.sql. Does not modify existing bridge tables.
begin;
create table if not exists public.support_channel_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null check (channel in ('telegram','messenger','whatsapp','website')),
  external_account_id text not null check (length(trim(external_account_id)) between 1 and 255),
  display_name text not null default '',
  -- Reference to credentials in a server-side secret store; never store access tokens here.
  secret_reference text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, external_account_id),
  unique (id, business_id)
);
create index if not exists support_channel_connections_business_idx
  on public.support_channel_connections (business_id, channel);
alter table public.support_channel_connections enable row level security;
revoke all on public.support_channel_connections from public, anon, authenticated;
grant select (id,business_id,channel,external_account_id,display_name,enabled,created_at,updated_at)
  on public.support_channel_connections to authenticated;
grant all on public.support_channel_connections to service_role;
drop policy if exists support_channel_connections_member_read on public.support_channel_connections;
create policy support_channel_connections_member_read
  on public.support_channel_connections for select to authenticated
  using (business_id in (
    select business_id from public.business_members
    where user_id=(select auth.uid())
  ));
-- Writes must go through a server-side endpoint with explicit owner/admin checks.
-- Never return secret_reference to browser clients.
commit;
