import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Not found',{status:404});
 const path=new URL(req.url).pathname;
 const connectionId=path.split('/').filter(Boolean).at(-1)||'';
 if(!uuid.test(connectionId))return new Response('Not found',{status:404});
 const secret=req.headers.get('x-telegram-bot-api-secret-token')||'';
 if(!/^[A-Za-z0-9_-]{16,256}$/.test(secret))return new Response('Unauthorized',{status:401});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response('Unavailable',{status:503});
 const db=createClient(url,key,{auth:{persistSession:false}});
 const {data:credential,error:ce}=await db.from('support_telegram_credentials').select('webhook_secret_sha256').eq('connection_id',connectionId).maybeSingle();
 if(ce||!credential?.webhook_secret_sha256)return new Response('Not found',{status:404});
 const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(secret))));
 const a=enc.encode(digest),b=enc.encode(credential.webhook_secret_sha256);
 let mismatch=a.length^b.length;for(let i=0;i<Math.min(a.length,b.length);i++)mismatch|=a[i]^b[i];
 if(mismatch)return new Response('Unauthorized',{status:401});
 const {data:connection,error:connError}=await db.from('support_channel_connections').select('business_id,enabled,channel').eq('id',connectionId).maybeSingle();
 if(connError||!connection||connection.channel!=='telegram'||!connection.enabled)return new Response('Not found',{status:404});
 const raw=await req.text();if(raw.length>20000)return new Response('Too large',{status:413});
 let update:any;try{update=JSON.parse(raw)}catch{return new Response('Bad JSON',{status:400})}
 const m=update?.message;
 if(!m||m.chat?.type!=='private'||!Number.isSafeInteger(m.chat?.id)||!Number.isSafeInteger(m.message_id)||typeof m.text!=='string'||!m.text.trim())return Response.json({ok:true,ignored:true});
 const displayName=[m.from?.first_name||m.chat?.first_name,m.from?.last_name||m.chat?.last_name].filter(Boolean).join(' ').slice(0,160)||'Telegram user';
 const {data,error}=await db.rpc('ingest_support_message',{p_business_id:connection.business_id,p_input:{channel:'telegram',senderId:String(m.chat.id),displayName,eventId:String(m.message_id),direction:'inbound',kind:'text',text:m.text.trim().slice(0,12000)}});
 if(error)return new Response('Ingestion unavailable',{status:503});
 const wantsHuman=/\b(human|real person|live agent|speak to (an? )?(agent|person)|talk to (an? )?(agent|person))\b/i.test(m.text)||/(মানুষের সাথে|মানুষের সঙ্গে|এজেন্টের সাথে|এজেন্টের সঙ্গে|কাস্টমার কেয়ার|কাস্টমার কেয়ার)/.test(m.text);
 if(data?.conversationId&&wantsHuman){const {error:e}=await db.from('support_conversations').update({ai_paused:true}).eq('business_id',connection.business_id).eq('id',data.conversationId);if(e)return new Response('Handoff unavailable',{status:503});}
 if(data?.conversationId&&!wantsHuman){
   const {data:settings,error:settingsError}=await db.from('support_ai_settings').select('enabled').eq('business_id',connection.business_id).maybeSingle();
   if(settingsError)return new Response('AI settings unavailable',{status:503});
   if(settings?.enabled){
     const {data:message,error:lookupError}=await db.from('support_messages').select('id')
       .eq('business_id',connection.business_id).eq('conversation_id',data.conversationId)
       .eq('event_id',String(m.message_id)).eq('direction','inbound').maybeSingle();
     if(lookupError||!message)return new Response('Message lookup unavailable',{status:503});
     const {error:jobError}=await db.rpc('enqueue_support_ai_job',{
       p_business_id:connection.business_id,p_conversation_id:data.conversationId,p_message_id:message.id
     });
     if(jobError)return new Response('AI enqueue unavailable',{status:503});
   }
 }
 return Response.json({ok:true,duplicate:Boolean(data?.duplicate),handoff:wantsHuman});
});
