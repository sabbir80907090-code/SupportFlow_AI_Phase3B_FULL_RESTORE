-- Server-only credentials. No browser role can read even encrypted values.
create table public.courier_connections (
 business_id uuid not null references public.businesses(id) on delete cascade,
 provider text not null check (provider in ('pathao','steadfast','redx')),
 pickup_name text not null check (length(pickup_name) between 1 and 120),
 pickup_phone text not null check (length(pickup_phone) between 7 and 25),
 pickup_address text not null check (length(pickup_address) between 5 and 1000),
 credentials_ciphertext text not null,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key (business_id,provider)
);
alter table public.courier_connections enable row level security;
revoke all on public.courier_connections from public,anon,authenticated;
grant select,insert,update,delete on public.courier_connections to service_role;
comment on table public.courier_connections is 'Server-only encrypted courier setup. API verifies current workspace owner/admin membership. Saved credentials are unverified; booking is not enabled.';
