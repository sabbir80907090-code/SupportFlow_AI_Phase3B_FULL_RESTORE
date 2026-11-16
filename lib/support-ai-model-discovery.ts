export type AiProvider='gemini'|'openai'|'anthropic';
export type DiscoveredModels={models:string[];recommended:string;discoveredAt:string};
type ModelItem={id?:unknown;name?:unknown;supportedGenerationMethods?:unknown};
const validId=(id:string)=>id.length>=2&&id.length<=100&&/^[a-zA-Z0-9._:-]+$/.test(id);
const preferred:Record<AiProvider,string[]>={
 gemini:['gemini-flash-lite-latest','gemini-flash-latest','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-pro-latest'],
 openai:['gpt-4.1-mini','gpt-4o-mini','gpt-4.1','gpt-4o'],
 anthropic:['claude-haiku-4-5','claude-sonnet-4-5','claude-opus-4-1']
};
export function compatibleModel(provider:AiProvider,item:ModelItem):string|null{
 const id=String(provider==='gemini'?item.name??'':item.id??'').replace(/^models\//,'');
 if(!validId(id))return null;
 if(provider==='gemini'){
  if(!Array.isArray(item.supportedGenerationMethods)||!item.supportedGenerationMethods.includes('generateContent'))return null;
  // The support worker only uses text chat generation, not images, video, audio,
  // computer-use, research agents or experimental preview tools.
  if(/(image|imagen|veo|video|audio|tts|embedding|aqa|computer-use|deep-research|antigravity|robotics|spatial|native-audio|live)/i.test(id))return null;
  return /^(gemini-(?:[0-9]+(?:\.[0-9]+)?-|flash|pro)|learnlm-)/i.test(id)?id:null;
 }
 if(provider==='anthropic')return id.startsWith('claude-')?id:null;
 // The OpenAI models list does not expose endpoint capabilities. Keep non-chat
 // families out of the reply-model selector; actual generation still needs testing.
 if(!/^(gpt-(?:4|5|6)(?:[.\-]|$)|o[134](?:[\-]|$)|chatgpt-4o(?:[\-]|$))/.test(id))return null;
 if(/(audio|realtime|transcrib|tts|image|search|embedding|moderation|instruct|vision-preview)/i.test(id))return null;
 return id;
}
export function rankModels(provider:AiProvider,ids:string[]):DiscoveredModels{
 const models=[...new Set(ids.filter(validId))].sort((a,b)=>{
  const ai=preferred[provider].indexOf(a),bi=preferred[provider].indexOf(b);
  if(ai!==-1||bi!==-1)return (ai===-1?999:ai)-(bi===-1?999:bi);
  return a.localeCompare(b);
 }).slice(0,150);
 return {models,recommended:models[0]??'',discoveredAt:new Date().toISOString()};
}
export async function discoverAiModels(provider:AiProvider,apiKey:string):Promise<DiscoveredModels>{
 const endpoint:Record<AiProvider,string>={
  gemini:'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
  openai:'https://api.openai.com/v1/models',
  anthropic:'https://api.anthropic.com/v1/models?limit=100'
 };
 const headers:HeadersInit=provider==='gemini'?{'x-goog-api-key':apiKey}:provider==='openai'?{authorization:'Bearer '+apiKey}:{'x-api-key':apiKey,'anthropic-version':'2023-06-01'};
 const ids:string[]=[];
 let next:string|undefined;
 for(let page=0;page<(provider==='openai'?1:3);page++){
  const url=new URL(endpoint[provider]);
  if(next)url.searchParams.set(provider==='gemini'?'pageToken':'after_id',next);
  const response=await fetch(url.toString(),{headers,signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(response.status===401||response.status===403)throw Error('Provider rejected the API key or access is restricted');
  if(!response.ok)throw Error('Provider model lookup failed (HTTP '+response.status+')');
  const payload=await response.json() as {models?:ModelItem[];data?:ModelItem[];nextPageToken?:string;has_more?:boolean;last_id?:string};
  const items=provider==='gemini'?payload.models:payload.data;
  if(!Array.isArray(items))throw Error('Provider returned an invalid model list');
  for(const item of items){const id=compatibleModel(provider,item);if(id)ids.push(id)}
  next=provider==='gemini'?payload.nextPageToken:provider==='anthropic'&&payload.has_more?payload.last_id:undefined;
  if(!next)break;
 }
 const result=rankModels(provider,ids);
 if(!result.models.length)throw Error('No compatible text-generation models were returned by this API key');
 return result;
}
