-- Apply only after review in a staging database. Do not run against production without an approved rollout.
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 160),
 sku text null check (sku is null or length(sku) between 1 and 100),
 description text null check (description is null or length(description)<=4000),
 category text null check (category is null or length(category)<=100),
 price numeric(12,2) not null default 0 check (price>=0),
 currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
 stock_quantity integer not null default 0 check (stock_quantity>=0),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (business_id,id)
);
create unique index if not exists products_business_sku_unique on public.products (business_id,lower(sku)) where sku is not null;
create index if not exists products_business_created_idx on public.products(business_id,created_at desc);
alter table public.products enable row level security;
grant select,insert,update,delete on public.products to authenticated;
create policy "business members read products" on public.products for select to authenticated
 using (exists(select 1 from public.business_members m where m.business_id=products.business_id and m.user_id=(select auth.uid())));
create policy "business managers insert products" on public.products for insert to authenticated
 with check (exists(select 1 from public.business_members m where m.business_id=products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy "business managers update products" on public.products for update to authenticated
 using (exists(select 1 from public.business_members m where m.business_id=products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')))
 with check (exists(select 1 from public.business_members m where m.business_id=products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy "business managers delete products" on public.products for delete to authenticated
 using (exists(select 1 from public.business_members m where m.business_id=products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
