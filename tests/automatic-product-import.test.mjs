import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/automatic-product-import.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const {readProductsAutomatically:run,ProductReadError:E}=new Function(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {readProductsAutomatically,ProductReadError}')();
const products=[{name:'Phone'}];
test('standard success avoids browser cost and availability request',async()=>{
 const calls=[];const result=await run(async b=>{calls.push(b);return {products}},async()=>{throw Error('unneeded')},()=>{});
 assert.deepEqual(calls,[false]);assert.deepEqual(result.products,products);
});
test('empty page and unreadable response each fall back exactly once',async()=>{
 for(const fail of [false,true]){const calls=[],progress=[];
 const result=await run(async b=>{calls.push(b);if(!b&&fail)throw new E('unreadable',422);return {products:b?products:[]}},async()=>true,p=>progress.push(p));
 assert.deepEqual(calls,[false,true]);assert.equal(result.mode,'browser_ai');assert.equal(progress.length,2);}
});
test('auth, access, bad input and quota failures never trigger browser',async()=>{
 for(const status of [400,401,403,429])await assert.rejects(run(async()=>{throw new E('stop',status)},async()=>{throw Error('should not check')},()=>{}),/stop/);
});
test('browser unavailable produces saved-page alternative',async()=>{
 await assert.rejects(run(async()=>({products:[]}),async()=>false,()=>{}),/saved HTML/);
});
test('browser failure is surfaced without repeated paid retries',async()=>{
 const calls=[];await assert.rejects(run(async b=>{calls.push(b);if(b)throw new E('Daily limit reached',429);throw Error('timeout')},async()=>true,()=>{}),/Daily limit/);assert.deepEqual(calls,[false,true]);
});
test('empty browser result is not presented as successful import',async()=>{
 await assert.rejects(run(async()=>({products:[]}),async()=>true,()=>{}),/No products found/);
});
