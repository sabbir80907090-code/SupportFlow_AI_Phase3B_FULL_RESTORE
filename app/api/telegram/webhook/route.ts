import {NextRequest,NextResponse,after} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb,getServerConfig} from '@/lib/telegram-server';
import {processTelegramAiQueue} from '@/lib/telegram-ai';
import {handleTelegramOrderMessage} from '@/lib/telegram-orders';

export const runtime='nodejs';

function equalSecret(a:string,b:string) {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}

type TelegramUpdate={message?:{
  message_id?:number;
  text?:string;
  chat?:{id?:number;type?:string;first_name?:string;last_name?:string;username?:string};
  from?:{first_name?:string;last_name?:string;username?:string};
}};

export async function POST(req:NextRequest) {
  let config:ReturnType<typeof getServerConfig>;
  try {config=getServerConfig();} catch {return NextResponse.json({error:'Server not configured'},{status:503});}
  const token=req.headers.get('x-telegram-bot-api-secret-token')??'';
  if(!equalSecret(token,config.webhookSecret))return NextResponse.json({error:'Unauthorized'},{status:401});
  let update:TelegramUpdate;
  try {update=await req.json() as TelegramUpdate;}catch{return NextResponse.json({error:'Bad JSON'},{status:400});}
  const msg=update.message;
  // Phase 3A handles plain-text messages in private chats only.
  if(!msg||msg.chat?.type!=='private'||typeof msg.chat.id!=='number'||
     !Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.message_id)||
     typeof msg.text!=='string'||msg.text.trim().length===0)
    return NextResponse.json({ok:true,ignored:true});
  const text=msg.text.trim().slice(0,4096);
  const chatId=String(msg.chat.id);
  const name=[msg.from?.first_name??msg.chat.first_name,msg.from?.last_name??msg.chat.last_name]
    .filter(Boolean).join(' ').trim().slice(0,160)||'Telegram user';
  const username=(msg.from?.username??msg.chat.username??'').slice(0,100)||null;
  const db=adminDb(config.url,config.secret);
  // Upsert is safe for repeated Telegram webhook deliveries.
  const {data:conversation,error:ce}=await db.from('telegram_conversations').upsert({
    business_id:config.businessId,external_chat_id:chatId,display_name:name,
    username,last_message_at:new Date().toISOString()
  },{onConflict:'business_id,external_chat_id'}).select('id').single();
  if(ce||!conversation){console.error('Telegram conversation write failed',ce?.code);return NextResponse.json({error:'Database write failed'},{status:500});}
  const {error:me}=await db.from('telegram_messages').upsert({
    business_id:config.businessId,conversation_id:conversation.id,direction:'inbound',
    text,telegram_message_id:String(msg.message_id)
  },{onConflict:'business_id,conversation_id,telegram_message_id',ignoreDuplicates:true});
  if(me){console.error('Telegram message write failed',me.code);return NextResponse.json({error:'Message write failed'},{status:500});}
  // Human handoff must take priority over guided order intake and Gemini AI.
  // A direct request for a human pauses AI for this chat. No automated reply is sent.
  if(/\b(human|real person|live agent|speak to (an? )?(agent|person)|talk to (an? )?(agent|person))\b/i.test(text) ||
     /(মানুষের সাথে|মানুষের সঙ্গে|এজেন্টের সাথে|এজেন্টের সঙ্গে|কাস্টমার কেয়ার|কাস্টমার কেয়ার)/.test(text)) {
    const {error:pauseError}=await db.from('telegram_conversations').update({ai_paused:true}).eq('business_id',config.businessId).eq('id',conversation.id);
    if(pauseError)console.error('AI handoff pause failed',pauseError.code);
    return NextResponse.json({ok:true,handoff:true});
  }
  // Phase 3C is opt-in; with the flag off, Phase 3B works unchanged.
  try {
    if(await handleTelegramOrderMessage(conversation.id,msg.message_id!,text))
      return NextResponse.json({ok:true,order_flow:true});
  }catch(e){
    console.error('Phase 3C order handling failed',e instanceof Error?e.message:String(e));
    return NextResponse.json({error:'Order intake temporarily unavailable'},{status:500});
  }
  const {data:settings,error:settingsError}=await db.from('telegram_ai_settings')
    .select('auto_reply_enabled').eq('business_id',config.businessId).maybeSingle();
  if(settingsError){console.error('AI settings read failed',settingsError.code);return NextResponse.json({ok:true,ai:'settings_unavailable'});}
  if(settings?.auto_reply_enabled){
    const {data:chatState,error:chatError}=await db.from('telegram_conversations').select('ai_paused')
      .eq('business_id',config.businessId).eq('id',conversation.id).maybeSingle();
    if(chatError){console.error('AI chat state read failed',chatError.code);return NextResponse.json({ok:true,ai:'state_unavailable'});}
    if(!chatState?.ai_paused){
      const {data:inbound,error:inboundError}=await db.from('telegram_messages').select('id')
        .eq('business_id',config.businessId).eq('conversation_id',conversation.id)
        .eq('telegram_message_id',String(msg.message_id)).eq('direction','inbound').maybeSingle();
      if(inboundError||!inbound){console.error('AI inbound lookup failed',inboundError?.code);return NextResponse.json({ok:true,ai:'lookup_failed'});}
      const {data:job,error:jobError}=await db.from('telegram_ai_jobs').upsert({
        business_id:config.businessId,conversation_id:conversation.id,inbound_message_id:inbound.id
      },{onConflict:'business_id,inbound_message_id',ignoreDuplicates:true}).select('id').maybeSingle();
      if(jobError){console.error('AI enqueue failed',jobError.code);return NextResponse.json({ok:true,ai:'enqueue_failed'});}
      // after() runs outside Telegram's response path; the database job prevents duplicate sends.
      if(job?.id)after(()=>processTelegramAiQueue(job.id));
      else {
        // A repeated webhook may safely wake a queued job; the SQL claim is atomic.
        const {data:existing}=await db.from('telegram_ai_jobs').select('id,status')
          .eq('business_id',config.businessId).eq('inbound_message_id',inbound.id).maybeSingle();
        if(existing?.status==='queued')after(()=>processTelegramAiQueue(existing.id));
      }
    }
  }
  return NextResponse.json({ok:true});
}
