import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
function compile(path,params,result){const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');return new Function(...params,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+';return '+result);}
const {validateCourierInput,isCourier}=compile('../lib/courier-config.ts',[],'{validateCourierInput,isCourier}')();
const {encryptChannelCredential,decryptChannelCredential}=compile('../lib/support-channel-credentials.ts',['createCipheriv','createDecipheriv','randomBytes'],'{encryptChannelCredential,decryptChannelCredential}')(createCipheriv,createDecipheriv,randomBytes);
const businessA='11111111-1111-4111-8111-111111111111',businessB='22222222-2222-4222-8222-222222222222';
const fixture={provider:'steadfast',pickupName:'Test shop',pickupPhone:'01700000000',pickupAddress:'Test pickup address',credentials:{api_key:'fixture-key',secret_key:'fixture-secret'}};
test('validation rejects unknown providers, incomplete credentials and invalid pickup',()=>{
 for(const v of [null,{...fixture,provider:'__proto__'},{...fixture,credentials:{}},{...fixture,pickupPhone:'bad'},{...fixture,pickupAddress:'x'}])assert.throws(()=>validateCourierInput(v));
 assert.equal(validateCourierInput(fixture).provider,'steadfast');assert.equal(isCourier('toString'),false);
});
test('credential ciphertext is bound to business and provider and rejects tampering',()=>{
 process.env.SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const id=`courier:${businessA}:steadfast`,secret=JSON.stringify(fixture.credentials),sealed=encryptChannelCredential(secret,id);
 assert.equal(decryptChannelCredential(sealed,id),secret);assert.equal(sealed.includes('fixture-secret'),false);
 assert.throws(()=>decryptChannelCredential(sealed,`courier:${businessB}:steadfast`));
 assert.throws(()=>decryptChannelCredential(sealed,`courier:${businessA}:redx`));
 const chunks=sealed.split('.');chunks[3]=(chunks[3][0]==='a'?'b':'a')+chunks[3].slice(1);assert.throws(()=>decryptChannelCredential(chunks.join('.'),id));
});
test('authorization checks requested workspace and rejects agents, strangers and invalid sessions',async()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
 for(const [role,valid,allowed] of [['owner',true,true],['admin',true,true],['agent',true,false],['owner',false,false]]){
  const filters={};const query={select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:filters.business_id===businessA?{role}:null,error:null};}};
  const auth=compile('../lib/courier-auth.ts',['adminDb'],'authorizeCourierManager')(()=>({auth:{getUser:async()=>({data:{user:valid?{id:'user-a'}:null},error:null})},from:()=>query}));
  const req=id=>new NextRequest(`https://app.test/api/couriers/connections?businessId=${id}`,{headers:{Authorization:'Bearer test'}});
  assert.equal(!!await auth(req(businessA)),allowed);assert.equal(await auth(req(businessB)),null);
  assert.equal(await auth(new NextRequest('https://app.test/api/couriers/connections')),null);
 }
});
test('routes scope mutations, redact credentials, and deny unauthorized access before querying',async()=>{
 let allowed=true,write,filters={},selection='',queries=0;
 const q={select(v){selection=v;return this;},eq(k,v){filters[k]=v;return this;},upsert(v){write=v;return this;},delete(){return this;},single(){return this;},then(resolve){resolve({data:{provider:'steadfast'},error:null});}};
 const auth=async()=>allowed?{businessId:businessA,userId:'actor',db:{from(){queries++;return q;}}}:null;
 const handlers=compile('../app/api/couriers/connections/route.ts',['NextResponse','authorizeCourierManager','encryptChannelCredential','isCourier','validateCourierInput'],'{GET,POST,DELETE}')(NextResponse,auth,encryptChannelCredential,isCourier,validateCourierInput);
 const req=(method,body)=>new NextRequest(`https://app.test/api/couriers/connections?businessId=${businessA}&provider=steadfast`,{method,body:body?JSON.stringify(body):undefined});
 const response=await handlers.POST(req('POST',{...fixture,business_id:businessB}));assert.equal(response.status,200);assert.equal(write.business_id,businessA);assert.equal(write.updated_by,'actor');assert.equal(selection.includes('ciphertext'),false);
 assert.equal(JSON.stringify(await response.json()).includes('fixture-secret'),false);
 await handlers.GET(req('GET'));assert.equal(filters.business_id,businessA);assert.equal(selection.includes('ciphertext'),false);
 await handlers.DELETE(req('DELETE'));assert.equal(filters.business_id,businessA);assert.equal(filters.provider,'steadfast');
 allowed=false;const before=queries;
 for(const method of ['GET','POST','DELETE'])assert.equal((await handlers[method](req(method,method==='POST'?fixture:undefined))).status,403);
 assert.equal(queries,before);
});
