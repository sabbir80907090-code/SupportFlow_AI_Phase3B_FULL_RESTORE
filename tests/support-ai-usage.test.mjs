import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/support-ai-usage.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};new Function('exports','module',js)(module.exports,module);
const {providerTokenUsage}=module.exports;
test('Gemini reports actual prompt, candidate and total tokens',()=>{
 assert.deepEqual(providerTokenUsage('gemini',{usageMetadata:{promptTokenCount:123,candidatesTokenCount:45,totalTokenCount:180}}),{inputTokens:123,outputTokens:45,totalTokens:180});
});
test('OpenAI and Anthropic usage is normalized',()=>{
 assert.deepEqual(providerTokenUsage('openai',{usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}}),{inputTokens:100,outputTokens:20,totalTokens:120});
 assert.deepEqual(providerTokenUsage('anthropic',{usage:{input_tokens:50,output_tokens:10}}),{inputTokens:50,outputTokens:10,totalTokens:60});
});
test('unknown usage stays null and never becomes a fake zero',()=>{
 assert.deepEqual(providerTokenUsage('gemini',{}),{inputTokens:null,outputTokens:null,totalTokens:null});
 assert.deepEqual(providerTokenUsage('openai',{usage:{prompt_tokens:-1,completion_tokens:'7'}}),{inputTokens:null,outputTokens:null,totalTokens:null});
});
