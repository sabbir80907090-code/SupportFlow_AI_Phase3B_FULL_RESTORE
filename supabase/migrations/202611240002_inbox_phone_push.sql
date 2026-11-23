begin;
create table public.inbox_push_devices (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null,
 user_id uuid not null default auth.uid(),
 endpoint text not null unique check (length(endpoint) between 20 and 2048),
 foreign key (business_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);
alter table public.inbox_push_devices enable row level security;
revoke all on public.inbox_push_devices from public,anon,authenticated;
grant select,delete on public.inbox_push_devices to authenticated;
grant insert (business_id,endpoint) on public.inbox_push_devices to authenticated;
grant all on public.inbox_push_devices to service_role;
create policy own_push_devices on public.inbox_push_devices for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create table public.inbox_push_queue (
 id bigint generated always as identity primary key,
 device_id uuid not null references public.inbox_push_devices on delete cascade,
 message_id uuid not null references public.support_messages on delete cascade,
 due_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 unique(message_id,device_id)
);
create index inbox_push_due on public.inbox_push_queue(due_at);
alter table public.inbox_push_queue enable row level security;
revoke all on public.inbox_push_queue from public,anon,authenticated;
grant all on public.inbox_push_queue to service_role;

create view supportflow_private.inbox_push_recipients as
 select c.business_id,c.id as conversation_id,d.id as device_id
 from public.support_conversations c
 join public.inbox_push_devices d on d.business_id=c.business_id
 join public.business_members m on m.business_id=d.business_id and m.user_id=d.user_id
 where c.assigned_to=d.user_id or (c.assigned_to is null and m.role in ('owner','admin'));
revoke all on supportflow_private.inbox_push_recipients from public,anon,authenticated;

create function supportflow_private.enqueue_inbox_push() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.inbox_push_queue(device_id,message_id)
 select device_id,new.id from supportflow_private.inbox_push_recipients
 where business_id=new.business_id and conversation_id=new.conversation_id
 on conflict do nothing;
 return new;
end $$;
revoke all on function supportflow_private.enqueue_inbox_push() from public,anon,authenticated;
create trigger enqueue_inbox_push after insert on public.support_messages
 for each row when (new.direction='inbound') execute function supportflow_private.enqueue_inbox_push();

create function public.claim_inbox_push() returns table(job_id bigint,device_id uuid,endpoint text)
 language plpgsql security definer set search_path='' as $$
begin
 delete from public.inbox_push_queue q where q.expires_at<=now();
 return query
 with batch as (
  select q.id from public.inbox_push_queue q where q.due_at<=now()
  order by q.due_at limit 32 for update skip locked
 ), claimed as (
  update public.inbox_push_queue q set due_at=now()+interval '1 minute'
  from batch b where q.id=b.id returning q.*
 )
 select q.id,d.id,d.endpoint from claimed q
 join public.support_messages m on m.id=q.message_id
 join supportflow_private.inbox_push_recipients r on r.conversation_id=m.conversation_id
  and r.business_id=m.business_id and r.device_id=q.device_id
 join public.inbox_push_devices d on d.id=r.device_id;
end $$;
revoke all on function public.claim_inbox_push() from public,anon,authenticated;
grant execute on function public.claim_inbox_push() to service_role;
commit;
