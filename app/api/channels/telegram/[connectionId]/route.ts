import {NextRequest,NextResponse,after} from 'next/server';
import {processSupportAiJob} from '@/lib/support-ai-engine';
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';

export const runtime='nodejs';
export const maxDuration=60;

// Dashboard-managed Telegram ingress. Credentials are stored per connection.
type TelegramUpdate={
  update_id?:number;
  message?:{
    message_id?:number;
    text?:string;
    chat?:{id?:number;type?:string;first_name?:string;last_name?:string};
    from?:{first_name?:string;last_name?:string};
  };
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function secureEquals(a:string,b:string):boolean {
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length&&timingSafeEqual(left,right);
}
export async function POST(req:NextRequest,context:{params:Promise<{connectionId:string}>}) {
  const {connectionId}=await context.params;
  if(!uuid.test(connectionId))return NextResponse.json({error:'Not found'},{status:404});
  let expected:string|undefined;
  {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)return NextResponse.json({error:'Not configured'},{status:503});
    const database=adminDb(url,key);
    const {data:credential}=await database.from('support_telegram_credentials').select('webhook_secret_ciphertext').eq('connection_id',connectionId).maybeSingle();
    if(credential){
      try{const {decryptChannelCredential}=await import('@/lib/support-channel-credentials');expected=decryptChannelCredential(credential.webhook_secret_ciphertext,connectionId);}
      catch{return NextResponse.json({error:'Not configured'},{status:503});}
    }
  }
  if(!expected)return NextResponse.json({error:'Not configured'},{status:503});
  if(!secureEquals(req.headers.get('x-telegram-bot-api-secret-token')??'',expected))
    return NextResponse.json({error:'Unauthorized'},{status:401});
  const size=Number(req.headers.get('content-length')??'0');
  if(!Number.isFinite(size)||size>20000)return NextResponse.json({error:'Payload too large'},{status:413});
  const raw=await req.text();
  if(raw.length>20000)return NextResponse.json({error:'Payload too large'},{status:413});
  let update:TelegramUpdate;
  try {update=JSON.parse(raw) as TelegramUpdate;}catch{return NextResponse.json({error:'Bad JSON'},{status:400});}
  const message=update?.message;
  if(!message||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat?.id)||
    !Number.isSafeInteger(message.message_id)||typeof message.text!=='string'||!message.text.trim())
    return NextResponse.json({ok:true,ignored:true});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return NextResponse.json({error:'Server not configured'},{status:503});
  const db=adminDb(url,secret);
  const {data:connection,error:connectionError}=await db.from('support_channel_connections')
    .select('business_id,channel,enabled').eq('id',connectionId).maybeSingle();
  if(connectionError)return NextResponse.json({error:'Connection lookup failed'},{status:503});
  if(!connection||connection.channel!=='telegram'||!connection.enabled)
    return NextResponse.json({error:'Not found'},{status:404});
  const name=[message.from?.first_name??message.chat?.first_name,
    message.from?.last_name??message.chat?.last_name].filter(Boolean).join(' ').slice(0,160)||'Telegram user';
  const {data,error}=await db.rpc('ingest_support_message',{
    p_business_id:connection.business_id,
    p_input:{
      channel:'telegram',senderId:String(message.chat!.id),
      displayName:name,eventId:String(message.message_id),
      direction:'inbound',kind:'text',text:message.text.trim().slice(0,12000)
    }
  });
  if(error){console.error('SupportFlow Telegram ingress error',error.code);
    return NextResponse.json({error:'Message ingestion failed'},{status:503});}
  if(data?.conversationId){
    const wantsHuman=/\b(human|real person|live agent|speak to (an? )?(agent|person)|talk to (an? )?(agent|person))\b/i.test(message.text)||/(মানুষের সাথে|মানুষের সঙ্গে|এজেন্টের সাথে|এজেন্টের সঙ্গে|কাস্টমার কেয়ার|কাস্টমার কেয়ার)/.test(message.text);
    if(wantsHuman){
      const {error:pauseError}=await db.from('support_conversations').update({ai_paused:true})
        .eq('business_id',connection.business_id).eq('id',data.conversationId);
      if(pauseError)return NextResponse.json({error:'Handoff state failed'},{status:503});
      return NextResponse.json({ok:true,handoff:true});
    }
    if(process.env.SUPPORTFLOW_NEW_AI_ENABLED!=='true')
      return NextResponse.json({ok:true,ai:'disabled'});
    const {data:storedMessage,error:lookupError}=await db.from('support_messages').select('id')
      .eq('business_id',connection.business_id).eq('conversation_id',data.conversationId)
      .eq('event_id',String(message.message_id)).eq('direction','inbound').maybeSingle();
    if(lookupError||!storedMessage)return NextResponse.json({error:'Message job lookup failed'},{status:503});
    const {data:jobId,error:enqueueError}=await db.rpc('enqueue_support_ai_job',{
      p_business_id:connection.business_id,p_conversation_id:data.conversationId,p_message_id:storedMessage.id
    });
    if(enqueueError||!jobId)return NextResponse.json({error:'AI job enqueue failed'},{status:503});
    // Process the newly queued message promptly without relying solely on a cron scheduler.
    // The durable queue remains the fallback if this background execution fails.
    if(!data.duplicate){
      after(async()=>{
        try{
          const outcome=await processSupportAiJob(jobId);
          if(outcome!=='queued')return;
          const base=process.env.SUPPORTFLOW_PUBLIC_WEBHOOK_BASE_URL;
          const cronSecret=process.env.CRON_SECRET;
          if(!base||!cronSecret)return;
          const endpoint=new URL('/api/internal/deliver-support-outbox',base);
          if(endpoint.protocol!=='https:')return;
          const response=await fetch(endpoint,{headers:{authorization:'Bearer '+cronSecret},cache:'no-store',signal:AbortSignal.timeout(20000)});
          if(!response.ok)console.error('SupportFlow immediate delivery failed',response.status);
        }catch(error){console.error('SupportFlow immediate AI processing failed',error instanceof Error?error.message:'unknown');}
      });
    }
  }
  return NextResponse.json({ok:true,duplicate:Boolean(data?.duplicate)},{headers:{'Cache-Control':'no-store'}});
}
