-- Shared across server instances; server-only access, one row per business.
create table public.support_browser_import_usage (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 minute_start timestamptz not null,
 minute_count integer not null check (minute_count between 1 and 2),
 day_start date not null,
 day_count integer not null check (day_count between 1 and 20)
);
alter table public.support_browser_import_usage enable row level security;
revoke all on public.support_browser_import_usage from public, anon, authenticated;
grant select, insert, update, delete on public.support_browser_import_usage to service_role;

create function public.consume_browser_import_quota(p_business_id uuid)
returns boolean language sql volatile security invoker set search_path = '' as $$
 with consumed as (
  insert into public.support_browser_import_usage as usage
   (business_id,minute_start,minute_count,day_start,day_count)
  values (p_business_id,now(),1,(now() at time zone 'UTC')::date,1)
  on conflict (business_id) do update set
   minute_start=case when usage.minute_start<=now()-interval '1 minute' then now() else usage.minute_start end,
   minute_count=case when usage.minute_start<=now()-interval '1 minute' then 1 else usage.minute_count+1 end,
   day_start=(now() at time zone 'UTC')::date,
   day_count=case when usage.day_start<(now() at time zone 'UTC')::date then 1 else usage.day_count+1 end
  where (usage.minute_start<=now()-interval '1 minute' or usage.minute_count<2)
   and (usage.day_start<(now() at time zone 'UTC')::date or usage.day_count<20)
  returning business_id
 ) select exists(select 1 from consumed);
$$;
revoke all on function public.consume_browser_import_quota(uuid) from public,anon,authenticated;
grant execute on function public.consume_browser_import_quota(uuid) to service_role;
