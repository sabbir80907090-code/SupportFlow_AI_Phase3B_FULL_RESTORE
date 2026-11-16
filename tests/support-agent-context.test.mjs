import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function compile(file){
 const source=readFileSync(new URL(file,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('exports','module',js)(module.exports,module);
 return module.exports;
}
const {knowledgeFacts,compactAgentHistory}=compile('../lib/support-agent-context.ts');
const {selectCatalog}=compile('../lib/support-product-context.ts');
const article=(title,content,category='faq')=>({title,content,category});
test('only matching business knowledge is sent, within a bounded character budget',()=>{
 const articles=[article('Returns','Return within 7 days'),article('Delivery','Delivery takes 2 days'),...Array.from({length:15},(_,i)=>article('Other '+i,'X'.repeat(2000)))];
 const facts=knowledgeFacts(articles,'What is the delivery time?');
 assert.match(facts,/Delivery takes 2 days/);assert.doesNotMatch(facts,/Return within 7 days/);
 assert.ok(facts.length<=4200);
});
test('broad question receives no more than two recent articles',()=>{
 const articles=Array.from({length:12},(_,i)=>article('Policy '+i,'Content '+i));
 const facts=knowledgeFacts(articles,'hello');
 assert.equal(facts.split('\n').length,2);
});
test('Bengali product terms and previous query remain searchable',()=>{
 const facts=knowledgeFacts([article('ডেলিভারি','ঢাকায় দুই দিন'),article('রিটার্ন','সাত দিন')],'ডেলিভারি কত');
 assert.match(facts,/ঢাকায় দুই দিন/);
});
test('history keeps the latest request and limits previous context',()=>{
 const messages=Array.from({length:16},(_,i)=>({direction:i%2?'inbound':'outbound',text:'x'.repeat(5000)+i}));
 const history=compactAgentHistory(messages);
 assert.equal(history.length,8);assert.equal(history.at(-1).role,'user');assert.equal(history.at(-1).text.length,3000);assert.equal(history[0].text.length,1100);
});
test('plain pricing requests do not attach images, visual questions do',()=>{
 const products=[{id:'1',name:'Laptop',description:null,sku:'L100',category:'computer',price:500,currency:'BDT',stock_quantity:1,image_path:'a.jpg'}];
 assert.equal(selectCatalog(products,'Laptop price').imageProducts.length,0);
 assert.equal(selectCatalog(products,'Laptop photo').imageProducts.length,1);
});
test('unmatched queries no longer send a large unrelated catalog',()=>{
 const products=Array.from({length:100},(_,i)=>({id:String(i),name:'Item '+i,description:null,sku:null,category:null,price:10,currency:'BDT',stock_quantity:null,image_path:null}));
 assert.ok(selectCatalog(products,'hello').selected.length<=3);
});
