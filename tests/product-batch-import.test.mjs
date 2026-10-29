import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/product-batch-import.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const {productIssue,importPayload,runImportBatch}=new Function(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {productIssue,importPayload,runImportBatch}')();
const row=(id,selected=true)=>({id,selected,saved:false,error:'',warning:'',product:{name:'Product '+id,price:'12.50',currency:'BDT',stock_quantity:'2',description:'Details',sku:'',category:'',imageUrl:'',sourceUrl:'https://shop.example/p'}});
test('selected subset only; already saved and unchecked rows are never written',async()=>{
 const rows=[row('one'),row('two',false),{...row('three'),saved:true}];const writes=[],results=[];
 await runImportBatch(rows,async r=>writes.push(r.id),r=>results.push(r));
 assert.deepEqual(writes,['one']);assert.equal(results[0].saved,true);assert.equal(results[0].selected,false);assert.equal(rows[0].saved,false);
});
test('select-all batch saves all; payload uses bound business and stable row ID',async()=>{
 const rows=[row('a'),row('b')],payloads=[];await runImportBatch(rows,async r=>payloads.push(importPayload(r,'business-A',false)),()=>{});
 assert.equal(payloads.length,2);assert.ok(payloads.every(p=>p.business_id==='business-A'&&p.is_active===false));assert.deepEqual(payloads.map(p=>p.id),['a','b']);
});
test('partial failure retries only failed row with the same ID',async()=>{
 let rows=[row('a'),row('b')];const report=r=>{rows=rows.map(x=>x.id===r.id?r:x)};
 await runImportBatch(rows,async r=>{if(r.id==='b')throw Error('SKU already exists')},report);
 assert.equal(rows[0].saved,true);assert.equal(rows[1].selected,true);assert.match(rows[1].error,/SKU/);
 const writes=[];await runImportBatch(rows,async r=>writes.push(r.id),report);assert.deepEqual(writes,['b']);assert.ok(rows.every(r=>r.saved));
});
test('unknown or invalid facts cannot silently become zero, but explicit zero is accepted',async()=>{
 for(const patch of [{price:''},{stock_quantity:'-1'},{stock_quantity:'1.5'},{currency:''},{price:'1e3'},{stock_quantity:'2147483648'}])assert.ok(productIssue({...row('a').product,...patch}));
 assert.equal(productIssue({...row('a').product,price:'0',stock_quantity:'0'}),'');
 let called=false;await runImportBatch([{...row('a'),product:{...row('a').product,stock_quantity:''}}],async r=>{called=true;assert.equal(importPayload(r,'business-A',true).stock_quantity,null)},r=>assert.equal(r.saved,true));assert.equal(called,true);
});
test('stop after current item prevents remaining writes',async()=>{
 let stop=false;const writes=[];await runImportBatch([row('a'),row('b')],async r=>{writes.push(r.id);stop=true},()=>{},()=>stop);assert.deepEqual(writes,['a']);
});
