import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/telegram-server';
import {publicUrl} from '@/lib/public-url-fetch';
import {processWebsiteSync} from '@/lib/website-product-sync';
async function access(req:NextRequest,businessId:string){
 const auth=req.headers.get('authorization')??'';if(!auth.startsWith('Bearer '))return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return null;
 const db=adminDb(url,key),{data:{user},error}=await db.auth.getUser(auth.slice(7));if(error||!user)return null;
 const {data:member}=await db.from('business_members').select('role').eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
 return member&&['owner','admin'].includes(member.role)?{db,user}:null;
}
function fail(message:string,status=400){return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('businessId')??'';if(!id)return fail('Workspace is required');
 const auth=await access(req,id);if(!auth)return fail('Owner or Admin access required',403);
 const {data,error}=await auth.db.from('website_sync_connections').select('id,business_id,website_url,status,frequency_minutes,next_sync_at,last_sync_at,last_status,last_error,pages_discovered,pages_processed,products_synced,created_at').eq('business_id',id).neq('status','disconnected').order('created_at',{ascending:false});
 if(error)return fail('Could not load website connections',503);
 const ids=(data??[]).map(x=>x.id);
 const runs=ids.length?await auth.db.from('website_sync_runs').select('id,connection_id,status,pages_discovered,pages_processed,products_created,products_updated,error,started_at,finished_at').in('connection_id',ids).order('started_at',{ascending:false}).limit(30):{data:[],error:null};
 return NextResponse.json({connections:data??[],runs:runs.data??[]},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 let body:any;try{body=await req.json()}catch{return fail('Invalid request')}
 const id=String(body.businessId??''),auth=await access(req,id);if(!auth)return fail('Owner or Admin access required',403);
 try{
  const website=publicUrl(String(body.url??'')).href;
  const frequency=Number(body.frequencyMinutes??360);if(![60,360,720,1440].includes(frequency))return fail('Choose a supported sync interval');
  const {data:existing}=await auth.db.from('website_sync_connections').select('id').eq('business_id',id).eq('website_url',website).maybeSingle();
  if(existing)return fail('This website is already connected');
  const {data:connection,error}=await auth.db.from('website_sync_connections').insert({business_id:id,website_url:website,frequency_minutes:frequency,created_by:auth.user.id,status:'active',next_sync_at:new Date().toISOString()}).select('id,business_id,website_url,status,frequency_minutes,next_sync_at,last_sync_at,last_status').single();
  if(error||!connection)return fail('Could not connect website',503);
  return NextResponse.json({connection},{status:201});
 }catch(e){return fail(e instanceof Error?e.message:'Invalid public website URL')}
}
export async function PATCH(req:NextRequest){
 let body:any;try{body=await req.json()}catch{return fail('Invalid request')}
 const id=String(body.businessId??''),connectionId=String(body.connectionId??''),auth=await access(req,id);if(!auth)return fail('Owner or Admin access required',403);
 const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(body.action==='sync-now'){
  const {data:connection,error}=await auth.db.from('website_sync_connections').select('id,business_id,website_url,frequency_minutes,status').eq('id',connectionId).eq('business_id',id).maybeSingle();
  if(error||!connection||connection.status==='disconnected')return fail('Website connection not found',404);
  try{return NextResponse.json({result:await processWebsiteSync(auth.db,connection)});}catch{return fail('Website sync failed. Check the sync history.',503);}
 }
 if(body.action==='pause')patch.status='paused';
 else if(body.action==='resume'){patch.status='active';patch.next_sync_at=new Date().toISOString();}
 else if(body.action==='disconnect')patch.status='disconnected';
 else if(body.action==='frequency'&&[60,360,720,1440].includes(Number(body.frequencyMinutes)))patch.frequency_minutes=Number(body.frequencyMinutes);
 else return fail('Unsupported action');
 const {error}=await auth.db.from('website_sync_connections').update(patch).eq('id',connectionId).eq('business_id',id);
 if(error)return fail('Could not update website connection',503);
 return NextResponse.json({ok:true});
}
