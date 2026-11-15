import {createHash,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';
import {telegramSend} from '@/lib/telegram-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Item={id:string;business_id:string;recipient:string;text:string;claim_token:string};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function authorized(req:NextRequest){
 const secret=process.env.CRON_SECRET;
 const bearer=req.headers.get('authorization');
 if(!secret||secret.length<32||!bearer?.startsWith('Bearer '))return false;
 return timingSafeEqual(
  createHash('sha256').update(secret).digest(),
  createHash('sha256').update(bearer.slice(7)).digest()
 );
}
async function deliver(item:Item):Promise<'sent'|'review'|'unconfirmed'>{
 const database=db();
 const {data:connection,error:ce}=await database.from('support_channel_connections')
  .select('id').eq('business_id',item.business_id).eq('channel','telegram').eq('enabled',true).maybeSingle();
 if(ce||!connection)return 'unconfirmed';
 const {data:credential,error:te}=await database.from('support_telegram_credentials')
  .select('bot_token_ciphertext').eq('connection_id',connection.id).maybeSingle();
 if(te||!credential)return 'unconfirmed';
 let token:string;
 try{token=decryptChannelCredential(credential.bot_token_ciphertext,connection.id)}
 catch{return 'unconfirmed'}
 let providerId:string|null=null;
 try{providerId=await telegramSend(token,item.recipient,item.text)}
 catch{providerId=null}
 const {data,error}=await database.rpc('ack_support_outbox',{
  p_business_id:item.business_id,p_id:item.id,p_claim_token:item.claim_token,
  p_sent:providerId!==null,p_provider_id:providerId
 });
 if(error||!data)return 'unconfirmed';
 return providerId?'sent':'review';
}
export async function GET(req:NextRequest){
 if(!authorized(req))return json({error:'Unauthorized'},401);
 if(process.env.SUPPORTFLOW_DIRECT_TELEGRAM_DISPATCH_ENABLED!=='true')return json({enabled:false,claimed:0});
 try{
  const database=db();
  const {data,error}=await database.rpc('claim_direct_telegram_outbox',{p_limit:10});
  if(error)return json({error:'Queue unavailable'},503);
  const items=(data??[]) as Item[];
  const settled=await Promise.allSettled(items.map(deliver));
  const outcomes=settled.map(x=>x.status==='fulfilled'?x.value:'unconfirmed');
  return json({enabled:true,claimed:items.length,
   sent:outcomes.filter(x=>x==='sent').length,
   needsReview:outcomes.filter(x=>x==='review').length,
   unconfirmed:outcomes.filter(x=>x==='unconfirmed').length});
 }catch{return json({error:'Dispatcher unavailable'},503)}
}
