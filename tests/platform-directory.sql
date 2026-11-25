-- Isolated test database only. Requires the platform-admin migration.
begin;
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.businesses(id,name,owner_id) values
 ('20000000-0000-0000-0000-000000000001','Fixture One','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','Fixture Two','10000000-0000-0000-0000-000000000002');
insert into public.business_members(business_id,user_id,role)
 values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','admin')
 on conflict (business_id,user_id) do update set role='admin';
insert into supportflow_private.platform_admins values ('10000000-0000-0000-0000-000000000002');

insert into public.support_channel_connections(business_id,channel,external_account_id,display_name,secret_reference,enabled)
 values ('20000000-0000-0000-0000-000000000002','telegram','fixture','Fixture bot','never-return',true);
set local role anon;
do $$ begin
  perform public.platform_list_businesses();
  raise exception 'Anonymous listing allowed';
exception when insufficient_privilege then null; end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ begin
  perform public.platform_list_businesses();
  raise exception 'Tenant admin listing allowed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.platform_business_details('20000000-0000-0000-0000-000000000001');
  raise exception 'Tenant admin detail allowed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into supportflow_private.platform_admins values ('10000000-0000-0000-0000-000000000001');
  raise exception 'Self enrollment allowed';
exception when insufficient_privilege then null; end $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.platform_list_businesses('Fixture')) <> 2 then
    raise exception 'Incomplete directory';
  end if;
  if jsonb_array_length(public.platform_business_details('20000000-0000-0000-0000-000000000002')->'members') < 1 then
    raise exception 'Missing member details';
  end if;
  if public.platform_business_details('20000000-0000-0000-0000-000000000001')->'channels' <> '[]'::jsonb then
    raise exception 'Channel from another business';
  end if;
  if public.platform_business_details('20000000-0000-0000-0000-000000000002')->'channels'
       <> '[{"channel":"telegram","name":"Fixture bot","enabled":true}]'::jsonb then
    raise exception 'Incorrect channel fields';
  end if;
end $$;
rollback;
