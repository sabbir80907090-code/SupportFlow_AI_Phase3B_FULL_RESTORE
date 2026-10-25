import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../lib/messenger-security.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {validMetaSignature,messengerEvents,messengerRecipient,withinMessengerWindow,asksForHuman}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const secret='test-app-secret';
const event={sender:{id:'222'},recipient:{id:'111'},timestamp:Date.now(),message:{mid:'mid.example',text:'Hello'}};
const payload=e=>({object:'page',entry:[{id:'111',messaging:[e]}]});
test('verifies signed raw bytes and rejects tampering, missing or invalid signatures',()=>{
 const raw=JSON.stringify(payload(event));const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(validMetaSignature(raw,signature,secret),true);
 for(const sig of ['',signature.replace(/.$/,'x'),'sha256=00'])assert.equal(validMetaSignature(raw,sig,secret),false);
 assert.equal(validMetaSignature(raw+' ',signature,secret),false);assert.equal(validMetaSignature(raw,signature,''),false);
});
test('uses Page-scoped sender identity and rejects mismatched Page and recipient',()=>{
 assert.equal(messengerEvents(payload(event))[0].senderId,'111:222');
 assert.equal(messengerEvents(payload({...event,recipient:{id:'333'}})).length,0);
 assert.equal(messengerRecipient('111:222','111'),'222');
 assert.equal(messengerRecipient('111:222','333'),null);
 assert.equal(messengerRecipient('111:222:333','111'),null);
});
test('ignores echoes, receipts, attachments and malformed objects',()=>{
 for(const e of [{...event,message:{...event.message,is_echo:true}},{...event,message:undefined},{...event,message:{mid:'1',attachments:[]}},{...event,timestamp:Date.now()+120000},null])assert.equal(messengerEvents(payload(e)).length,0);
 for(const p of [null,{},[],{object:'instagram',entry:[]}])assert.deepEqual(messengerEvents(p),[]);
});
test('24-hour response window uses signed inbound time, not webhook retry time',()=>{
 const now=Date.now();assert.equal(withinMessengerWindow(new Date(now-1000).toISOString(),now),true);
 assert.equal(withinMessengerWindow(new Date(now-86400000).toISOString(),now),false);
 assert.equal(withinMessengerWindow('invalid',now),false);
 assert.equal(withinMessengerWindow(new Date(now+120000).toISOString(),now),false);
});
test('human handoff works in Bengali and English',()=>{
 assert.equal(asksForHuman('আমি মানুষের সাথে কথা বলব'),true);assert.equal(asksForHuman('Talk to a person'),true);assert.equal(asksForHuman('Hello'),false);
});
