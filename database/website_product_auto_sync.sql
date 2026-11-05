begin;
create table public.website_sync_connections(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 website_url text not null check(length(website_url)<=2048),
 status text not null default 'active' check(status in ('active','paused','error','disconnected')),
 frequency_minutes integer not null default 360 check(frequency_minutes in (60,360,720,1440)),
 next_sync_at timestamptz not null default now(),
 last_sync_at timestamptz,
 last_status text,
 last_error text,
 pages_discovered integer not null default 0,
 pages_processed integer not null default 0,
 products_synced integer not null default 0,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(business_id,website_url)
);
create index website_sync_due_idx on public.website_sync_connections(status,next_sync_at) where status='active';
create table public.website_sync_pages(
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.website_sync_connections(id) on delete cascade,
 page_url text not null check(length(page_url)<=2048),
 status text not null default 'pending' check(status in ('pending','done','error')),
 attempts integer not null default 0,
 last_error text,
 processed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(connection_id,page_url)
);
create index website_sync_pages_queue_idx on public.website_sync_pages(connection_id,status,created_at);
create table public.website_sync_runs(
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.website_sync_connections(id) on delete cascade,
 status text not null check(status in ('running','completed','partial','failed')),
 pages_discovered integer not null default 0,
 pages_processed integer not null default 0,
 products_created integer not null default 0,
 products_updated integer not null default 0,
 error text,
 started_at timestamptz not null default now(),
 finished_at timestamptz
);
alter table public.business_products add column source_connection_id uuid references public.website_sync_connections(id) on delete set null;
alter table public.business_products add column source_url text;
alter table public.business_products add column source_hash text;
create unique index business_products_sync_source_unique on public.business_products(business_id,source_connection_id,source_url) where source_connection_id is not null and source_url is not null;
create index website_sync_runs_connection_idx on public.website_sync_runs(connection_id,started_at desc);
alter table public.website_sync_connections enable row level security;
alter table public.website_sync_pages enable row level security;
alter table public.website_sync_runs enable row level security;
revoke all on public.website_sync_connections,public.website_sync_pages,public.website_sync_runs from public,anon,authenticated;
grant select,insert,update,delete on public.website_sync_connections,public.website_sync_pages,public.website_sync_runs to service_role;
grant select,insert,update on public.business_products to service_role;
commit;

-- Use the existing Supabase pg_cron + pg_net + Vault worker secret.
-- This avoids Vercel Hobby's once-per-day Cron restriction.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname='supportflow-website-product-sync';
select cron.schedule('supportflow-website-product-sync','* * * * *',$job$
 select net.http_get(
  url := 'https://support-flow-ai-phase3-b-full-resto.vercel.app/api/internal/sync-websites',
  headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supportflow_worker_cron_secret')),
  timeout_milliseconds := 65000
 );
$job$);
