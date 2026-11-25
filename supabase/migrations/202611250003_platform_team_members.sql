begin;

-- Promote the single pre-existing platform admin once, never future staff.
lock table supportflow_private.platform_admins in share row exclusive mode;
alter table supportflow_private.platform_admins add column team_owner boolean not null default false;
do $$
begin
  if (select count(*) from supportflow_private.platform_admins) > 1 then
    raise exception 'Identify the primary admin before installing team management';
  end if;
  update supportflow_private.platform_admins set team_owner = true;
end $$;
create unique index platform_single_team_owner on supportflow_private.platform_admins(team_owner) where team_owner;

create function public.platform_team_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('owner', team_owner)
  from supportflow_private.platform_admins where user_id=auth.uid();
$$;

create function public.platform_add_team_member(member_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not exists(select from supportflow_private.platform_admins where user_id=auth.uid() and team_owner) then
    raise exception 'Only the primary admin may add members' using errcode='42501';
  end if;
  select id into strict target from auth.users
    where lower(email)=lower(trim(member_email)) and email_confirmed_at is not null
      and deleted_at is null and (banned_until is null or banned_until<=statement_timestamp());
  insert into supportflow_private.platform_admins(user_id) values(target);
end $$;
revoke all on function public.platform_team_access(), public.platform_add_team_member(text) from public, anon, authenticated;
grant execute on function public.platform_team_access(), public.platform_add_team_member(text) to authenticated;
commit;
