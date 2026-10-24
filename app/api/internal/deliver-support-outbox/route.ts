import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb,telegramSend} from '@/lib/telegram-server';

export const runtime='nodejs';
export const maxDuration=60;
function authorized(req:NextRequest){
 const secret=process.env.CRON_SECRET??'';
 const actual=Buffer.from(req.headers.get('authorization')??'');
 const expected=Buffer.from('Bearer '+secret);
 return secret.length>=24&&actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function GET(req:NextRequest){
 if(!authorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.SUPPORTFLOW_NEW_AI_ENABLED!=='true'||process.env.SUPPORTFLOW_NEW_DELIVERY_ENABLED!=='true')
  return NextResponse.json({enabled:false,processed:0},{headers:{'Cache-Control':'no-store'}});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!process.env.SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY)return NextResponse.json({error:'Delivery not configured'},{status:503});
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
  if(ids.length!==1)continue;
  let deliveryToken:string|undefined;
  {
   const {data:stored}=await db.from('support_telegram_credentials').select('bot_token_ciphertext').eq('connection_id',ids[0]).maybeSingle();
   if(stored){
    try{const {decryptChannelCredential}=await import('@/lib/support-channel-credentials');deliveryToken=decryptChannelCredential(stored.bot_token_ciphertext,ids[0]);}
    catch{continue;}
   }
  }
  if(!deliveryToken)continue;
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
    const {data:settings,error:settingsError}=await db.from('support_ai_settings').select('enabled').eq('business_id',businessId).maybeSingle();
    if(settingsError||!settings?.enabled)throw Error('business_ai_disabled');
    if(se||!conversation||conversation.ai_paused||conversation.channel!=='telegram'||
       conversation.sender_id!==item.recipient)throw Error('conversation_not_sendable');
    // Telegram message delivery has an ambiguous outcome on network timeouts.
    // Never automatically resend a claimed item: manual review avoids duplicates.
    providerId=await telegramSend(deliveryToken,item.recipient,item.text);
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
