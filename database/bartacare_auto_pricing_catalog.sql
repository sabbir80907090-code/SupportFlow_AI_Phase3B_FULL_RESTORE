-- BartaCare reviewed standard paid-tier pricing defaults, checked 2026-11-16.
-- Exact model IDs only. Aliases, free tiers, discounts and cached input are not assumed.
begin;
create table if not exists public.support_ai_default_rates (
 provider text not null check (provider in ('gemini','openai','anthropic')),
 model text not null check (length(model) between 2 and 120),
 input_usd_per_million numeric(14,6) not null check(input_usd_per_million>=0),
 output_usd_per_million numeric(14,6) not null check(output_usd_per_million>=0),
 source_url text not null,
 reviewed_on date not null,
 primary key(provider,model)
);
alter table public.support_ai_default_rates enable row level security;
revoke all on public.support_ai_default_rates from public,anon,authenticated;
grant select on public.support_ai_default_rates to service_role;
insert into public.support_ai_default_rates(provider,model,input_usd_per_million,output_usd_per_million,source_url,reviewed_on) values
 ('gemini','gemini-2.5-flash-lite',0.10,0.40,'https://ai.google.dev/gemini-api/docs/pricing','2026-11-16'),
 ('gemini','gemini-2.5-flash',0.30,2.50,'https://ai.google.dev/gemini-api/docs/pricing','2026-11-16'),
 ('gemini','gemini-3.1-flash-lite',0.25,1.50,'https://ai.google.dev/gemini-api/docs/pricing','2026-11-16'),
 ('gemini','gemini-3.5-flash-lite',0.30,2.50,'https://ai.google.dev/gemini-api/docs/pricing','2026-11-16'),
 ('gemini','gemini-3.5-flash',1.50,9.00,'https://ai.google.dev/gemini-api/docs/pricing','2026-11-16'),
 ('openai','gpt-4.1-mini',0.40,1.60,'https://developers.openai.com/api/docs/models/gpt-4.1-mini','2026-11-16'),
 ('openai','gpt-4.1',2.00,8.00,'https://developers.openai.com/api/docs/models/gpt-4.1','2026-11-16'),
 ('openai','gpt-4o-mini',0.15,0.60,'https://developers.openai.com/api/docs/models/gpt-4o-mini','2026-11-16'),
 ('anthropic','claude-sonnet-4-5',3.00,15.00,'https://platform.claude.com/docs/en/about-claude/pricing','2026-11-16'),
 ('anthropic','claude-haiku-4-5',1.00,5.00,'https://platform.claude.com/docs/en/about-claude/pricing','2026-11-16'),
 ('anthropic','claude-opus-4-1',15.00,75.00,'https://platform.claude.com/docs/en/about-claude/pricing','2026-11-16')
on conflict (provider,model) do update set
 input_usd_per_million=excluded.input_usd_per_million,
 output_usd_per_million=excluded.output_usd_per_million,
 source_url=excluded.source_url,reviewed_on=excluded.reviewed_on;
create or replace function public.get_bartacare_ai_usage_summary(p_business_id uuid,p_since timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with usage_rows as (
  select u.*,coalesce(r.input_usd_per_million,d.input_usd_per_million) as input_rate,
   coalesce(r.output_usd_per_million,d.output_usd_per_million) as output_rate,
   case when u.input_tokens is not null and u.output_tokens is not null
    and coalesce(r.input_usd_per_million,d.input_usd_per_million) is not null
    and coalesce(r.output_usd_per_million,d.output_usd_per_million) is not null
   then (u.input_tokens::numeric*coalesce(r.input_usd_per_million,d.input_usd_per_million)
       +u.output_tokens::numeric*coalesce(r.output_usd_per_million,d.output_usd_per_million))/1000000
   else null end as estimated_usd
  from public.support_ai_usage u
  left join public.support_ai_usage_rates r
   on r.business_id=u.business_id and r.provider=u.provider and r.model=u.model
  left join public.support_ai_default_rates d
   on d.provider=u.provider and d.model=u.model
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
