import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';
import {processDueWebsiteSync} from '@/lib/website-product-sync';
export const runtime='nodejs';
export const maxDuration=60;
function authorized(req:NextRequest){const secret=process.env.CRON_SECRET??'',actual=Buffer.from(req.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);return secret.length>=24&&actual.length===expected.length&&timingSafeEqual(actual,expected);}
export async function GET(req:NextRequest){
 if(!authorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return NextResponse.json({error:'Not configured'},{status:503});
 try{const results=await processDueWebsiteSync(adminDb(url,key));return NextResponse.json({processed:results.length,results},{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Website sync worker failed'},{status:503});}
}
