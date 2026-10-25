import {randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {encryptChannelCredential,decryptChannelCredential} from '@/lib/support-channel-credentials';
import {metaConfig,managedPages,oauthSession,oauthCookie,graph} from '@/lib/messenger';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown)=>NextResponse.json(body,{headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  const {data:connection,error}=await auth.database.from('support_channel_connections').select('id,external_account_id,display_name,enabled').eq('business_id',auth.businessId).eq('channel','messenger').maybeSingle();
  if(error)return failure('Connections unavailable',503);
  const configured=!!metaConfig();let pages:{id:string;name:string}[]=[];
  if(configured&&!connection){const session=await oauthSession(req,auth.businessId);if(session)pages=(await managedPages(session.token)).map(p=>({id:p.id,name:p.name}));}
  return json({configured,connection,pages});
 }catch{return failure('Facebook Page list unavailable. Try connecting again.',502);}
}
export async function POST(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  if(!metaConfig())return failure('Facebook connection is awaiting platform setup.',503);
  const input=await req.json();if(typeof input.pageId!=='string'||!/^\d{1,40}$/.test(input.pageId))return failure('Select a valid Page');
  const session=await oauthSession(req,auth.businessId);if(!session)return failure('Facebook login expired. Connect again.',401);
  const page=(await managedPages(session.token)).find(p=>p.id===input.pageId);
  if(!page)return failure('You do not have messaging access to that Page',403);
  const id=randomUUID(),cipher=encryptChannelCredential(page.access_token,id);
  // Database uniqueness prevents a Page being routed to multiple tenants.
  const {error:insertError}=await auth.database.from('support_channel_connections').insert({id,business_id:auth.businessId,channel:'messenger',external_account_id:page.id,display_name:page.name,enabled:false});
  if(insertError)return failure('A Messenger Page is already connected here, or this Page belongs to another account.',409);
  const {error:credentialError}=await auth.database.from('support_messenger_credentials').insert({connection_id:id,page_token_ciphertext:cipher});
  if(credentialError){await auth.database.from('support_channel_connections').delete().eq('id',id);return failure('Unable to store Page credentials',503);}
  try{
   const subscribed=await graph<{success:boolean}>(page.id+'/subscribed_apps',page.access_token,'POST',{subscribed_fields:'messages'});
   if(!subscribed.success)throw Error('Subscription failed');
   const {error:enableError}=await auth.database.from('support_channel_connections').update({enabled:true}).eq('id',id).eq('business_id',auth.businessId);
   if(enableError)throw Error('Activation failed');
  }catch{
   // Keep the disabled reservation if provider cleanup fails; never transfer a live Page accidentally.
   try{await graph(page.id+'/subscribed_apps',page.access_token,'DELETE');await auth.database.from('support_channel_connections').delete().eq('id',id).eq('business_id',auth.businessId);}catch{}
   return failure('Facebook subscription failed. Check platform setup or disconnect and retry.',502);
  }
  await auth.database.from('support_messenger_oauth').delete().eq('id',session.id).eq('business_id',auth.businessId);
  const response=json({ok:true});response.cookies.delete(oauthCookie);return response;
 }catch{return failure('Facebook connection failed. Please reconnect.',502);}
}
export async function DELETE(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  const {data:c,error}=await auth.database.from('support_channel_connections').select('id,external_account_id').eq('business_id',auth.businessId).eq('channel','messenger').maybeSingle();
  if(error)return failure('Connection unavailable',503);if(!c)return json({ok:true});
  // Stop delivery before removing the provider subscription.
  const {error:disableError}=await auth.database.from('support_channel_connections').update({enabled:false}).eq('id',c.id).eq('business_id',auth.businessId);
  if(disableError)return failure('Unable to disable connection',503);
  const {data:credential,error:ce}=await auth.database.from('support_messenger_credentials').select('page_token_ciphertext').eq('connection_id',c.id).maybeSingle();
  if(ce)return failure('Unable to read credentials',503);
  if(credential)await graph(c.external_account_id+'/subscribed_apps',decryptChannelCredential(credential.page_token_ciphertext,c.id),'DELETE');
  const {error:removeError}=await auth.database.from('support_channel_connections').delete().eq('id',c.id).eq('business_id',auth.businessId);
  if(removeError)return failure('Unable to remove connection',503);
  return json({ok:true});
 }catch{return failure('Page disabled locally. Facebook unsubscribe failed; reconnect permissions and retry.',502);}
}
