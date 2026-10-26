import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 const {data,error}=await auth.database.from('support_websites').select('id,origin,enabled').eq('business_id',auth.businessId).maybeSingle();
 if(error)return failure('Website settings unavailable',503);
 return NextResponse.json({site:data,appOrigin:process.env.SUPPORTFLOW_APP_URL},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 let origin;try{const input=await req.json();const u=new URL(input.origin);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{return failure('Enter your HTTPS website origin, for example https://example.com');}
 const {error}=await auth.database.from('support_websites').upsert({business_id:auth.businessId,origin,enabled:true},{onConflict:'business_id'});
 if(error)return failure('Could not save website',503);return GET(req);
}
export async function DELETE(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 const {error}=await auth.database.from('support_websites').update({enabled:false}).eq('business_id',auth.businessId);
 if(error)return failure('Could not disable chat',503);return GET(req);
}
