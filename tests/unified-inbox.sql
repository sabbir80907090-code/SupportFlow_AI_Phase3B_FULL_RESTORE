begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.owner')::uuid),(current_setting('test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select set_config('test.business',public.create_business('Inbox verification')::text,true);
set local role service_role;
select set_config('test.payload','{"channel":"whatsapp","senderId":"test-user","eventId":"test-event","direction":"inbound","text":"Hello"}',true);
select set_config('test.conv',(public.ingest_support_message(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb)->>'conversationId'),true);
do $$ begin
 if not (public.ingest_support_message(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb)->>'duplicate')::boolean then raise exception 'Duplicate intake'; end if;
end $$;
set local role authenticated;
select set_config('test.request',gen_random_uuid()::text,true);
select set_config('test.outbox',public.queue_support_reply(current_setting('test.conv')::uuid,'Human reply',current_setting('test.request')::uuid)::text,true);
do $$ begin
 if public.queue_support_reply(current_setting('test.conv')::uuid,'Human reply',current_setting('test.request')::uuid)::text<>current_setting('test.outbox') then raise exception 'Duplicate reply'; end if;
 if not (select ai_paused from public.support_conversations where id=current_setting('test.conv')::uuid) then raise exception 'Pause failed'; end if;
 begin perform claim_token from public.support_outbox; raise exception 'Claim token leaked'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.support_conversations where id=current_setting('test.conv')::uuid) then raise exception 'Conversation leaked'; end if;
 if exists(select 1 from public.support_messages where conversation_id=current_setting('test.conv')::uuid) then raise exception 'Message leaked'; end if;
 begin perform public.queue_support_reply(current_setting('test.conv')::uuid,'Attacker',gen_random_uuid()); raise exception 'Unauthorized reply'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
select set_config('test.claim',(select claim_token::text from public.claim_support_outbox(current_setting('test.business')::uuid)),true);
do $$ begin
 if exists(select 1 from public.claim_support_outbox(current_setting('test.business')::uuid)) then raise exception 'Duplicate claim'; end if;
 if public.ack_support_outbox(current_setting('test.business')::uuid,current_setting('test.outbox')::uuid,gen_random_uuid(),true,'provider-1') then raise exception 'Wrong claim accepted'; end if;
 if not public.ack_support_outbox(current_setting('test.business')::uuid,current_setting('test.outbox')::uuid,current_setting('test.claim')::uuid,true,'provider-1') then raise exception 'ACK failed'; end if;
 perform public.ack_support_outbox(current_setting('test.business')::uuid,current_setting('test.outbox')::uuid,current_setting('test.claim')::uuid,true,'provider-1');
 if (select count(*) from public.support_messages where conversation_id=current_setting('test.conv')::uuid)<>2 then raise exception 'Duplicate ACK message'; end if;
end $$;
select 'PASS: message deduplication, tenant isolation, reply deduplication, pause, claim isolation and ACK idempotency' as result;
rollback;
