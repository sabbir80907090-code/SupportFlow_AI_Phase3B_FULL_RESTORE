create table if not exists public.business_products (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 160),
 description text,
 sku text,
 category text,
 price numeric(14,2) not null default 0 check (price >= 0),
 currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
 stock_quantity integer not null default 0 check (stock_quantity >= 0),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists business_products_business_idx on public.business_products(business_id,created_at desc);
create unique index if not exists business_products_business_sku_unique on public.business_products(business_id,lower(sku)) where sku is not null;
alter table public.business_products enable row level security;
create policy "business_products_read" on public.business_products for select to authenticated using (exists(select 1 from public.business_members m where m.business_id=business_products.business_id and m.user_id=(select auth.uid())));
create policy "business_products_insert" on public.business_products for insert to authenticated with check (exists(select 1 from public.business_members m where m.business_id=business_products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy "business_products_update" on public.business_products for update to authenticated using (exists(select 1 from public.business_members m where m.business_id=business_products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'))) with check (exists(select 1 from public.business_members m where m.business_id=business_products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy "business_products_delete" on public.business_products for delete to authenticated using (exists(select 1 from public.business_members m where m.business_id=business_products.business_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
grant select,insert,update,delete on public.business_products to authenticated;