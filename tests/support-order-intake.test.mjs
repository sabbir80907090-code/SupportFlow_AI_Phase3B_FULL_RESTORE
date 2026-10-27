import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/support-order-intake.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const module={exports:{}};new Function('exports','module',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module);
const {parseOrderAnswer,isOrderControl}=module.exports;
const product={id:'product-1'};
test('extracts only supplied contacts and a known catalog product; handles Bengali phone digits',()=>{
 const result=parseOrderAnswer(JSON.stringify({reply:'Details please',order:{product_id:'product-1',quantity:2,name:'Sabbir',address:'Road 12, Dhaka',phone:'+88'+'০১৭০০০০০০০০',variant:'42'}}),[product],['Sabbir, Road 12, Dhaka, ০১৭০০০০০০০০, size 42, 2 pairs']);
 assert.deepEqual(result.patch,{product_id:'product-1',quantity:2,name:'Sabbir',address:'Road 12, Dhaka',variant:'42',phone:'01700000000'});
});
test('rejects invented contacts, foreign product, invalid quantity and malformed output',()=>{
 const result=parseOrderAnswer(JSON.stringify({reply:'Please provide details',order:{product_id:'foreign',quantity:999,name:'Invented Person',phone:'01700000000',address:'Made up address'}}),[product],['I want shoes']);
 assert.equal(result.patch,null);assert.throws(()=>parseOrderAnswer('Order confirmed!',[],[]));
});
test('confirmation is explicit, never inferred from buying intent or negation',()=>{
 for(const s of ['CONFIRM','হ্যাঁ','অর্ডার কনফার্ম','CANCEL','নতুন অর্ডার'])assert.equal(isOrderControl(s),true);
 for(const s of ['I want to buy','আমি অর্ডার করতে চাই','do not confirm','কনফার্ম করবেন না','yes but change address'])assert.equal(isOrderControl(s),false);
});
