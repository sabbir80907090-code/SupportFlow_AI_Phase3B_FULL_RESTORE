import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';
import {discoverAiModels,type AiProvider,type DiscoveredModels} from '@/lib/support-ai-model-discovery';
export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};
const cache=new Map<string,{expires:number;value:DiscoveredModels}>();
export async function POST(req:NextRequest){
 let ctx;
 try{ctx=await authorizedBusiness(req)}catch{return failure('Service unavailable',503)}
 if(!ctx)return failure('Unauthorized',403);
 let input:{id?:string;refresh?:boolean};
 try{input=await req.json()}catch{return failure('Invalid request')}
 if(!/^[0-9a-f-]{36}$/i.test(input.id??''))return failure('Invalid key ID');
 const {data:key,error}=await ctx.database.from('support_ai_api_keys')
  .select('id,provider,key_ciphertext').eq('id',input.id).eq('business_id',ctx.businessId).maybeSingle();
 if(error)return failure('Unable to load API key',503);
 if(!key)return failure('API key not found',404);
 const cacheKey=ctx.businessId+':'+key.id;
 const saved=cache.get(cacheKey);
 if(!input.refresh&&saved&&saved.expires>Date.now())return NextResponse.json(saved.value,{headers:noStore});
 try{
  const apiKey=decryptChannelCredential(key.key_ciphertext,key.id);
  const value=await discoverAiModels(key.provider as AiProvider,apiKey);
  if(cache.size>100)cache.clear();
  cache.set(cacheKey,{expires:Date.now()+5*60*1000,value});
  return NextResponse.json(value,{headers:noStore});
 }catch(e){
  const message=e instanceof Error?e.message:'Model discovery failed';
  return failure(message==='Provider rejected the API key or access is restricted'?message:
   message==='No compatible text-generation models were returned by this API key'?message:
   'Unable to fetch provider models. Retry or use a custom model ID.',503);
 }
}
