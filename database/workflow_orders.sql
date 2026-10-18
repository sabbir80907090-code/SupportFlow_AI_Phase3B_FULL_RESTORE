-- Workflow order intake. Apply after supportflow_core.sql.
begin;
create table public.workflow_credentials (
 business_id uuid primary key references public.businesses(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 updated_at timestamptz not null default now()
);
alter table public.workflow_credentials enable row level security;
revoke all on public.workflow_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.workflow_credentials to service_role;
create policy workflow_credentials_service on public.workflow_credentials to service_role using(true) with check(true);

alter table public.orders add column source_channel text,
 add column external_sender_id text, add column intake_key text,
 add column delivery_name text, add column delivery_phone text,
 add column delivery_email text, add column delivery_address text;
create unique index orders_intake_unique on public.orders(business_id,intake_key) where intake_key is not null;

create table public.order_events (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 event_type text not null check(event_type in ('pending','confirmed','rejected','cancelled')),
 created_at timestamptz not null default now()
);
create index order_events_business_idx on public.order_events(business_id,created_at desc);
create index order_events_order_idx on public.order_events(order_id);
alter table public.order_events enable row level security;
revoke all on public.order_events from public,anon,authenticated;
grant select on public.order_events to authenticated;
grant all on public.order_events to service_role;
create policy order_events_member_read on public.order_events for select to authenticated
 using(business_id in(select business_id from public.business_members where user_id=(select auth.uid())));
create function supportflow_private.record_order_event() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.status is distinct from old.status then
 insert into public.order_events(business_id,order_id,event_type) values(new.business_id,new.id,new.status);
 end if;
 return new;
end $$;
revoke all on function supportflow_private.record_order_event() from public,anon,authenticated;
create trigger record_order_event after insert or update of status on public.orders for each row execute function supportflow_private.record_order_event();

create function supportflow_private.rotate_workflow_token(p_business_id uuid,p_hash text) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role in('owner','admin')) then
 raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.workflow_credentials(business_id,token_hash) values(p_business_id,p_hash)
 on conflict(business_id) do update set token_hash=excluded.token_hash,updated_at=now();
end $$;
revoke all on function supportflow_private.rotate_workflow_token(uuid,text) from public,anon;
grant execute on function supportflow_private.rotate_workflow_token(uuid,text) to authenticated;
create function public.rotate_workflow_token(p_business_id uuid,p_hash text) returns void
 language sql security invoker set search_path='' as $$select supportflow_private.rotate_workflow_token(p_business_id,p_hash)$$;
revoke all on function public.rotate_workflow_token(uuid,text) from public,anon;
grant execute on function public.rotate_workflow_token(uuid,text) to authenticated;

-- Called exclusively by a server route after resolving the business from the credential.
create function public.intake_workflow_order(p_business_id uuid,p_input jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare ord public.orders; customer uuid; phone text;
begin
 if coalesce(p_input->>'channel','') not in ('telegram','messenger','whatsapp','website') or
 length(coalesce(p_input->>'senderId','')) not between 1 and 200 or
 length(coalesce(p_input->>'idempotencyKey','')) not between 8 and 200 then raise exception 'Invalid source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||(p_input->>'idempotencyKey'),0));
 select * into ord from public.orders where business_id=p_business_id and intake_key=p_input->>'idempotencyKey';
 if found then
 if ord.external_sender_id<>p_input->>'senderId' or ord.source_channel<>p_input->>'channel' then raise exception 'Intake key conflict'; end if;
 return jsonb_build_object('orderId',ord.order_number,'status',ord.status,'duplicate',true);
 end if;
 phone:=regexp_replace(coalesce(p_input->>'phone',''),'[ -]','','g');
 if phone !~ '^[0-9]{11}$' or coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
 length(coalesce(p_input->>'email',''))>254 or
 length(trim(coalesce(p_input->>'name',''))) not between 2 and 160 or
 length(trim(coalesce(p_input->>'address',''))) not between 8 and 1000 or
 length(trim(coalesce(p_input->>'product',''))) not between 1 and 4000 then raise exception 'Invalid order details'; end if;
 insert into public.customers(business_id,name,email,phone,source_channel)
 values(p_business_id,trim(p_input->>'name'),p_input->>'email',phone,p_input->>'channel') returning id into customer;
 insert into public.orders(business_id,customer_id,product_details,source_channel,external_sender_id,intake_key,delivery_name,delivery_phone,delivery_email,delivery_address)
 values(p_business_id,customer,p_input->>'product',p_input->>'channel',p_input->>'senderId',p_input->>'idempotencyKey',trim(p_input->>'name'),phone,p_input->>'email',p_input->>'address') returning * into ord;
 return jsonb_build_object('orderId',ord.order_number,'status',ord.status,'duplicate',false);
end $$;
revoke all on function public.intake_workflow_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.intake_workflow_order(uuid,jsonb) to service_role;
commit;
