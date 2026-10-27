begin;
-- All rows, messages, orders and queued replies in this test roll back.
do $$
declare b uuid; c uuid; c2 uuid; product uuid; foreign_product uuid; mid uuid; job uuid; token uuid; result text; draft jsonb; order_no text; n integer; ack uuid;
begin
 select id into b from public.businesses limit 1;
 if b is null then raise exception 'Test requires an existing business'; end if;
 insert into public.support_ai_settings(business_id,enabled) values(b,true) on conflict(business_id) do update set enabled=true;
 insert into public.support_conversations(business_id,channel,sender_id) values(b,'telegram','chat-order-test-'||gen_random_uuid()) returning id into c;
 insert into public.support_conversations(business_id,channel,sender_id) values(b,'telegram','chat-order-test-'||gen_random_uuid()) returning id into c2;
 insert into public.business_products(business_id,name,price,currency,stock_quantity) values(b,'SQL test shoes',32,'BDT',10) returning id into product;
 draft:=jsonb_build_object('product_id',product,'quantity',2,'name','Test Customer','phone','01700000000','address','Test Road, Dhaka','variant','42');
 -- Complete details produce a summary, not an order.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text) values(b,c,'details','inbound','অর্ডার চাই, নাম Test Customer, 01700000000, Test Road Dhaka, 2 pairs size 42') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 result:=public.reply_with_chat_order(job,token,'Collecting details',draft);
 if result<>'queued' or not exists(select 1 from public.support_order_drafts where conversation_id=c and summary is not null) then raise exception 'Summary missing'; end if;
 if exists(select 1 from public.orders where business_id=b and external_sender_id=(select sender_id from public.support_conversations where id=c)) then raise exception 'Premature order'; end if;
 -- Retries cannot duplicate the summary.
 perform public.reply_with_chat_order(job,token,'duplicate',draft);
 if (select count(*) from public.support_outbox where conversation_id=c)<>1 then raise exception 'Duplicate summary'; end if;
 -- A confirmation before summary delivery must not create an order.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c,'early','inbound','CONFIRM',now()+interval '1 second') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Confirm',null);
 if exists(select 1 from public.support_order_drafts where conversation_id=c and order_id is not null) then raise exception 'Undelivered confirmation accepted'; end if;
 update public.support_outbox set status='sent' where conversation_id=c;
 -- A price change forces a new summary before consent.
 update public.business_products set price=35 where id=product;
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c,'price','inbound','CONFIRM',now()+interval '2 seconds') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Confirm',null);
 if exists(select 1 from public.support_order_drafts where conversation_id=c and order_id is not null) then raise exception 'Changed price accepted'; end if;
 update public.support_outbox set status='sent' where conversation_id=c;
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c,'confirm','inbound','CONFIRM',now()+interval '3 seconds') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Confirm',null);
 select o.order_number into order_no from public.orders o join public.support_order_drafts d on d.order_id=o.id where d.conversation_id=c and o.status='pending' and total_amount=70 and delivery_phone='01700000000';
 if order_no is null then raise exception 'Order not saved at authoritative price'; end if;
 perform public.reply_with_chat_order(job,token,'Retry',null);
 if (select count(*) from public.orders where business_id=b and external_sender_id=(select sender_id from public.support_conversations where id=c))<>1 then raise exception 'Duplicate order'; end if;
 -- A fresh repeated CONFIRM is also idempotent, and shows real order number.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c,'repeat','inbound','CONFIRM',now()+interval '4 seconds') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Repeat',null);
 if (select count(*) from public.orders where business_id=b and external_sender_id=(select sender_id from public.support_conversations where id=c))<>1 then raise exception 'Repeated consent duplicated order'; end if;
 -- Another conversation cannot use the first customer's consent or draft.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text) values(b,c2,'other','inbound','CONFIRM') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c2,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Provide details',null);
 if exists(select 1 from public.support_order_drafts where conversation_id=c2 and order_id is not null) then raise exception 'Conversation leak'; end if;
 -- Insufficient stock cannot produce an order, even with complete fields.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c2,'stock','inbound','I want 20 pairs',now()+interval '1 second') returning id into mid;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c2,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 perform public.reply_with_chat_order(job,token,'Check stock',draft||'{"quantity":20}'::jsonb);
 if exists(select 1 from public.support_order_drafts where conversation_id=c2 and (summary is not null or order_id is not null)) then raise exception 'Insufficient stock accepted'; end if;
 -- Stale jobs and paused conversations cannot mutate drafts.
 insert into public.support_messages(business_id,conversation_id,event_id,direction,text,created_at) values(b,c2,'newer','inbound','Wait',now()+interval '2 seconds') returning id into mid;
 if public.reply_with_chat_order(job,token,'Old',draft)<>'skipped' then raise exception 'Stale job accepted'; end if;
 insert into public.support_ai_jobs(business_id,conversation_id,inbound_message_id,status,claim_token) values(b,c2,mid,'processing',gen_random_uuid()) returning id,claim_token into job,token;
 update public.support_conversations set ai_paused=true where id=c2;
 if public.reply_with_chat_order(job,token,'Paused',draft)<>'skipped' then raise exception 'Paused job accepted'; end if;
 update public.support_conversations set ai_paused=false where id=c2;
 -- CANCEL removes an unsubmitted draft without touching a previously submitted order.
 update public.support_messages set text='CANCEL' where id=mid;
 perform public.reply_with_chat_order(job,token,'Cancel',null);
 if exists(select 1 from public.support_order_drafts where conversation_id=c2) then raise exception 'Draft cancellation failed'; end if;
 -- Invalid claim tokens cannot mutate or enqueue.
 if public.reply_with_chat_order(job,gen_random_uuid(),'Bad token',draft)<>'skipped' then raise exception 'Invalid claim accepted'; end if;
 if has_table_privilege('authenticated','public.support_order_drafts','SELECT') or has_function_privilege('anon','public.reply_with_chat_order(uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'Public access'; end if;
end $$;
select 'PASS: summary, delivered consent, price recheck, atomic pending order, duplicate prevention, conversation isolation, claim token and private access' as result;
rollback;
