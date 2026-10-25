import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';
import {graph,metaConfig} from '@/lib/messenger';
import {messengerRecipient,withinMessengerWindow} from '@/lib/messenger-security';
export async function deliverMessengerOutbox(limit=10){
 let processed=0,needsReview=0;
 if(!metaConfig())return {processed,needsReview};
 const database=db();
 const {data:connections,error}=await database.from('support_channel_connections').select('id,business_id,external_account_id').eq('channel','messenger').eq('enabled',true);
 if(error)throw Error('Messenger connections unavailable');
 for(const c of connections??[]){
  if(processed>=limit)break;
  const {data:stored}=await database.from('support_messenger_credentials').select('page_token_ciphertext').eq('connection_id',c.id).maybeSingle();
  if(!stored)continue;
  let token:string;try{token=decryptChannelCredential(stored.page_token_ciphertext,c.id);}catch{continue;}
  const {data:items,error:claimError}=await database.rpc('claim_support_outbox_channel',{p_business_id:c.business_id,p_channel:'messenger',p_limit:limit-processed});
  if(claimError)throw Error('Messenger queue unavailable');
  for(const item of items??[]){
   processed++;let providerId:string|null=null;
   try{
    const recipient=messengerRecipient(item.recipient,c.external_account_id);
    if(item.text.length>2000)throw Error('Message too long');
    if(!recipient||item.channel!=='messenger'||!item.conversation_id)throw Error('Invalid recipient');
    const {data:active,error:ae}=await database.from('support_channel_connections').select('enabled').eq('id',c.id).eq('business_id',c.business_id).maybeSingle();
    const {data:conversation,error:ce}=await database.from('support_conversations').select('sender_id,channel,ai_paused').eq('business_id',c.business_id).eq('id',item.conversation_id).maybeSingle();
    const {data:window,error:we}=await database.from('support_messenger_windows').select('last_inbound_at').eq('business_id',c.business_id).eq('conversation_id',item.conversation_id).maybeSingle();
    if(ae||!active?.enabled||ce||!conversation||conversation.channel!=='messenger'||conversation.sender_id!==item.recipient||we||!window||!withinMessengerWindow(window.last_inbound_at))throw Error('Conversation not sendable');
    const {data:aiJob,error:je}=await database.from('support_ai_jobs').select('id').eq('business_id',c.business_id).eq('id',item.request_id).maybeSingle();
    if(je)throw Error('Message source unavailable');
    if(aiJob){
     const {data:settings,error:se}=await database.from('support_ai_settings').select('enabled').eq('business_id',c.business_id).maybeSingle();
     if(se||!settings?.enabled||conversation.ai_paused)throw Error('AI disabled');
    }
    // Human replies remain allowed during handoff, within Meta's messaging window.
    const sent=await graph<{message_id?:string}>(c.external_account_id+'/messages',token,'POST',{messaging_type:'RESPONSE',recipient:JSON.stringify({id:recipient}),message:JSON.stringify({text:item.text})});
    if(!sent.message_id)throw Error('No delivery acknowledgement');providerId=sent.message_id;
   }catch{needsReview++;}
   const {error:ackError}=await database.rpc('ack_support_outbox',{p_business_id:c.business_id,p_id:item.id,p_claim_token:item.claim_token,p_sent:!!providerId,p_provider_id:providerId});
   if(ackError)throw Error('Messenger acknowledgement unavailable');
  }
 }
 return {processed,needsReview};
}
