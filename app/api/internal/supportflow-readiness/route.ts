import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
function authorized(req:NextRequest){
 const secret=process.env.CRON_SECRET??'';
 const a=Buffer.from(req.headers.get('authorization')??'');
 const b=Buffer.from('Bearer '+secret);
 return secret.length>=24&&a.length===b.length&&timingSafeEqual(a,b);
}
/** Read-only preflight. Never sends Telegram messages or changes database state. */
export async function GET(req:NextRequest){
 if(!authorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Database not configured'},{status:503});
 const db=adminDb(url,key);
 const {data:connections,error}=await db.from('support_channel_connections')
  .select('id,business_id,channel,enabled').eq('channel','telegram').eq('enabled',true);
 if(error)return NextResponse.json({error:'Connection check unavailable'},{status:503});
 let tokens:Record<string,unknown>={};
 let secrets:Record<string,unknown>={};
 try{
  const t=JSON.parse(process.env.SUPPORTFLOW_TELEGRAM_BOT_TOKENS??'{}') as unknown;
  const s=JSON.parse(process.env.SUPPORTFLOW_TELEGRAM_WEBHOOK_SECRETS??'{}') as unknown;
  if(!t||typeof t!=='object'||Array.isArray(t)||!s||typeof s!=='object'||Array.isArray(s))
   throw Error('invalid');
  tokens=t as Record<string,unknown>;secrets=s as Record<string,unknown>;
 }catch{return NextResponse.json({ready:false,reason:'Invalid connection configuration'},{status:503});}
 const grouped=new Map<string,number>();
 const issues:string[]=[];
 for(const c of connections??[]){
  grouped.set(c.business_id,(grouped.get(c.business_id)??0)+1);
  if(typeof tokens[c.id]!=='string'||!String(tokens[c.id]).trim())issues.push('missing_delivery_token');
  if(typeof secrets[c.id]!=='string'||String(secrets[c.id]).length<16)issues.push('missing_webhook_secret');
  if(tokens[c.id]===process.env.TELEGRAM_BOT_TOKEN)issues.push('legacy_bot_conflict');
 }
 if([...grouped.values()].some(count=>count!==1))issues.push('ambiguous_business_mapping');
 const enabled=(connections??[]).length;
 if(!enabled)issues.push('no_enabled_telegram_connection');
 // Never return tenant identifiers, tokens, secrets, or customer data.
 return NextResponse.json({
  ready:issues.length===0,enabledConnections:enabled,
  issues:[...new Set(issues)],
  aiEnabled:process.env.SUPPORTFLOW_NEW_AI_ENABLED==='true',
  deliveryEnabled:process.env.SUPPORTFLOW_NEW_DELIVERY_ENABLED==='true',
  note:'Read-only readiness report; not an end-to-end delivery test'
 },{headers:{'Cache-Control':'no-store'}});
}
