-- Server-only chat order drafts; final shop approval remains in decide_order.
create table public.support_order_drafts (
 business_id uuid not null references public.businesses(id) on delete cascade,
 conversation_id uuid primary key,
 details jsonb not null default '{}'::jsonb,
 summary jsonb,
 summary_outbox_id uuid,
 order_id uuid references public.orders(id),
 updated_at timestamptz not null default now(),
 foreign key(business_id,conversation_id) references public.support_conversations(business_id,id) on delete cascade
);
create index support_order_drafts_business_idx on public.support_order_drafts(business_id);
alter table public.support_order_drafts enable row level security;
revoke all on public.support_order_drafts from public,anon,authenticated;
grant all on public.support_order_drafts to service_role;
create or replace function public.reply_with_chat_order(p_job_id uuid,p_claim_token uuid,p_reply text,p_patch jsonb default null)
returns text language plpgsql security invoker set search_path='' as $$
declare j public.support_ai_jobs; c public.support_conversations; m public.support_messages;
 d public.support_order_drafts; p public.business_products; o public.orders;
 details jsonb; snapshot jsonb; summary_id uuid; customer uuid; qty integer;
 reply text:=p_reply; control text; missing text:=''; bn boolean; subtotal numeric;
begin
 select * into j from public.support_ai_jobs where id=p_job_id and status='processing' and claim_token=p_claim_token for update;
 if not found then return 'skipped'; end if;
 select * into c from public.support_conversations where id=j.conversation_id and business_id=j.business_id for update;
 if not found or c.ai_paused or not exists(select 1 from public.support_ai_settings where business_id=j.business_id and enabled) then return 'skipped'; end if;
 select * into m from public.support_messages where business_id=j.business_id and conversation_id=c.id and direction='inbound' order by created_at desc,id desc limit 1;
 if m.id is distinct from j.inbound_message_id then return 'skipped'; end if;
 if exists(select 1 from public.support_outbox where business_id=j.business_id and request_id=j.id) then return 'queued'; end if;
 bn:=m.text ~ '[ঀ-৿]' or exists(select 1 from public.support_messages where business_id=j.business_id and conversation_id=c.id and direction='inbound' and text ~ '[ঀ-৿]');
 control:=lower(regexp_replace(trim(m.text),'[.!।[:space:]]+$','','g'));
 select * into d from public.support_order_drafts where business_id=j.business_id and conversation_id=c.id for update;
 if d.updated_at<now()-interval '24 hours' and d.order_id is null then delete from public.support_order_drafts where conversation_id=c.id; d:=null; end if;
 if control in ('cancel','বাতিল') then
  if d.order_id is null then
   delete from public.support_order_drafts where conversation_id=c.id;
   reply:=case when bn then 'অর্ডারের খসড়া বাতিল করা হয়েছে।' else 'The order draft has been cancelled.' end;
  else reply:=case when bn then 'জমা দেওয়া অর্ডার বাতিল করতে দোকানের কর্মীর সাহায্য প্রয়োজন।' else 'Please contact the shop to cancel the submitted order.' end; end if;
 elsif control in ('new order','নতুন অর্ডার') then
  delete from public.support_order_drafts where conversation_id=c.id;
  reply:=case when bn then 'নতুন অর্ডারে কোন পণ্যটি এবং কতটি চান? নাম, ফোন, Gmail/ইমেইল ও ঠিকানাও দিন।' else 'Which product and quantity would you like? Please provide your name, phone, Gmail/email and delivery address.' end;
 elsif d.order_id is not null and control in ('confirm','confirm order','yes','হ্যাঁ','কনফার্ম','অর্ডার কনফার্ম','নিশ্চিত') then
  select * into o from public.orders where id=d.order_id and business_id=j.business_id;
  reply:=case when bn then 'আপনার অর্ডার #'||o.order_number||' আগেই জমা হয়েছে। বর্তমান স্ট্যাটাস: '||o.status||'।' else 'Order #'||o.order_number||' was already submitted. Status: '||o.status||'.' end;
 elsif d.order_id is null and (p_patch is not null or (d.summary is not null and control in ('confirm','confirm order','yes','হ্যাঁ','কনফার্ম','অর্ডার কনফার্ম','নিশ্চিত'))) then
  if p_patch is not null and (jsonb_typeof(p_patch)<>'object' or length(p_patch::text)>4000 or (p_patch - array['product_id','quantity','name','phone','email','address','variant'])<>'{}'::jsonb) then raise exception 'Invalid draft'; end if;
  details:=coalesce(d.details,'{}'::jsonb)||coalesce(p_patch,'{}'::jsonb);
  if coalesce(details->>'quantity','') ~ '^[0-9]{1,3}$' then qty:=(details->>'quantity')::integer; end if;
  if coalesce(details->>'product_id','') ~ '^[0-9a-f-]{36}$' then
   select * into p from public.business_products where id=(details->>'product_id')::uuid and business_id=j.business_id and is_active for update;
  end if;
  if p.id is null then missing:=missing||case when bn then 'পণ্যের নাম, ' else 'product, ' end; end if;
  if qty is null or qty not between 1 and 100 then missing:=missing||case when bn then 'পরিমাণ, ' else 'quantity, ' end; end if;
  if length(trim(coalesce(details->>'name',''))) not between 2 and 160 then missing:=missing||case when bn then 'নাম, ' else 'name, ' end; end if;
  if coalesce(details->>'phone','') !~ '^01[3-9][0-9]{8}$' then missing:=missing||case when bn then '১১ সংখ্যার মোবাইল নম্বর, ' else '11-digit Bangladesh mobile number, ' end; end if;
  if coalesce(details->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(details->>'email',''))>254 then missing:=missing||case when bn then 'Gmail/ইমেইল ঠিকানা, ' else 'Gmail/email address, ' end; end if;
  if length(trim(coalesce(details->>'address',''))) not between 8 and 1000 then missing:=missing||case when bn then 'সম্পূর্ণ ঠিকানা, ' else 'full delivery address, ' end; end if;
  if length(coalesce(details->>'variant',''))>200 then raise exception 'Invalid variant'; end if;
  if missing<>'' then
   reply:=case when bn then 'অর্ডার নিতে দয়া করে দিন: ' else 'To take your order, please provide: ' end||rtrim(missing,', ')||'.';
  elsif p.stock_quantity<qty then
   reply:=case when bn then 'এই পরিমাণ পণ্য স্টকে নেই। কম পরিমাণ বেছে নিন অথবা দোকানের কর্মীর সঙ্গে কথা বলুন।' else 'There is insufficient listed stock. Choose a smaller quantity or ask the shop.' end;
  else
   subtotal:=p.price*qty;
   snapshot:=jsonb_build_object('product_id',p.id,'name',p.name,'price',p.price,'currency',p.currency,'quantity',qty,'customer',details);
   if control in ('confirm','confirm order','yes','হ্যাঁ','কনফার্ম','অর্ডার কনফার্ম','নিশ্চিত') and d.summary=snapshot and exists(select 1 from public.support_outbox where id=d.summary_outbox_id and business_id=j.business_id and conversation_id=c.id and status='sent') then
    insert into public.customers(business_id,name,phone,email,source_channel) values(j.business_id,details->>'name',details->>'phone',details->>'email',c.channel) returning id into customer;
    insert into public.orders(business_id,customer_id,product_details,total_amount,currency,source_channel,external_sender_id,intake_key,delivery_name,delivery_phone,delivery_email,delivery_address)
    values(j.business_id,customer,p.name||' × '||qty||coalesce(' | Variant: '||(details->>'variant'),'')||' | Unit price: '||p.currency||' '||p.price||' | Delivery charge not included',subtotal,p.currency,c.channel,c.sender_id,'chat:'||j.id,details->>'name',details->>'phone',details->>'email',details->>'address') returning * into o;
    reply:=case when bn then 'আপনার অর্ডার #'||o.order_number||' জমা হয়েছে। পণ্যের মোট মূল্য: '||p.currency||' '||subtotal||'। ডেলিভারি চার্জ আলাদা। দোকানের অনুমোদন বাকি (pending); পেমেন্ট বা স্টক সংরক্ষণ নিশ্চিত করা হয়নি।' else 'Order #'||o.order_number||' submitted. Product subtotal: '||p.currency||' '||subtotal||'. Delivery charge is separate. Pending shop approval; payment and stock reservation are not confirmed.' end;
   else
    summary_id:=gen_random_uuid();
    reply:=case when bn then 'অর্ডারের সারাংশ:' else 'Order summary:' end||E'\n'||p.name||' × '||qty||coalesce(' | '||(details->>'variant'),'')||E'\n'||p.currency||' '||subtotal||case when bn then ' (ডেলিভারি চার্জ আলাদা)' else ' (delivery charge separate)' end||E'\n'||(details->>'name')||E'\n'||(details->>'phone')||E'\n'||(details->>'email')||E'\n'||(details->>'address')||E'\n'||case when bn then 'তথ্য সঠিক হলে CONFIRM লিখুন। পরিবর্তন থাকলে লিখে জানান। বাতিল করতে CANCEL লিখুন। দোকানের অনুমোদন বাকি থাকবে।' else 'Reply CONFIRM if correct, send corrections, or CANCEL. The order will require shop approval.' end;
   end if;
  end if;
  insert into public.support_order_drafts(business_id,conversation_id,details,summary,summary_outbox_id,order_id)
   values(j.business_id,c.id,details,case when summary_id is not null then snapshot else null end,summary_id,o.id)
   on conflict(conversation_id) do update set details=excluded.details,summary=excluded.summary,summary_outbox_id=excluded.summary_outbox_id,order_id=excluded.order_id,updated_at=now();
 end if;
 if length(trim(coalesce(reply,'')))=0 then raise exception 'Missing reply'; end if;
 insert into public.support_outbox(id,business_id,conversation_id,channel,recipient,text,request_id)
 values(coalesce(summary_id,gen_random_uuid()),j.business_id,c.id,c.channel,c.sender_id,left(reply,case when c.channel='messenger' then 2000 else 4096 end),j.id);
 return 'queued';
end $$;
revoke all on function public.reply_with_chat_order(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reply_with_chat_order(uuid,uuid,text,jsonb) to service_role;
