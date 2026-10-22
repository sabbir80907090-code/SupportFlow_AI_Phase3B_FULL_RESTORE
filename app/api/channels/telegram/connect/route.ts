import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,db,failure,newConnectionId,newWebhookSecret,seal,telegramApi,tokenPattern} from '@/lib/support-telegram-connect';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Bot={id:number;username?:string;first_name?:string;is_bot:boolean};
export async function GET(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Unauthorized or business setup incomplete',403);
  const {data,error}=await auth.database.from('support_channel_connections').select('id,display_name,external_account_id,enabled').eq('business_id',auth.businessId).eq('channel','telegram').limit(1);
  if(error)return failure('Connections unavailable',503);
  return NextResponse.json({connection:data?.[0]??null},{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Service unavailable',503);}
}
export async function POST(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Unauthorized or business setup incomplete',403);
  if(Number(req.headers.get('content-length')??0)>4096)return failure('Request too large',413);
  const body=await req.json() as {token?:unknown};
  const token=typeof body.token==='string'?body.token.trim():'';
  if(!tokenPattern.test(token))return failure('Invalid Telegram token format');
  if(token===process.env.TELEGRAM_BOT_TOKEN)return failure('This bot is reserved for the existing integration',409);
  const {data:existing,error:ee}=await auth.database.from('support_channel_connections').select('id').eq('business_id',auth.businessId).eq('channel','telegram').limit(1);
  if(ee)return failure('Connection lookup failed',503);
  if(existing?.length)return failure('Disconnect the existing Telegram bot first',409);
  const bot=await telegramApi<Bot>(token,'getMe');
  if(!bot.is_bot||!bot.id||!bot.username)return failure('Invalid Telegram bot');
  const {data:duplicate,error:de}=await auth.database.from('support_channel_connections').select('id').eq('channel','telegram').eq('external_account_id',String(bot.id)).limit(1);
  if(de)return failure('Connection lookup failed',503);
  if(duplicate?.length)return failure('This Telegram bot is already connected',409);
  const currentWebhook=await telegramApi<{url:string}>(token,'getWebhookInfo');
  // Do not take over a bot whose webhook belongs to another application.
  if(currentWebhook.url)return failure('This bot already has a webhook. Use a new bot to avoid disrupting the existing integration.',409);
  const id=newConnectionId(),secret=newWebhookSecret();
  const encrypted=seal(token,secret,id);
  const {error:insertError}=await auth.database.from('support_channel_connections').insert({id,business_id:auth.businessId,channel:'telegram',external_account_id:String(bot.id),display_name:'@'+bot.username,enabled:false});
  if(insertError)return failure('Unable to create connection',409);
  const {error:storeError}=await auth.database.from('support_telegram_credentials').insert({connection_id:id,bot_token_ciphertext:encrypted.token,webhook_secret_ciphertext:encrypted.secret});
  if(storeError){await auth.database.from('support_channel_connections').delete().eq('id',id);return failure('Unable to store credentials',503);}
  const base=process.env.SUPPORTFLOW_PUBLIC_WEBHOOK_BASE_URL;
  if(!base||!/^https:\/\//.test(base)){await auth.database.from('support_channel_connections').delete().eq('id',id);return failure('Webhook base URL not configured',503);}
  try{
   await telegramApi(token,'setWebhook',{url:base.replace(/\/$/,'')+'/api/channels/telegram/'+id,secret_token:secret,allowed_updates:['message'],drop_pending_updates:false});
  }catch{
   await auth.database.from('support_channel_connections').delete().eq('id',id);
   return failure('Telegram webhook setup failed',502);
  }
  const {error:enableError}=await auth.database.from('support_channel_connections').update({enabled:true}).eq('id',id).eq('business_id',auth.businessId);
  if(enableError)return failure('Webhook registered but connection activation needs review',503);
  return NextResponse.json({connection:{id,display_name:'@'+bot.username,enabled:true}},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Connection failed. Check the token and retry.',502);}
}
export async function DELETE(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Unauthorized',403);
  const {data:c,error}=await auth.database.from('support_channel_connections').select('id').eq('business_id',auth.businessId).eq('channel','telegram').maybeSingle();
  if(error)return failure('Connection lookup failed',503);
  if(!c)return NextResponse.json({ok:true});
  const {data:credential,error:ce}=await auth.database.from('support_telegram_credentials').select('bot_token_ciphertext').eq('connection_id',c.id).maybeSingle();
  if(ce||!credential)return failure('Credential unavailable',503);
  const {decryptChannelCredential}=await import('@/lib/support-channel-credentials');
  const token=decryptChannelCredential(credential.bot_token_ciphertext,c.id);
  await telegramApi(token,'deleteWebhook',{drop_pending_updates:false});
  const {error:removeError}=await auth.database.from('support_channel_connections').delete().eq('id',c.id).eq('business_id',auth.businessId);
  if(removeError)return failure('Unable to remove connection',503);
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Disconnect failed; please retry',502);}
}
