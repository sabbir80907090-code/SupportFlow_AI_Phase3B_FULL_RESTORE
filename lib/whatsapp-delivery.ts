import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';
import {whatsappGraph,whatsappRecipient,withinWhatsAppWindow,whatsappConfig} from '@/lib/whatsapp';
export async function deliverWhatsAppOutbox(limit=10){
 let processed=0,needsReview=0;if(!whatsappConfig())return {processed,needsReview};
 const database=db();
 const {data:connections,error}=await database.from('support_channel_connections').select('id,business_id,external_account_id').eq('channel','whatsapp').eq('enabled',true);
 if(error)throw Error('WhatsApp connections unavailable');
 for(const c of connections??[]){
  if(processed>=limit)break;
  const {data:stored,error:storedError}=await database.from('support_whatsapp_credentials').select('access_token_ciphertext,phone_number_id').eq('connection_id',c.id).maybeSingle();
  if(storedError||!stored)continue;
  let token:string;try{token=decryptChannelCredential(stored.access_token_ciphertext,c.id)}catch{continue}
  const {data:items,error:claimError}=await database.rpc('claim_support_outbox_channel',{p_business_id:c.business_id,p_channel:'whatsapp',p_limit:Math.min(10,limit-processed)});
  if(claimError)throw Error('WhatsApp queue unavailable');
  for(const item of items??[]){
   processed++;let providerId:string|null=null;
   try{
    const recipient=whatsappRecipient(item.recipient,c.external_account_id);
    if(item.channel!=='whatsapp'||!item.conversation_id||!recipient||item.text.length>4096)throw Error('Invalid WhatsApp outbox item');
    const {data:active,error:ae}=await database.from('support_channel_connections').select('enabled').eq('id',c.id).eq('business_id',c.business_id).maybeSingle();
    const {data:conversation,error:ce}=await database.from('support_conversations').select('sender_id,channel,ai_paused').eq('business_id',c.business_id).eq('id',item.conversation_id).maybeSingle();
    const {data:window,error:we}=await database.from('support_whatsapp_windows').select('last_inbound_at').eq('business_id',c.business_id).eq('conversation_id',item.conversation_id).maybeSingle();
    if(ae||!active?.enabled||ce||!conversation||conversation.channel!=='whatsapp'||conversation.sender_id!==item.recipient||we||!window||!withinWhatsAppWindow(window.last_inbound_at))throw Error('WhatsApp customer service window expired or conversation unavailable');
    const {data:aiJob,error:je}=await database.from('support_ai_jobs').select('id').eq('business_id',c.business_id).eq('id',item.request_id).maybeSingle();
    if(je)throw Error('AI source unavailable');
    if(aiJob){const {data:settings,error:se}=await database.from('support_ai_settings').select('enabled').eq('business_id',c.business_id).maybeSingle();if(se||!settings?.enabled||conversation.ai_paused)throw Error('AI disabled');}
    const result=await whatsappGraph<{messages?:{id?:string}[]}>(c.external_account_id+'/messages',token,'POST',{messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:item.text}});
    providerId=result.messages?.[0]?.id??null;if(!providerId)throw Error('No provider acknowledgement');
   }catch{needsReview++;}
   const {error:ackError}=await database.rpc('ack_support_outbox',{p_business_id:c.business_id,p_id:item.id,p_claim_token:item.claim_token,p_sent:!!providerId,p_provider_id:providerId});
   if(ackError)throw Error('WhatsApp outbox acknowledgement unavailable');
  }
 }
 return {processed,needsReview};
}
