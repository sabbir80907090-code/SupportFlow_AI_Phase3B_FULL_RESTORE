-- Staging-only additive migration. Run after supportflow_core.sql.
-- Moderator is the existing 'agent' role; only the business owner can invite.
begin;

create table public.business_team_invitations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 email text not null check(length(email) between 3 and 254 and email = lower(trim(email))),
 role text not null default 'agent' check(role = 'agent'),
 invited_by uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '7 days'),
 accepted_at timestamptz,
 accepted_by uuid references auth.users(id)
);
create unique index business_team_invite_pending_unique
 on public.business_team_invitations(business_id,email) where status='pending';
create index business_team_invite_recipient
 on public.business_team_invitations(email,status,expires_at);
create index business_team_invite_business
 on public.business_team_invitations(business_id,created_at desc);
alter table public.business_team_invitations enable row level security;
revoke all on public.business_team_invitations from public,anon,authenticated;
grant select,insert,update,delete on public.business_team_invitations to service_role;

-- Serializes invitations within a workspace so seat limits cannot be raced.
create function public.create_moderator_invitation(p_business_id uuid,p_owner_id uuid,p_email text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_email) > 254 then raise exception 'Invalid email'; end if;
 perform 1 from public.businesses
   where id=p_business_id and owner_id=p_owner_id for update;
 if not found then raise exception 'Only the workspace owner can invite moderators' using errcode='42501'; end if;
 update public.business_team_invitations set status='expired'
   where business_id=p_business_id and status='pending' and expires_at <= now();
 if exists(select 1 from public.business_team_invitations
    where business_id=p_business_id and email=v_email and status='pending') then
    raise exception 'Invitation already pending'; end if;
 if (select count(*) from public.business_members where business_id=p_business_id)
    + (select count(*) from public.business_team_invitations
       where business_id=p_business_id and status='pending') >= 5 then
    raise exception 'Workspace team limit reached (5 seats)'; end if;
 if (select count(*) from public.business_team_invitations
       where business_id=p_business_id and created_at > now()-interval '1 day') >= 10 then
    raise exception 'Daily invitation limit reached'; end if;
 insert into public.business_team_invitations(business_id,email,invited_by)
 values(p_business_id,v_email,p_owner_id) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.create_moderator_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_moderator_invitation(uuid,uuid,text) to service_role;

-- Called only by a server after getUser() verified the signed-in email.
-- Locking the invite and business serializes acceptance with new invitations.
create function public.accept_moderator_invitation(p_invitation_id uuid,p_user_id uuid,p_email text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare v_invite public.business_team_invitations; v_email text := lower(trim(p_email));
begin
 select * into v_invite from public.business_team_invitations
  where id=p_invitation_id for update;
 if not found or v_invite.status <> 'pending' or v_invite.expires_at <= now()
    or v_invite.email <> v_email then
   raise exception 'Invitation not available' using errcode='42501'; end if;
 perform 1 from public.businesses where id=v_invite.business_id for update;
 if (select count(*) from public.business_members where business_id=v_invite.business_id) >= 5
    and not exists(select 1 from public.business_members
      where business_id=v_invite.business_id and user_id=p_user_id) then
   raise exception 'Workspace team limit reached'; end if;
 insert into public.business_members(business_id,user_id,role)
 values(v_invite.business_id,p_user_id,'agent')
 on conflict(business_id,user_id) do nothing;
 update public.business_team_invitations
 set status='accepted',accepted_at=now(),accepted_by=p_user_id
 where id=v_invite.id;
 return v_invite.business_id;
end $$;
revoke all on function public.accept_moderator_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_moderator_invitation(uuid,uuid,text) to service_role;

commit;
