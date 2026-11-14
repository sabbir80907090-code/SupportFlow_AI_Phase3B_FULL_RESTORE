-- Synthetic tests only. One transaction, fully rolled back; no provider delivery.
begin;
select set_config('qa.owner_a',gen_random_uuid()::text,true),set_config('qa.admin_a',gen_random_uuid()::text,true),
 set_config('qa.agent_a',gen_random_uuid()::text,true),set_config('qa.agent_b',gen_random_uuid()::text,true),
 set_config('qa.owner_b',gen_random_uuid()::text,true),set_config('qa.business_a',gen_random_uuid()::text,true),
 set_config('qa.business_b',gen_random_uuid()::text,true);
-- Auth user fixtures need the migration runner's normal privileged role.
insert into auth.users(id) values
 (current_setting('qa.owner_a')::uuid),(current_setting('qa.admin_a')::uuid),
 (current_setting('qa.agent_a')::uuid),(current_setting('qa.agent_b')::uuid),
 (current_setting('qa.owner_b')::uuid);
set local role service_role;
insert into public.businesses(id,name,owner_id) values
 (current_setting('qa.business_a')::uuid,'QA A',current_setting('qa.owner_a')::uuid),
 (current_setting('qa.business_b')::uuid,'QA B',current_setting('qa.owner_b')::uuid);
insert into public.business_members(business_id,user_id,role) values
 (current_setting('qa.business_a')::uuid,current_setting('qa.owner_a')::uuid,'owner'),
 (current_setting('qa.business_a')::uuid,current_setting('qa.admin_a')::uuid,'admin'),
 (current_setting('qa.business_a')::uuid,current_setting('qa.agent_a')::uuid,'agent'),
 (current_setting('qa.business_a')::uuid,current_setting('qa.agent_b')::uuid,'agent'),
 (current_setting('qa.business_b')::uuid,current_setting('qa.owner_b')::uuid,'owner');
select set_config('qa.conv',(public.ingest_support_message(
 current_setting('qa.business_a')::uuid,
 '{"channel":"website","senderId":"synthetic-qa","eventId":"qa-1","direction":"inbound","text":"Synthetic QA only"}'::jsonb
 )->>'conversationId'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.agent_a'),true);
select public.set_support_pause(current_setting('qa.conv')::uuid,true);
do $$ begin
 if not exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid
 and ai_paused and assigned_to=current_setting('qa.agent_a')::uuid)
 then raise exception 'Agent claim failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.agent_b'),true);
do $$ begin
 begin perform public.set_support_pause(current_setting('qa.conv')::uuid,true);
 raise exception 'Agent B stole assigned chat'; exception when insufficient_privilege then null; end;
 begin perform public.queue_support_reply(current_setting('qa.conv')::uuid,'not allowed',gen_random_uuid());
 raise exception 'Agent B sent on assigned chat'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.owner_b'),true);
do $$ begin
 if exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid)
 then raise exception 'Cross-workspace read leak'; end if;
 begin perform public.set_support_pause(current_setting('qa.conv')::uuid,true);
 raise exception 'Cross-workspace takeover'; exception when insufficient_privilege then null; end;
 begin perform public.queue_support_reply(current_setting('qa.conv')::uuid,'not allowed',gen_random_uuid());
 raise exception 'Cross-workspace reply'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin_a'),true);
select public.set_support_pause(current_setting('qa.conv')::uuid,true);
do $$ begin
 if not exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid
 and assigned_to=current_setting('qa.admin_a')::uuid and ai_paused) then raise exception 'Admin takeover failed'; end if;
end $$;
select public.set_support_pause(current_setting('qa.conv')::uuid,false);
do $$ begin
 if not exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid
 and assigned_to is null and not ai_paused) then raise exception 'Resume AI failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.agent_b'),true);
select set_config('qa.request',gen_random_uuid()::text,true);
select set_config('qa.outbox',public.queue_support_reply(current_setting('qa.conv')::uuid,
 'Synthetic reply',current_setting('qa.request')::uuid)::text,true);
do $$ begin
 if not exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid
 and assigned_to=current_setting('qa.agent_b')::uuid and ai_paused) then raise exception 'Manual reply did not claim'; end if;
 if public.queue_support_reply(current_setting('qa.conv')::uuid,'Synthetic reply',
 current_setting('qa.request')::uuid)::text<>current_setting('qa.outbox') then raise exception 'Duplicate reply'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.owner_a'),true);
select public.set_support_pause(current_setting('qa.conv')::uuid,true);
do $$ begin
 if not exists(select 1 from public.support_conversations where id=current_setting('qa.conv')::uuid
 and assigned_to=current_setting('qa.owner_a')::uuid and ai_paused) then raise exception 'Owner takeover failed'; end if;
end $$;
select public.set_support_pause(current_setting('qa.conv')::uuid,false);
select 'PASS: tenant isolation, teammate locks, owner/admin takeover, resume, idempotent reply' as result;
rollback;
