import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb,telegramSend} from '@/lib/telegram-server';

export const runtime='nodejs';
export const maxDuration=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function authorized(req:NextRequest){
 const secret=process.env.CRON_SECRET??'';
 const actual=req.headers.get('authorization')??'';
 const expected='Bearer '+secret;
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return secret.length>=24&&a.length===b.length&&timingSafeEqual(a,b);
}
function tokens():Record<string,string>|null{
 try{
  const raw=JSON.parse(process.env.SUPPORTFLOW_TELEGRAM_BOT_TOKENS??'{}') as unknown;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const entries=Object.entries(raw);
  if(entries.some(([id,value])=>!uuid.test(id)||typeof value!=='string'||!/^\\d{5,}:[A-Za-z0-9_-]{20,}$/.test(value)))return null;
  // Never allow this new worker to send through the existing production Telegram bot.
  if(entries.some(([,value])=>value===process.env.TELEGRAM_BOT_TOKEN))return null;
  return raw as Record<string,string>;
 }catch{return null;}
}
export async function GET(req:NextRequest){
 if(!authorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.SUPPORTFLOW_NEW_AI_ENABLED!=='true'||process.env.SUPPORTFLOW_NEW_DELIVERY_ENABLED!=='true')
  return NextResponse.json({enabled:false,processed:0},{headers:{'Cache-Control':'no-store'}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const configured=tokens();
 if(!url||!key||!configured)return NextResponse.json({error:'Delivery not configured'},{status:503});
 const db=adminDb(url,key);
 const {data:connections,error:ce}=await db.from('support_channel_connections')
  .select('id,business_id,channel,enabled').eq('channel','telegram').eq('enabled',true);
 if(ce)return NextResponse.json({error:'Connections unavailable'},{status:503});
 // Existing outbox rows have no connection_id. Only route tenants with exactly one
 // enabled Telegram connection, and never fall back to another tenant's bot.
 const byBusiness=new Map<string,string[]>();
 for(const connection of connections??[]){
  const list=byBusiness.get(connection.business_id)??[];
  list.push(connection.id);byBusiness.set(connection.business_id,list);
 }
 let processed=0,review=0;
 for(const [businessId,ids] of byBusiness){
  if(processed>=10)break;
  if(ids.length!==1||!configured[ids[0]])continue;
  const {data:claimed,error:claimError}=await db.rpc('claim_support_outbox',{p_business_id:businessId});
  if(claimError){console.error('Outbox claim failed',claimError.code);continue;}
  for(const item of claimed??[]){
   processed++;
   let sent=false,providerId:string|null=null;
   try{
    if(item.channel!=='telegram'||!item.conversation_id)throw Error('unsupported_outbox_item');
    const {data:conversation,error:se}=await db.from('support_conversations')
     .select('ai_paused,channel,sender_id').eq('business_id',businessId)
     .eq('id',item.conversation_id).maybeSingle();
    if(se||!conversation||conversation.ai_paused||conversation.channel!=='telegram'||
       conversation.sender_id!==item.recipient)throw Error('conversation_not_sendable');
    // Telegram message delivery has an ambiguous outcome on network timeouts.
    // Never automatically resend a claimed item: manual review avoids duplicates.
    providerId=await telegramSend(configured[ids[0]],item.recipient,item.text);
    sent=true;
   }catch(e){console.error('Outbox delivery requires review',e instanceof Error?e.message:'unknown');review++;}
   const {error:ackError}=await db.rpc('ack_support_outbox',{
    p_business_id:businessId,p_id:item.id,p_claim_token:item.claim_token,
    p_sent:sent,p_provider_id:providerId
   });
   if(ackError)console.error('Outbox acknowledgement failed',ackError.code);
   if(processed>=10)break;
  }
 }
 return NextResponse.json({processed,needsReview:review},{headers:{'Cache-Control':'no-store'}});
}
