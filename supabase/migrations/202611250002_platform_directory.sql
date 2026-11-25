begin;

create table supportflow_private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table supportflow_private.platform_admins enable row level security;
revoke all on supportflow_private.platform_admins from public, anon, authenticated;

create function supportflow_private.require_platform_admin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from supportflow_private.platform_admins where user_id = auth.uid()) then
    raise exception 'Platform access denied' using errcode = '42501';
  end if;
end
$$;
revoke all on function supportflow_private.require_platform_admin() from public, anon, authenticated;

create function public.platform_list_businesses(search_text text default '', page_offset int default 0)
returns table (id uuid, name text, created_at timestamptz, member_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform supportflow_private.require_platform_admin();
  return query
    select b.id, b.name, b.created_at,
           (select count(*) from public.business_members m where m.business_id = b.id)
    from public.businesses b
    where strpos(lower(b.name), lower(trim(coalesce(search_text,'')))) > 0
       or b.id::text = trim(search_text)
    order by b.created_at desc, b.id
    limit 26 offset greatest(0, page_offset);
end
$$;

create function public.platform_business_details(target_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform supportflow_private.require_platform_admin();
  return (
    select jsonb_build_object(
      'id', b.id, 'name', b.name, 'created_at', b.created_at,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.user_id, 'email', u.email, 'role', m.role)
                         order by m.created_at, m.user_id)
        from public.business_members m join auth.users u on u.id=m.user_id
        where m.business_id=b.id
      ), '[]'::jsonb),
      'channels', coalesce((
        select jsonb_agg(jsonb_build_object('channel', c.channel, 'name', c.display_name,
                                           'enabled', c.enabled) order by c.channel,c.id)
        from public.support_channel_connections c where c.business_id=b.id
      ), '[]'::jsonb)
    ) from public.businesses b where b.id=target_id
  );
end
$$;
revoke all on function public.platform_list_businesses(text,int), public.platform_business_details(uuid)
  from public, anon, authenticated;
grant execute on function public.platform_list_businesses(text,int), public.platform_business_details(uuid)
  to authenticated;
commit;
