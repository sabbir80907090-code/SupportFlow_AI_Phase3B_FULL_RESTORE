import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/support-telegram-connect.ts',import.meta.url),'utf8');
const body=source.slice(source.indexOf('export async function authorizedBusiness'),source.indexOf('export function failure')).replace('export ','');
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333';
function setup({user='owner',error=null}={}){
 const owned=[{id:a,owner_id:'owner'},{id:b,owner_id:'owner'},{id:foreign,owner_id:'someone-else'}];
 let reads=0;
 const database={auth:{getUser:async token=>({data:{user:token==='valid'?{id:user}:null},error:token==='valid'?null:Error('invalid')})},from(table){assert.equal(table,'businesses');reads++;const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},async maybeSingle(){return {data:owned.find(row=>Object.entries(filters).every(([k,v])=>row[k]===v))??null,error}}}}};
 return {authorize:new Function('db',js+';return authorizedBusiness')(()=>database),reads:()=>reads};
}
const request=(id,token='valid')=>({headers:new Headers({...token?{authorization:'Bearer '+token}:{},...id?{'x-business-id':id}:{}})});
test('owner with two workspaces accesses only the explicitly selected workspace',async()=>{const {authorize}=setup();assert.equal((await authorize(request(a))).businessId,a);assert.equal((await authorize(request(b))).businessId,b)});
test('foreign workspace and non-owner roles fail closed',async()=>{assert.equal(await setup().authorize(request(foreign)),null);for(const user of ['admin','agent','outsider'])assert.equal(await setup({user}).authorize(request(a)),null)});
test('missing or malformed selection never falls back to owned workspace',async()=>{const ctx=setup();for(const id of [undefined,'bad',a+',other'])assert.equal(await ctx.authorize(request(id)),null);assert.equal(ctx.reads(),0)});
test('invalid authentication and database errors fail closed',async()=>{const ctx=setup();for(const token of ['', 'invalid'])assert.equal(await ctx.authorize(request(a,token)),null);assert.equal(ctx.reads(),0);assert.equal(await setup({error:Error('offline')}).authorize(request(a)),null)});
