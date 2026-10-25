import {NextRequest,NextResponse} from 'next/server';
import {db,failure} from '@/lib/support-telegram-connect';
import {metaConfig} from '@/lib/messenger';
import {secureEqual,validMetaSignature,messengerEvents,asksForHuman} from '@/lib/messenger-security';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const config=metaConfig();if(!config)return failure('Webhook unavailable',503);
 const q=req.nextUrl.searchParams,challenge=q.get('hub.challenge');
 if(q.get('hub.mode')!=='subscribe'||!secureEqual(q.get('hub.verify_token')??'',config.verifyToken)||!challenge||challenge.length>512)return failure('Verification rejected',403);
 return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const config=metaConfig();if(!config)return failure('Webhook unavailable',503);
 if(Number(req.headers.get('content-length')??0)>256000)return failure('Payload too large',413);
 const raw=await req.text();if(Buffer.byteLength(raw)>256000)return failure('Payload too large',413);
 if(!validMetaSignature(raw,req.headers.get('x-hub-signature-256')??'',config.appSecret))return failure('Invalid signature',401);
 let payload:unknown;try{payload=JSON.parse(raw)}catch{return failure('Invalid JSON')}
 const events=messengerEvents(payload);if(events.length>100)return failure('Too many events',413);
 try{
  const database=db();
  for(const event of events){
   const {data:c,error:ce}=await database.from('support_channel_connections').select('id,business_id,enabled').eq('channel','messenger').eq('external_account_id',event.pageId).maybeSingle();
   if(ce)return failure('Connection lookup unavailable',503);
   if(!c?.enabled)continue;
   const {data:ingested,error:ie}=await database.rpc('ingest_support_message',{p_business_id:c.business_id,p_input:{channel:'messenger',senderId:event.senderId,displayName:'Messenger customer',eventId:event.eventId,direction:'inbound',kind:'text',text:event.text}});
   if(ie||!ingested?.conversationId)return failure('Message ingestion unavailable',503);
   const conversationId=ingested.conversationId;
   // Timestamp comes from a signed Meta event; retries must not reopen the 24h response window.
   const {error:we}=await database.rpc('record_messenger_inbound',{p_business_id:c.business_id,p_conversation_id:conversationId,p_received_at:new Date(event.timestamp).toISOString()});
   if(we)return failure('Conversation window unavailable',503);
   if(asksForHuman(event.text)){
    const {error}=await database.from('support_conversations').update({ai_paused:true}).eq('business_id',c.business_id).eq('id',conversationId);
    if(error)return failure('Handoff unavailable',503);
    continue;
   }
   if(process.env.SUPPORTFLOW_NEW_AI_ENABLED!=='true')continue;
   const {data:settings,error:se}=await database.from('support_ai_settings').select('enabled').eq('business_id',c.business_id).maybeSingle();
   if(se)return failure('AI settings unavailable',503);if(!settings?.enabled||ingested.aiPaused)continue;
   const {data:message,error:me}=await database.from('support_messages').select('id').eq('business_id',c.business_id).eq('conversation_id',conversationId).eq('direction','inbound').eq('event_id',event.eventId).maybeSingle();
   if(me||!message)return failure('Message lookup unavailable',503);
   const {error:je}=await database.rpc('enqueue_support_ai_job',{p_business_id:c.business_id,p_conversation_id:conversationId,p_message_id:message.id});
   if(je)return failure('AI enqueue unavailable',503);
  }
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Webhook temporarily unavailable',503);}
}
