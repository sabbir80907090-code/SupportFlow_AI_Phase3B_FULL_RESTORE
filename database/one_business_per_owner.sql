-- Optional rollout migration: review existing owners with multiple businesses before applying.
-- This enforces one owned business per account for new and existing records.
-- Do not apply until duplicate owner records have been resolved.
begin;
create unique index if not exists businesses_one_per_owner on public.businesses(owner_id);
commit;
