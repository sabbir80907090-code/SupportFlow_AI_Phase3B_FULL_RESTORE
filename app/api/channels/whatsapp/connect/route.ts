import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {whatsappConfig,whatsappGraph} from '@/lib/whatsapp';
import {decryptChannelCredential,encryptChannelCredential} from '@/lib/support-channel-credentials';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body:unknown)=>NextResponse.json(body,{headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  const {data,error}=await auth.database.from('support_channel_connections').select('id,external_account_id,display_name,enabled').eq('business_id',auth.businessId).eq('channel','whatsapp').maybeSingle();
  if(error)return failure('WhatsApp connection unavailable',503);
  const configured=!!whatsappConfig();
  let details:null|{phoneNumber:string;verifiedName:string}=null;
  if(data){const {data:c}=await auth.database.from('support_whatsapp_credentials').select('display_phone_number,verified_name').eq('connection_id',data.id).maybeSingle();if(c)details={phoneNumber:c.display_phone_number,verifiedName:c.verified_name};}
  return json({configured,connection:data?{...data,...details}:null});
 }catch{return failure('WhatsApp status unavailable',503);}
}
export async function POST(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  if(!whatsappConfig())return failure('WhatsApp platform setup is incomplete. Ask the platform administrator to configure Meta.',503);
  const raw=await req.text();if(raw.length>8000)return failure('Signup response too large',413);
  let input:any;try{input=JSON.parse(raw)}catch{return failure('Invalid signup response');}
  if(typeof input.code!=='string'||typeof input.wabaId!=='string'||typeof input.phoneNumberId!=='string')return failure('Complete Meta Embedded Signup first');
  const tokenResponse=await fetch('https://graph.facebook.com/'+(process.env.META_GRAPH_VERSION||'v25.0')+'/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.META_APP_ID!,client_secret:process.env.META_APP_SECRET!,code:input.code}),signal:AbortSignal.timeout(12000),cache:'no-store'});
  const tokenData=await tokenResponse.json();if(!tokenResponse.ok||typeof tokenData.access_token!=='string')return failure('Meta could not authorize this WhatsApp account',422);
  const token=tokenData.access_token as string;
  const phones=await whatsappGraph<{data:{id:string;display_phone_number?:string;verified_name?:string}[]}>(input.wabaId,token,'GET');
  const phone=phones.data?.find(p=>p.id===input.phoneNumberId);if(!phone)return failure('The selected phone number is not in the authorized WhatsApp Business Account',403);
  const id=randomUUID(),cipher=encryptChannelCredential(token,id);
  const {error:insertError}=await auth.database.from('support_channel_connections').insert({id,business_id:auth.businessId,channel:'whatsapp',external_account_id:phone.id,display_name:phone.verified_name||phone.display_phone_number||'WhatsApp Business',enabled:false});
  if(insertError)return failure('This phone number is already connected to another workspace or this workspace already has a WhatsApp number',409);
  const {error:credentialError}=await auth.database.from('support_whatsapp_credentials').insert({connection_id:id,waba_id:input.wabaId,phone_number_id:phone.id,access_token_ciphertext:cipher,verified_name:phone.verified_name||'',display_phone_number:phone.display_phone_number||''});
  if(credentialError){await auth.database.from('support_channel_connections').delete().eq('id',id);return failure('Could not securely save WhatsApp credentials',503);}
  try{
   const subscribed=await whatsappGraph<{success?:boolean}>(input.wabaId+'/subscribed_apps',token,'POST');
   if(subscribed.success===false)throw Error('Subscription failed');
   const {error}=await auth.database.from('support_channel_connections').update({enabled:true}).eq('id',id).eq('business_id',auth.businessId);
   if(error)throw Error('Activation failed');
  }catch{
   await auth.database.from('support_channel_connections').update({enabled:false}).eq('id',id).eq('business_id',auth.businessId);
   return failure('WhatsApp account was authorized but webhook subscription failed. Disconnect and retry after checking Meta permissions.',502);
  }
  return json({ok:true,connection:{id,display_name:phone.verified_name||phone.display_phone_number||'WhatsApp Business',external_account_id:phone.id,enabled:true,phone_number:phone.display_phone_number||''}});
 }catch{return failure('WhatsApp connection failed. Please start Embedded Signup again.',502);}
}
export async function DELETE(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  const {data:c,error}=await auth.database.from('support_channel_connections').select('id,external_account_id').eq('business_id',auth.businessId).eq('channel','whatsapp').maybeSingle();
  if(error)return failure('Connection lookup failed',503);if(!c)return json({ok:true});
  const {error:disableError}=await auth.database.from('support_channel_connections').update({enabled:false}).eq('id',c.id).eq('business_id',auth.businessId);
  if(disableError)return failure('Unable to disable WhatsApp delivery',503);
  const {data:credential,error:ce}=await auth.database.from('support_whatsapp_credentials').select('waba_id,access_token_ciphertext').eq('connection_id',c.id).maybeSingle();
  if(ce)return failure('Unable to read WhatsApp credentials',503);
  if(credential){try{const token=decryptChannelCredential(credential.access_token_ciphertext,c.id);await whatsappGraph(credential.waba_id+'/subscribed_apps',token,'DELETE');}catch{/* Local disable is authoritative; provider unsubscribe can be retried in Meta. */}}
  const {error:removeError}=await auth.database.from('support_channel_connections').delete().eq('id',c.id).eq('business_id',auth.businessId);
  if(removeError)return failure('Unable to remove WhatsApp connection',503);
  return json({ok:true});
 }catch{return failure('WhatsApp disconnect failed',503);}
}
