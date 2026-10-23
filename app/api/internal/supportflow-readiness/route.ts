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
 const grouped=new Map<string,number>();
 const issues:string[]=[];
 for(const c of connections??[]){
  grouped.set(c.business_id,(grouped.get(c.business_id)??0)+1);
  // Credentials created through Connect Bot are encrypted in the database, not env maps.
  const {data:stored,error:credentialError}=await db.from('support_telegram_credentials')
   .select('bot_token_ciphertext,webhook_secret_ciphertext').eq('connection_id',c.id).maybeSingle();
  if(credentialError||!stored?.bot_token_ciphertext)issues.push('missing_delivery_token');
  if(credentialError||!stored?.webhook_secret_ciphertext)issues.push('missing_webhook_secret');
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
