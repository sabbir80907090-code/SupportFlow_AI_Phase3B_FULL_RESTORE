import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';

export const runtime='nodejs';

// Opt-in replacement ingress. Does not affect the legacy /api/telegram/webhook.
type TelegramUpdate={
  update_id?:number;
  message?:{
    message_id?:number;
    text?:string;
    chat?:{id?:number;type?:string;first_name?:string;last_name?:string};
    from?:{first_name?:string;last_name?:string};
  };
};
type WebhookConfig=Record<string,string>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secureEquals(a:string,b:string):boolean {
  const left=Buffer.from(a);const right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
function webhookSecrets():WebhookConfig|null {
  try {
    const value=JSON.parse(process.env.SUPPORTFLOW_TELEGRAM_WEBHOOK_SECRETS??'{}') as unknown;
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const entries=Object.entries(value);
    if(entries.some(([key,secret])=>!uuid.test(key)||typeof secret!=='string'||secret.length<16||secret.length>256))return null;
    return value as WebhookConfig;
  } catch {return null;}
}
export async function POST(req:NextRequest,context:{params:Promise<{connectionId:string}>}) {
  const {connectionId}=await context.params;
  if(!uuid.test(connectionId))return NextResponse.json({error:'Not found'},{status:404});
  const secrets=webhookSecrets();
  const expected=secrets?.[connectionId];
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
  if(!data?.duplicate && data?.conversationId){
    const {data:message,error:lookupError}=await db.from('support_messages').select('id')
      .eq('business_id',connection.business_id).eq('conversation_id',data.conversationId)
      .eq('event_id',String(message.message_id)).eq('direction','inbound').maybeSingle();
    if(lookupError||!message)return NextResponse.json({error:'Message job lookup failed'},{status:503});
    const {error:enqueueError}=await db.rpc('enqueue_support_ai_job',{
      p_business_id:connection.business_id,p_conversation_id:data.conversationId,p_message_id:message.id
    });
    if(enqueueError)return NextResponse.json({error:'AI job enqueue failed'},{status:503});
  }
  return NextResponse.json({ok:true,duplicate:Boolean(data?.duplicate)},{headers:{'Cache-Control':'no-store'}});
}
