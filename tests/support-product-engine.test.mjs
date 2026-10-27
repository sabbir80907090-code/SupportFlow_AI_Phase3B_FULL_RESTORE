import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function compile(path,bindings,returnValue){
 const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(bindings),js+';return '+returnValue)(...Object.values(bindings));
}
const context=compile('../lib/support-product-context.ts',{},'{selectCatalog,catalogFacts,validCatalogImagePath,providerHistory}');
test('engine scopes catalog, downloads private image, falls back to text on unsupported vision and queues one reply',async()=>{
 const tenant='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';let outbox=[],requests=[],downloads=0;const filters=[];
 const key={id:'key',provider:'gemini',model:'configured-model',key_ciphertext:'encrypted'};
 const product={id:'product',name:'Laptop',description:'Confirmed warranty: 1 year',sku:'L100',category:'Computer',price:1234,currency:'BDT',stock_quantity:2,image_path:tenant+'/abc-123.jpg'};
 const data={support_conversations:{business_id:tenant,channel:'telegram',sender_id:'customer',ai_paused:false},support_ai_settings:{enabled:true,system_prompt:''},support_messages:[{id:'inbound',direction:'inbound',text:'Laptop colour and price?',created_at:'2026-10-27'}],support_ai_api_keys:[key],knowledge_articles:[],business_products:[product]};
 const db={rpc:async(name)=>({data:name==='claim_support_ai_job'?[{id:'job',business_id:tenant,conversation_id:'conversation',inbound_message_id:'inbound',claim_token:'claim'}]:null}),storage:{from(bucket){assert.equal(bucket,'business-product-images');return {download:async(path)=>{assert.equal(path,product.image_path);downloads++;return {data:new Blob(['photo'],{type:'image/jpeg'})}}}}},from(table){
  const q={select(){return q},eq(field,value){filters.push({table,field,value});return q},order(){return q},limit(){return q},single:async()=>({data:data[table]}),maybeSingle:async()=>({data:table==='support_messages'?{id:'inbound'}:data[table]}),upsert:async(payload)=>{outbox.push(payload);return {}},then(resolve){return Promise.resolve({data:data[table]}).then(resolve)}};return q;
 }};
 const request=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(requests.length===1)return new Response('{}',{status:400});return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Laptop price is BDT 1234. Please confirm colour with staff.'}]}}]}),{status:200});};
 const run=compile('../lib/support-ai-engine.ts',{...context,adminDb:()=>db,decryptChannelCredential:()=> 'test-key',fetch:request,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'test'}},Buffer},'processSupportAiJob');
 assert.equal(await run('job'),'queued');assert.equal(downloads,1);assert.equal(outbox.length,1);assert.equal(outbox[0].business_id,tenant);
 assert.equal(filters.some(x=>x.table==='business_products'&&x.field==='business_id'&&x.value===tenant),true);
 assert.equal(filters.some(x=>x.table==='business_products'&&x.field==='is_active'&&x.value===true),true);
 assert.match(JSON.stringify(requests[0].contents),/inlineData/);assert.equal(JSON.stringify(requests[1].contents).includes('inlineData'),false);assert.match(requests[1].systemInstruction.parts[0].text,/No catalog photos/);assert.match(requests[0].systemInstruction.parts[0].text,/1234/);
});
