import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {detectAiProvider,type AiProvider} from '@/lib/ai-provider-detection';
import {discoverAiModels} from '@/lib/support-ai-model-discovery';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const ctx=await authorizedBusiness(req).catch(()=>null);
 if(!ctx)return failure('Unauthorized',403);
 let input:{apiKey?:string;provider?:string};
 try{input=await req.json()}catch{return failure('Invalid request')}
 const key=String(input.apiKey??'').trim();
 if(key.length<20||key.length>512)return failure('Enter a valid API key first');
 const detected=detectAiProvider(key);
 const provider=detected??input.provider;
 if(!provider||!['gemini','openai','anthropic'].includes(provider))return failure('Select the AI provider');
 if(detected&&input.provider&&input.provider!==detected)return failure('Provider does not match this key');
 try{
  const result=await discoverAiModels(provider as AiProvider,key);
  return NextResponse.json({...result,provider},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const message=e instanceof Error?e.message:'';
  return failure(message==='Provider rejected the API key or access is restricted'?message:'Could not load models for this key. Check the key or choose a custom model.',400);
 }
}
