import {adminDb} from '@/lib/telegram-server';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';

export const runtime='nodejs';
type Outcome='queued'|'skipped'|'failed'|'not_claimed';
/** Generate a tenant-scoped draft in the trusted outbox; never send provider messages here. */
export async function processSupportAiJob(jobId:string):Promise<Outcome>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Supabase server configuration missing');
 const db=adminDb(url,key);
 const {data:claimed,error:claimError}=await db.rpc('claim_support_ai_job',{p_job_id:jobId});
 if(claimError)throw Error('Claim failed');
 const job=claimed?.[0];
 if(!job)return 'not_claimed';
 let finalState:'completed'|'skipped'|'failed'='failed';
 let errorCode:string|null=null;
 try{
   const {data:conversation,error:ce}=await db.from('support_conversations')
     .select('business_id,channel,sender_id,ai_paused').eq('id',job.conversation_id)
     .eq('business_id',job.business_id).single();
   if(ce||!conversation)throw Error('conversation_missing');
   if(conversation.ai_paused){finalState='skipped';return 'skipped';}
   const {data:settings,error:settingsError}=await db.from('support_ai_settings').select('enabled').eq('business_id',job.business_id).maybeSingle();
   if(settingsError||!settings?.enabled){finalState='skipped';return 'skipped';}
   const {data:messages,error:me}=await db.from('support_messages')
     .select('id,direction,text,created_at').eq('business_id',job.business_id)
     .eq('conversation_id',job.conversation_id).order('created_at',{ascending:false}).limit(16);
   if(me||!messages)throw Error('history_missing');
   if(messages.find(m=>m.direction==='inbound')?.id!==job.inbound_message_id){
     finalState='skipped';return 'skipped';
   }
   const {data:storedKeys,error:keysError}=await db.from('support_ai_api_keys').select('id,key_ciphertext').eq('business_id',job.business_id).eq('enabled',true).order('priority',{ascending:true}).limit(10);
   if(keysError)throw Error('business_keys_unavailable');
   const apiKeys:string[]=[];
   for(const stored of storedKeys??[]){try{apiKeys.push(decryptChannelCredential(stored.key_ciphertext,stored.id));}catch{console.error('Invalid business key ciphertext');}}
   if(!apiKeys.length)throw Error('business_gemini_key_missing');
   const {data:articles,error:ke}=await db.from('knowledge_articles').select('title,content')
     .eq('business_id',job.business_id).limit(10);
   if(ke)throw Error('knowledge_missing');
   const facts=(articles??[]).map(a=>a.title+': '+a.content).join('\n').slice(0,10000);
   const model=process.env.GEMINI_MODEL??'gemini-2.5-flash';
   let response:Response|undefined;
   for(const apiKey of apiKeys){
     const candidate=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
       method:'POST',headers:{'content-type':'application/json','x-goog-api-key':apiKey},
       body:JSON.stringify({
       systemInstruction:{parts:[{text:'Answer customer questions in their language. Never invent order status, prices or inventory. Ask for human help if facts are missing.\nBusiness knowledge:\n'+facts}]},
       contents:[...messages].reverse().map(m=>({role:m.direction==='inbound'?'user':'model',parts:[{text:String(m.text).slice(0,4000)}]})),
       generationConfig:{temperature:0.3,maxOutputTokens:512}
     }),signal:AbortSignal.timeout(25000),cache:'no-store'
     });
     response=candidate;
     if(candidate.ok)break;
     // Fallback only for unavailable/limited credentials; do not retry arbitrary model errors.
     if(![401,403,429,500,502,503,504].includes(candidate.status))break;
   }
   if(!response?.ok)throw Error('gemini_http_'+(response?.status??'unavailable'));
   const payload=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>} ;
   const answer=payload.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('').trim();
   if(!answer)throw Error('empty_answer');
   const {data:latest,error:le}=await db.from('support_messages').select('id')
     .eq('business_id',job.business_id).eq('conversation_id',job.conversation_id)
     .eq('direction','inbound').order('created_at',{ascending:false}).limit(1).maybeSingle();
   const {data:state,error:se}=await db.from('support_conversations').select('ai_paused')
     .eq('id',job.conversation_id).eq('business_id',job.business_id).single();
   if(le||se)throw Error('state_recheck_failed');
   const {data:latestSettings,error:latestSettingsError}=await db.from('support_ai_settings').select('enabled').eq('business_id',job.business_id).maybeSingle();
   if(latestSettingsError||!latestSettings?.enabled||state?.ai_paused||latest?.id!==job.inbound_message_id){finalState='skipped';return 'skipped';}
   const {error:oe}=await db.from('support_outbox').upsert({
     business_id:job.business_id,conversation_id:job.conversation_id,
     channel:conversation.channel,recipient:conversation.sender_id,
     text:answer.slice(0,4096),request_id:job.id
   },{onConflict:'business_id,request_id',ignoreDuplicates:true});
   if(oe)throw Error('outbox_enqueue_failed');
   finalState='completed';return 'queued';
 }catch(e){
   errorCode=e instanceof Error?e.message:'unknown';
   return 'failed';
 }finally{
   const {error}=await db.rpc('finish_support_ai_job',{
     p_id:job.id,p_token:job.claim_token,p_status:finalState,p_error:errorCode
   });
   if(error)console.error('Support AI job finalization failed',error.code);
 }
}
