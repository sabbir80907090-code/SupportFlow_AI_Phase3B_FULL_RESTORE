import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(error:string,status:number)=>NextResponse.json({error},{status});

export async function DELETE(req:NextRequest){
 const auth=req.headers.get('authorization');
 if(!auth?.startsWith('Bearer '))return fail('Sign in required.',401);
 const input=await req.json().catch(()=>null);
 if(typeof input?.businessId!=='string'||!uuid.test(input.businessId)||
    typeof input?.messageId!=='string'||!uuid.test(input.messageId))return fail('Invalid selection.',400);
 try{
  const database=db();
  const {data:{user},error}=await database.auth.getUser(auth.slice(7));
  if(error||!user)return fail('Sign in required.',401);
  const {data:member}=await database.from('business_members').select('role')
   .eq('business_id',input.businessId).eq('user_id',user.id).maybeSingle();
  if(!member||!['owner','admin','agent'].includes(member.role))return fail('Workspace access required.',403);
  const {data:reply}=await database.from('support_messages').select('telegram_delivery,created_at')
   .eq('id',input.messageId).eq('business_id',input.businessId).eq('direction','outbound').is('deleted_at',null).maybeSingle();
  const receipt=reply?.telegram_delivery;
  if(!receipt||!/^\d+$/.test(receipt.bot)||! /^-?\d+$/.test(receipt.chat)||!/^\d+$/.test(receipt.message)
    ||Date.now()-Date.parse(reply!.created_at)>=48*3600000)return fail('Telegram deletion is unavailable for this reply.',409);
  const {data:connection}=await database.from('support_channel_connections').select('id')
   .eq('business_id',input.businessId).eq('channel','telegram').eq('external_account_id',receipt.bot).eq('enabled',true).maybeSingle();
  if(!connection)return fail('The sending bot is disconnected.',409);
  const {data:credential}=await database.from('support_telegram_credentials').select('bot_token_ciphertext').eq('connection_id',connection.id).maybeSingle();
  if(!credential)return fail('Sending bot unavailable.',503);
  const token=decryptChannelCredential(credential.bot_token_ciphertext,connection.id);
  if(token.split(':')[0]!==receipt.bot)return fail('Sending bot unavailable.',409);
  const response=await fetch('https://api.telegram.org/bot'+token+'/deleteMessage',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:receipt.chat,message_id:Number(receipt.message)}),
   redirect:'error',signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok||result.ok!==true||result.result!==true)return fail('Telegram did not confirm deletion.',409);
  return NextResponse.json({removed:true});
 }catch{return fail('Telegram deletion could not be confirmed.',503)}
}
