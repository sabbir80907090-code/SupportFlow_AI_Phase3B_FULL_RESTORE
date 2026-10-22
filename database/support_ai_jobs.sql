-- Apply on isolated staging only after unified_inbox.sql.
begin;
create table public.support_ai_jobs (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 conversation_id uuid not null,
 inbound_message_id uuid not null,
 status text not null default 'queued' check(status in ('queued','processing','completed','skipped','failed','needs_review')),
 attempts integer not null default 0 check(attempts>=0),
 claim_token uuid, claimed_at timestamptz, finished_at timestamptz,
 error_code text, created_at timestamptz not null default now(),
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade,
 unique(business_id,inbound_message_id)
);
create index support_ai_jobs_pending_idx on public.support_ai_jobs(created_at) where status='queued';
alter table public.support_ai_jobs enable row level security;
revoke all on public.support_ai_jobs from public,anon,authenticated;
grant all on public.support_ai_jobs to service_role;
create function public.enqueue_support_ai_job(p_business_id uuid,p_conversation_id uuid,p_message_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.support_messages m where m.id=p_message_id and m.business_id=p_business_id and m.conversation_id=p_conversation_id and m.direction='inbound') then
   raise exception 'Invalid inbound message';
 end if;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id)
 values(p_business_id,p_conversation_id,p_message_id)
 on conflict(business_id,inbound_message_id) do update set inbound_message_id=excluded.inbound_message_id
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.enqueue_support_ai_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_support_ai_job(uuid,uuid,uuid) to service_role;
create function public.claim_support_ai_job(p_job_id uuid)
returns setof public.support_ai_jobs language sql security invoker set search_path='' as $$
 update public.support_ai_jobs set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1
 where id=p_job_id and status='queued' returning *;
$$;
revoke all on function public.claim_support_ai_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_support_ai_job(uuid) to service_role;
create function public.finish_support_ai_job(p_id uuid,p_token uuid,p_status text,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in('completed','skipped','failed','needs_review') then raise exception 'Invalid state'; end if;
 update public.support_ai_jobs set status=p_status,error_code=left(p_error,100),finished_at=now()
 where id=p_id and status='processing' and claim_token=p_token;
 return found;
end $$;
revoke all on function public.finish_support_ai_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_support_ai_job(uuid,uuid,text,text) to service_role;
commit;
