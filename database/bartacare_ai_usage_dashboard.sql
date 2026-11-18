-- BartaCare AI usage ledger. REVIEW AND APPLY ON ISOLATED STAGING FIRST.
-- Never apply to shared production as part of a preview.
begin;
create table public.support_ai_usage (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 job_id uuid not null,
 api_key_id uuid,
 provider text not null check (provider in ('gemini','openai','anthropic')),
 model text not null check (length(model) between 2 and 120),
 input_tokens bigint check (input_tokens is null or input_tokens>=0),
 output_tokens bigint check (output_tokens is null or output_tokens>=0),
 total_tokens bigint check (total_tokens is null or total_tokens>=0),
 created_at timestamptz not null default now()
);
create index support_ai_usage_business_time_idx on public.support_ai_usage(business_id,created_at desc);
create table public.support_ai_usage_rates (
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null check (provider in ('gemini','openai','anthropic')),
 model text not null check (length(model) between 2 and 120),
 input_usd_per_million numeric(14,6) not null check (input_usd_per_million>=0 and input_usd_per_million<=10000),
 output_usd_per_million numeric(14,6) not null check (output_usd_per_million>=0 and output_usd_per_million<=10000),
 updated_at timestamptz not null default now(),
 primary key(business_id,provider,model)
);
create table public.support_ai_usage_budgets (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 monthly_budget_usd numeric(14,4) check(monthly_budget_usd is null or (monthly_budget_usd>=0 and monthly_budget_usd<=10000000)),
 monthly_token_budget bigint check(monthly_token_budget is null or (monthly_token_budget>=0 and monthly_token_budget<=1000000000000)),
 updated_at timestamptz not null default now()
);
alter table public.support_ai_usage enable row level security;
alter table public.support_ai_usage_rates enable row level security;
alter table public.support_ai_usage_budgets enable row level security;
revoke all on public.support_ai_usage,public.support_ai_usage_rates,public.support_ai_usage_budgets from public,anon,authenticated;
grant select,insert on public.support_ai_usage to service_role;
grant select,insert,update,delete on public.support_ai_usage_rates to service_role;
grant select,insert,update,delete on public.support_ai_usage_budgets to service_role;
-- A service-role-only, tenant-filtered aggregation. No messages or secrets are returned.
create function public.get_bartacare_ai_usage_summary(p_business_id uuid,p_since timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with usage_rows as (
  select u.*,r.input_usd_per_million,r.output_usd_per_million,
   case when u.input_tokens is not null and u.output_tokens is not null
    and r.input_usd_per_million is not null and r.output_usd_per_million is not null
   then (u.input_tokens::numeric*r.input_usd_per_million+u.output_tokens::numeric*r.output_usd_per_million)/1000000
   else null end as estimated_usd
  from public.support_ai_usage u
  left join public.support_ai_usage_rates r
   on r.business_id=u.business_id and r.provider=u.provider and r.model=u.model
  where u.business_id=p_business_id and u.created_at>=p_since
 ),
 totals as (
  select count(*) as calls,
   coalesce(sum(input_tokens),0) as input_tokens,
   coalesce(sum(output_tokens),0) as output_tokens,
   coalesce(sum(total_tokens),0) as total_tokens,
   count(*) filter(where input_tokens is null or output_tokens is null) as missing_token_calls,
   count(*) filter(where estimated_usd is null) as unpriced_calls,
   coalesce(sum(estimated_usd),0) as estimated_usd
  from usage_rows
 ),
 models as (
  select provider,model,count(*) as calls,
   coalesce(sum(input_tokens),0) as input_tokens,
   coalesce(sum(output_tokens),0) as output_tokens,
   coalesce(sum(total_tokens),0) as total_tokens,
   count(*) filter(where estimated_usd is null) as unpriced_calls,
   coalesce(sum(estimated_usd),0) as estimated_usd
  from usage_rows group by provider,model
 ),
 daily as (
  select (created_at at time zone 'UTC')::date as day,count(*) as calls,
   coalesce(sum(input_tokens),0) as input_tokens,
   coalesce(sum(output_tokens),0) as output_tokens,
   coalesce(sum(estimated_usd),0) as estimated_usd
  from usage_rows group by 1
 )
 select jsonb_build_object(
  'totals',(select to_jsonb(t) from totals t),
  'models',coalesce((select jsonb_agg(to_jsonb(m) order by m.calls desc) from models m),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'::jsonb)
 )
$$;
revoke all on function public.get_bartacare_ai_usage_summary(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.get_bartacare_ai_usage_summary(uuid,timestamptz) to service_role;
commit;
