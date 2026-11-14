import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/inbox-priority.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function('exports',compiled)(exports);
const {needsReply,needsAttention,waitMinutes,sortByPriority}=exports;

const now=Date.parse('2026-11-14T09:00:00Z');
const time=minutes=>new Date(now-minutes*60000).toISOString();
const row=(id,props={})=>({id,assigned_to:null,ai_paused:false,
  last_inbound_at:null,last_outbound_at:null,last_message_at:time(1),...props});

test('new inbound messages need reply, outbound messages clear the pending state',()=>{
  assert.equal(needsReply(row('a',{last_inbound_at:time(3),last_outbound_at:time(4)})),true);
  assert.equal(needsReply(row('a',{last_inbound_at:time(4),last_outbound_at:time(3)})),false);
  assert.equal(needsReply(row('a',{last_inbound_at:null,last_outbound_at:null})),false);
});
test('waiting threshold is two minutes, urgent human handoffs are immediate',()=>{
  assert.equal(needsAttention(row('a',{last_inbound_at:time(1)}),now),false);
  assert.equal(needsAttention(row('a',{last_inbound_at:time(2)}),now),true);
  assert.equal(needsAttention(row('a',{last_inbound_at:time(1),ai_paused:true}),now),true);
  assert.equal(waitMinutes(row('a',{last_inbound_at:time(5)}),now),5);
});
test('priority puts human waiting first, overdue second, recent inbound third',()=>{
  const items=[
    row('other',{last_message_at:time(0)}),
    row('fresh',{last_inbound_at:time(1),last_message_at:time(1)}),
    row('overdue',{last_inbound_at:time(5),last_message_at:time(5)}),
    row('human',{last_inbound_at:time(1),ai_paused:true,last_message_at:time(1)}),
  ];
  assert.deepEqual(sortByPriority(items,now).map(x=>x.id),['human','overdue','fresh','other']);
  assert.equal(items[0].id,'other','original array must not mutate');
});
