import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../supabase/functions/supportflow-telegram-webhook/index.ts',import.meta.url),'utf8');
const secret='test_webhook_secret_123456';
const connectionId='ff0d4e6c-7689-4d0f-acd3-e5a48727b5e5';
async function run({enabled=true,text='Hello',valid=true,enqueueError=false,duplicate=false}={}){
 let handler;const calls=[];
 const db={
   from(table){const query={select(){return query},eq(){return query},update(){calls.push('pause');return query},
     maybeSingle:async()=>({data:table==='support_telegram_credentials'?{webhook_secret_sha256:createHash('sha256').update(secret).digest('hex')}:
       table==='support_channel_connections'?{business_id:'tenant-a',enabled:true,channel:'telegram'}:
       table==='support_ai_settings'?{enabled}:{id:'message-a'}}),
     then(resolve){return Promise.resolve({error:null}).then(resolve)}
   };return query},
   async rpc(name,args){calls.push({name,args});return name==='ingest_support_message'?{data:{conversationId:'conversation-a',duplicate}}:{error:enqueueError?{}:null}}
 };
 const js=stripTypeScriptTypes(source.replace(/^import .*;\n/,''));
 new Function('Deno','createClient',js)({env:{get:()=> 'configured'},serve:fn=>handler=fn},()=>db);
 const response=await handler(new Request('https://example.test/'+connectionId,{method:'POST',headers:{'x-telegram-bot-api-secret-token':valid?secret:'invalid_secret_123456'},body:JSON.stringify({message:{message_id:12,text,chat:{id:123,type:'private'}}})}));
 return {response,calls};
}
test('enabled tenant queues inbound message including webhook retries',async()=>{
 for(const duplicate of [false,true]){const {response,calls}=await run({duplicate});assert.equal(response.status,200);
 const job=calls.find(c=>c.name==='enqueue_support_ai_job');assert.deepEqual(job.args,{p_business_id:'tenant-a',p_conversation_id:'conversation-a',p_message_id:'message-a'});}
});
test('disabled tenant does not enqueue',async()=>{const {calls}=await run({enabled:false});assert.ok(!calls.some(c=>c.name==='enqueue_support_ai_job'))});
test('handoff pauses conversation without enqueue',async()=>{const {calls}=await run({text:'talk to a human'});assert.ok(calls.includes('pause'));assert.ok(!calls.some(c=>c.name==='enqueue_support_ai_job'))});
test('invalid webhook secret does not ingest',async()=>{const {response,calls}=await run({valid:false});assert.equal(response.status,401);assert.equal(calls.length,0)});
test('enqueue failure requests Telegram retry',async()=>{const {response}=await run({enqueueError:true});assert.equal(response.status,503)});
