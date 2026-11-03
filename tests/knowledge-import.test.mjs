import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/knowledge-import.ts',import.meta.url),'utf8').replace(/export /g,'');
const api=new Function(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {splitKnowledge,parseKnowledgePage,knowledgeContext}')();
test('large Unicode document is preserved without silently truncating the tail',()=>{
 const text=('বাংলা পণ্যের তথ্য।\n').repeat(2500)+'শেষ তথ্য';
 const parts=api.splitKnowledge(text,'Catalog','catalog.txt');assert.ok(parts.length>12);assert.equal(parts.map(p=>p.content).join(''),text);assert.ok(parts.every(p=>p.content.length<=2500&&p.title.length<=160));
 assert.throws(()=>api.splitKnowledge('x'.repeat(120001),'a','b'),/too large/);
});
test('website extraction removes navigation and scripts, restricts crawl links',()=>{
 const p=api.parseKnowledgePage('<title>Shop &amp; FAQ</title><nav>Menu</nav><main><h1>Delivery</h1><p>ঢাকায় ৬০ টাকা</p><script>secret()</script><a href="/shipping">Shipping</a><a href="https://other.example">external</a><a href="/logout">Logout</a><a href="/p?q=2">Filter</a></main>','https://shop.example/');
 assert.equal(p.title,'Shop & FAQ');assert.ok(p.text.includes('ঢাকায় ৬০ টাকা'));assert.ok(!p.text.includes('secret()'));assert.ok(!p.text.includes('Menu'));assert.deepEqual(p.links,['https://shop.example/shipping']);
});
test('question-relevant older knowledge is selected within the context limit',()=>{
 const articles=Array.from({length:20},(_,i)=>({title:'Generic '+i,category:'General',content:'Generic content '.repeat(500)}));
 articles.push({title:'Refund',category:'Policies',content:'রিটার্ন নীতি সাত দিন।'});
 const answer=api.knowledgeContext(articles,'রিটার্ন নীতি কী');assert.ok(answer.includes('সাত দিন'));assert.ok(answer.length<=9000);
});
test('unauthenticated website import does not fetch remote content',async()=>{
 let fetched=false;
 const route=readFileSync(new URL('../app/api/knowledge/import/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const handler=new Function('authorizedBusiness','failure','fetchPublicUrl','parseKnowledgePage','NextResponse',ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return POST')(async()=>null,(error,status)=>({error,status}),async()=>{fetched=true;},api.parseKnowledgePage,{});
 const result=await handler({text(){throw Error('Must not read body');}});assert.equal(result.status,403);assert.equal(fetched,false);
});
