-- Blank inventory is unknown, not out of stock. Existing quantities remain unchanged.
alter table public.business_products
 alter column stock_quantity drop not null,
 alter column stock_quantity drop default;
comment on column public.business_products.stock_quantity is 'NULL = unknown or untracked; 0 = confirmed out of stock; positive integer = known quantity.';
