-- Run with an administrative test connection. All test rows are rolled back.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.owner')::uuid),(current_setting('test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
select set_config('test.business',public.create_business('Workflow verification')::text,true);
select public.rotate_workflow_token(current_setting('test.business')::uuid,repeat('a',64));
set local role service_role;
select set_config('test.payload',jsonb_build_object('channel','telegram','senderId','test-sender','idempotencyKey','verification-event-1','name','Test Customer','phone','01700000000','email','test@example.com','address','Test Road, Dhaka','product','Verified test product')::text,true);
select set_config('test.result',public.intake_workflow_order(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb)::text,true);
do $$ declare result jsonb; begin
 result:=public.intake_workflow_order(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb);
 if not (result->>'duplicate')::boolean then raise exception 'Duplicate protection failed'; end if;
 if (select count(*) from public.orders where business_id=current_setting('test.business')::uuid)<>1 then raise exception 'Duplicate row'; end if;
 if (select count(*) from public.order_events where business_id=current_setting('test.business')::uuid)<>1 then raise exception 'Duplicate event'; end if;
 begin
 perform public.intake_workflow_order(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb||'{"senderId":"attacker"}'::jsonb);
 raise exception 'TEST FAILED: identity reuse allowed';
 exception when raise_exception then if SQLERRM like 'TEST FAILED%' then raise; end if; end;
end $$;
select set_config('test.order',(select id::text from public.orders where business_id=current_setting('test.business')::uuid),true);
set local role authenticated;
select public.decide_order(current_setting('test.order')::uuid,'confirmed');
do $$ begin
 if (select status from public.orders where id=current_setting('test.order')::uuid)<>'confirmed' then raise exception 'Decision failed'; end if;
 begin perform public.decide_order(current_setting('test.order')::uuid,'rejected'); raise exception 'TEST FAILED: duplicate decision';
 exception when raise_exception then if SQLERRM like 'TEST FAILED%' then raise; end if; end;
 begin perform token_hash from public.workflow_credentials; raise exception 'TEST FAILED: key exposed'; exception when insufficient_privilege then null; end;
 begin perform public.intake_workflow_order(current_setting('test.business')::uuid,current_setting('test.payload')::jsonb); raise exception 'TEST FAILED: browser intake allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.orders where id=current_setting('test.order')::uuid) then raise exception 'Tenant leak'; end if;
 if exists(select 1 from public.order_events where business_id=current_setting('test.business')::uuid) then raise exception 'Event leak'; end if;
 begin perform public.rotate_workflow_token(current_setting('test.business')::uuid,repeat('b',64)); raise exception 'TEST FAILED: key takeover'; exception when insufficient_privilege then null; end;
 begin perform public.decide_order(current_setting('test.order')::uuid,'rejected'); raise exception 'TEST FAILED: other tenant decision'; exception when insufficient_privilege then null; end;
end $$;
select 'PASS: intake, idempotency, identity conflict, approval, repeat decision, key isolation and tenant isolation' as verification;
rollback;
