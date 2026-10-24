import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {encryptChannelCredential} from '@/lib/support-channel-credentials';
export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};
async function owner(req:NextRequest){try{return await authorizedBusiness(req)}catch{return null}}
export async function GET(req:NextRequest){
 const ctx=await owner(req);if(!ctx)return failure('Unauthorized',401);
 const {data,error}=await ctx.database.from('support_ai_api_keys').select('id,label,provider,model,key_hint,priority,enabled,created_at').eq('business_id',ctx.businessId).order('priority',{ascending:true}).limit(20);
 if(error)return failure('Unable to load API keys',503);
 return NextResponse.json({keys:data??[]},{headers:noStore});
}
export async function POST(req:NextRequest){
 const ctx=await owner(req);if(!ctx)return failure('Unauthorized',401);
 let input:{label?:string;apiKey?:string;priority?:number;provider?:string;model?:string};
 try{input=await req.json()}catch{return failure('Invalid request')}
 const label=String(input.label??'').trim(),apiKey=String(input.apiKey??'').trim();
 const provider=input.provider??'gemini';
 const defaults:Record<string,string>={gemini:'gemini-2.5-flash',openai:'gpt-4.1-mini',anthropic:'claude-sonnet-4-5'};
 if(!Object.hasOwn(defaults,provider))return failure('Unsupported AI provider');
 const model=String(input.model??defaults[provider]).trim();
 if(label.length<1||label.length>80||model.length<2||model.length>100||!/^[a-zA-Z0-9._:-]+$/.test(model)||apiKey.length<20||apiKey.length>512)return failure('Invalid label, model or API key');
 const {count,error:ce}=await ctx.database.from('support_ai_api_keys').select('id',{count:'exact',head:true}).eq('business_id',ctx.businessId);
 if(ce)return failure('Unable to check key limit',503);
 if((count??0)>=10)return failure('Maximum 10 API keys per business');
 const id=randomUUID();
 // Verify before storing; never return or log plaintext keys.
 try{
  const endpoint=provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models':provider==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models';
  const response=await fetch(endpoint,{headers:provider==='gemini'?{'x-goog-api-key':apiKey}:provider==='openai'?{authorization:'Bearer '+apiKey}:{'x-api-key':apiKey,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)return failure('Provider rejected the API key',400);
 }catch{return failure('Unable to verify provider API key',503)}
 let cipher:string;try{cipher=encryptChannelCredential(apiKey,id)}catch{return failure('Encryption unavailable',503)}
 const {error}=await ctx.database.from('support_ai_api_keys').insert({id,business_id:ctx.businessId,label,provider,model,key_ciphertext:cipher,key_hint:apiKey.slice(-4),priority:Math.max(1,Math.min(9999,Number.isInteger(input.priority)?input.priority!:100))});
 if(error)return failure('Unable to save API key',503);
 return NextResponse.json({ok:true},{headers:noStore});
}
export async function PATCH(req:NextRequest){
 const ctx=await owner(req);if(!ctx)return failure('Unauthorized',401);
 let input:{id?:string;enabled?:boolean;priority?:number;label?:string;model?:string};try{input=await req.json()}catch{return failure('Invalid request')}
 if(!/^[0-9a-f-]{36}$/i.test(input.id??''))return failure('Invalid key ID');
 const changes:Record<string,unknown>={};
 if(typeof input.enabled==='boolean')changes.enabled=input.enabled;
 if(Number.isInteger(input.priority)&&input.priority!>=1&&input.priority!<=9999)changes.priority=input.priority;
 if(typeof input.label==='string'&&input.label.trim().length>=1&&input.label.trim().length<=80)changes.label=input.label.trim();
 if(typeof input.model==='string'){const model=input.model.trim();if(model.length<2||model.length>100||!/^[a-zA-Z0-9._:-]+$/.test(model))return failure('Invalid model ID');changes.model=model;}
 if(!Object.keys(changes).length)return failure('No valid changes');
 const {error}=await ctx.database.from('support_ai_api_keys').update(changes).eq('id',input.id).eq('business_id',ctx.businessId);
 if(error)return failure('Update failed',503);
 return NextResponse.json({ok:true},{headers:noStore});
}
export async function DELETE(req:NextRequest){
 const ctx=await owner(req);if(!ctx)return failure('Unauthorized',401);
 let input:{id?:string};try{input=await req.json()}catch{return failure('Invalid request')}
 if(!/^[0-9a-f-]{36}$/i.test(input.id??''))return failure('Invalid key ID');
 const {error}=await ctx.database.from('support_ai_api_keys').delete().eq('id',input.id).eq('business_id',ctx.businessId);
 if(error)return failure('Delete failed',503);
 return NextResponse.json({ok:true},{headers:noStore});
}
