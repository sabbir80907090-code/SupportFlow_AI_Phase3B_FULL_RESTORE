alter table public.support_messages add column if not exists telegram_delivery jsonb;
grant select (telegram_delivery) on public.support_messages to authenticated;

create or replace function public.soft_delete_support_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.support_messages m
  set deleted_at = now(), deleted_by = v_user
  where m.id = p_message_id
    and m.direction = 'outbound'
    and m.deleted_at is null
    and exists (
      select 1 from public.business_members bm
      where bm.business_id = m.business_id
        and bm.user_id = v_user
        and bm.role in ('owner', 'admin', 'agent')
    );
  return found;
end;
$$;

revoke all on function public.soft_delete_support_message(uuid) from public, anon;
grant execute on function public.soft_delete_support_message(uuid) to authenticated, service_role;
