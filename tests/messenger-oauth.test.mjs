import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';
const origin='https://app.example.com';
const cookie='__Host-supportflow_messenger';
let inserts=0;
const database={from:()=>({delete:()=>({eq:async()=>({})}),insert:async()=>{inserts++;return {};}})};
const config={origin,appId:'123',redirectUri:origin+'/api/channels/messenger/callback'};
const source=readFileSync(new URL('../app/api/channels/messenger/oauth/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const handlers=new Function('NextResponse','randomBytes','randomUUID','authorizedBusiness','failure','metaConfig','graphVersion','oauthCookie','stateHash','secureEqual',js+';return {POST,GET};')(
 NextResponse,randomBytes,randomUUID,async()=>({database,businessId:'owner-business'}),(message,status)=>NextResponse.json({error:message},{status}),()=>config,'v25.0',cookie,s=>createHash('sha256').update(s).digest('hex'),(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
);
test('alias login moves to canonical site before creating or overwriting an OAuth session',async()=>{
 const before=inserts;
 const response=await handlers.POST(new NextRequest('https://preview.example.com/api/channels/messenger/oauth',{method:'POST',headers:{origin:'https://preview.example.com'}}));
 assert.equal((await response.json()).url,origin+'/?messenger=canonical');
 assert.equal(response.headers.has('set-cookie'),false);assert.equal(inserts,before);
});
test('canonical login sets secure host cookie and verifies it before Facebook navigation',async()=>{
 const response=await handlers.POST(new NextRequest(origin+'/api/channels/messenger/oauth',{method:'POST',headers:{origin}}));
 const {url}=await response.json();const state=new URL(url).searchParams.get('state');
 assert.match(response.headers.get('set-cookie'),/Secure/);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=lax/i);
 const forward=await handlers.GET(new NextRequest(url,{headers:{cookie:cookie+'='+state}}));
 const facebook=new URL(forward.headers.get('location'));
 assert.equal(facebook.origin,'https://www.facebook.com');assert.equal(facebook.searchParams.get('state'),state);assert.equal(facebook.searchParams.get('redirect_uri'),config.redirectUri);
});
test('missing, mismatched and malformed cookies cannot launch Facebook or be recreated from state',async()=>{
 const state='a'.repeat(64);
 for(const value of ['', 'b'.repeat(64), 'bad']){
  const response=await handlers.GET(new NextRequest(origin+'/api/channels/messenger/oauth?state='+state,{headers:{cookie:cookie+'='+value}}));
  assert.equal(response.headers.get('location'),origin+'/?messenger=cookies');assert.equal(response.headers.has('set-cookie'),false);
 }
});
