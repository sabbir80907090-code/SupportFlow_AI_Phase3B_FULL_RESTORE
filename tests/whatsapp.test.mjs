import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/whatsapp.ts',import.meta.url),'utf8').split('\\n').filter(line=>!line.startsWith('import ')||line.includes('node:crypto')).join('\\n');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {validWhatsAppSignature,whatsappEvents,whatsappRecipient,withinWhatsAppWindow,asksForWhatsAppHuman}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const secret='whatsapp-test-secret';
const now=Math.floor(Date.now()/1000);
const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456'},contacts:[{wa_id:'8801712345678',profile:{name:'Test Customer'}}],messages:[{from:'8801712345678',id:'wamid.TEST_12345',timestamp:String(now),type:'text',text:{body:'Hello'}}]}}]}]};
test('validates Meta raw-body HMAC and rejects tampering',()=>{
 const raw=JSON.stringify(payload),sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(validWhatsAppSignature(raw,sig,secret),true);
 assert.equal(validWhatsAppSignature(raw+' ',sig,secret),false);
 assert.equal(validWhatsAppSignature(raw,'',secret),false);
 assert.equal(validWhatsAppSignature(raw,sig,''),false);
});
test('parses only valid inbound text events with phone-number scoped sender IDs',()=>{
 const events=whatsappEvents(payload);assert.equal(events.length,1);
 assert.equal(events[0].senderId,'123456:8801712345678');
 assert.equal(events[0].displayName,'Test Customer');
 assert.equal(events[0].eventId,'wamid.TEST_12345');
 assert.equal(events[0].text,'Hello');
});
test('ignores unsupported message types, malformed numbers and non-WhatsApp payloads',()=>{
 const bad=structuredClone(payload);bad.entry[0].changes[0].value.messages[0].type='image';
 assert.deepEqual(whatsappEvents(bad),[]);
 assert.deepEqual(whatsappEvents({object:'page',entry:[]}),[]);
 const malformed=structuredClone(payload);malformed.entry[0].changes[0].value.metadata.phone_number_id='x';
 assert.deepEqual(whatsappEvents(malformed),[]);
});
test('prevents cross-phone recipient routing',()=>{
 assert.equal(whatsappRecipient('123456:8801712345678','123456'),'8801712345678');
 assert.equal(whatsappRecipient('999:8801712345678','123456'),null);
 assert.equal(whatsappRecipient('123456:8801712345678:extra','123456'),null);
});
test('enforces 24-hour customer service window',()=>{
 const current=Date.now();
 assert.equal(withinWhatsAppWindow(new Date(current-1000).toISOString(),current),true);
 assert.equal(withinWhatsAppWindow(new Date(current-86400000).toISOString(),current),false);
 assert.equal(withinWhatsAppWindow('bad',current),false);
 assert.equal(withinWhatsAppWindow(new Date(current+120000).toISOString(),current),false);
});
test('recognizes explicit human handoff in English and Bengali',()=>{
 assert.equal(asksForWhatsAppHuman('I need a human agent'),true);
 assert.equal(asksForWhatsAppHuman('আমি মানুষের সাথে কথা বলতে চাই'),true);
 assert.equal(asksForWhatsAppHuman('Hello, thanks'),false);
});
