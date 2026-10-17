-- Initial SupportFlow core schema. Run only where these tables do not already exist.
-- Does not modify n8n tables. Apply once, followed by Phase 3A and Phase 3B SQL.
begin;
create schema if not exists supportflow_private;
revoke all on schema supportflow_private from public, anon;
grant usage on schema supportflow_private to authenticated, service_role;

create table public.businesses (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 120),
 owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.business_members (
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin','agent')),
 created_at timestamptz not null default now(),
 primary key(business_id,user_id)
);
create index business_members_user_idx on public.business_members(user_id,business_id);
create index businesses_owner_idx on public.businesses(owner_id);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160),
 email text check(length(email)<=254), phone text check(length(phone)<=40),
 source_channel text not null default 'manual' check(source_channel in ('manual','telegram','messenger','whatsapp','website')),
 created_at timestamptz not null default now(),
 unique(business_id,id)
);
create index customers_business_idx on public.customers(business_id,created_at desc);
create sequence public.supportflow_order_number_seq start with 1000001;
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique default nextval('public.supportflow_order_number_seq')::text,
 business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid,
 product_details text not null check(length(trim(product_details)) between 1 and 4000),
 total_amount numeric(14,2) check(total_amount>=0),
 currency text not null default 'BDT' check(currency ~ '^[A-Z]{3}$'),
 status text not null default 'pending' check(status in ('pending','confirmed','rejected','cancelled')),
 created_at timestamptz not null default now(),
 decided_at timestamptz, decided_by uuid references auth.users(id),
 foreign key(business_id,customer_id) references public.customers(business_id,id)
);
create index orders_business_recent_idx on public.orders(business_id,created_at desc);
create index orders_customer_idx on public.orders(business_id,customer_id);
create index orders_decided_by_idx on public.orders(decided_by);
create table public.knowledge_articles (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160),
 content text not null check(length(trim(content)) between 1 and 12000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index knowledge_business_idx on public.knowledge_articles(business_id,updated_at desc);

-- Only own membership is directly visible. Tenant policies can safely join it without recursion.
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.knowledge_articles enable row level security;
revoke all on public.businesses,public.business_members,public.customers,public.orders,public.knowledge_articles from anon,authenticated;
grant select on public.businesses,public.business_members,public.orders to authenticated;
grant select,insert on public.customers to authenticated;
grant insert(business_id,customer_id,product_details,total_amount,currency,status) on public.orders to authenticated;
grant usage on sequence public.supportflow_order_number_seq to authenticated,service_role;
grant select,insert,delete on public.knowledge_articles to authenticated;
grant update(title,content,updated_at) on public.knowledge_articles to authenticated;
grant all on public.businesses,public.business_members,public.customers,public.orders,public.knowledge_articles to service_role;
create policy members_own_read on public.business_members for select to authenticated using(user_id=(select auth.uid()));
create policy businesses_member_read on public.businesses for select to authenticated using(id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy customers_member_read on public.customers for select to authenticated using(business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy customers_member_insert on public.customers for insert to authenticated with check(business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy orders_member_read on public.orders for select to authenticated using(business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy orders_pending_insert on public.orders for insert to authenticated with check(status='pending' and business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy knowledge_member_read on public.knowledge_articles for select to authenticated using(business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy knowledge_admin_insert on public.knowledge_articles for insert to authenticated with check(business_id in (select business_id from public.business_members where user_id=(select auth.uid()) and role in ('owner','admin')));
create policy knowledge_admin_update on public.knowledge_articles for update to authenticated using(business_id in (select business_id from public.business_members where user_id=(select auth.uid()) and role in ('owner','admin'))) with check(business_id in (select business_id from public.business_members where user_id=(select auth.uid()) and role in ('owner','admin')));
create policy knowledge_admin_delete on public.knowledge_articles for delete to authenticated using(business_id in (select business_id from public.business_members where user_id=(select auth.uid()) and role in ('owner','admin')));

-- Privileged logic stays outside the exposed schema. Public RPCs are security invoker wrappers.
create function supportflow_private.create_business(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); bid uuid;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 120 then raise exception 'Business name must be 2–120 characters'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if (select count(*) from public.businesses where owner_id=uid)>=20 then raise exception 'Workspace limit reached'; end if;
 insert into public.businesses(name,owner_id) values(trim(p_name),uid) returning id into bid;
 insert into public.business_members(business_id,user_id,role) values(bid,uid,'owner');
 return bid;
end $$;
revoke all on function supportflow_private.create_business(text) from public,anon;
grant execute on function supportflow_private.create_business(text) to authenticated;
create function public.create_business(p_name text) returns uuid language sql security invoker set search_path='' as $$select supportflow_private.create_business(p_name)$$;
revoke all on function public.create_business(text) from public,anon;
grant execute on function public.create_business(text) to authenticated;

create function supportflow_private.decide_order(p_order_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ord public.orders;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('confirmed','rejected') then raise exception 'Invalid decision'; end if;
 select * into ord from public.orders where id=p_order_id for update;
 if not found or not exists(select 1 from public.business_members where business_id=ord.business_id and user_id=uid and role in ('owner','admin')) then raise exception 'Order not found or not authorized' using errcode='42501'; end if;
 if ord.status<>'pending' then raise exception 'This order already has a decision'; end if;
 update public.orders set status=p_decision,decided_by=uid,decided_at=now() where id=p_order_id;
end $$;
revoke all on function supportflow_private.decide_order(uuid,text) from public,anon;
grant execute on function supportflow_private.decide_order(uuid,text) to authenticated;
create function public.decide_order(p_order_id uuid,p_decision text) returns void language sql security invoker set search_path='' as $$select supportflow_private.decide_order(p_order_id,p_decision)$$;
revoke all on function public.decide_order(uuid,text) from public,anon;
grant execute on function public.decide_order(uuid,text) to authenticated;
commit;
