import {NextRequest,NextResponse} from 'next/server';
import {authorizeCourierManager} from '@/lib/courier-auth';
import {encryptChannelCredential} from '@/lib/support-channel-credentials';
import {isCourier,validateCourierInput} from '@/lib/courier-config';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const columns='provider,pickup_name,pickup_phone,pickup_address,updated_at';
function reply(data:object,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function GET(req:NextRequest){
 try{
  const auth=await authorizeCourierManager(req);if(!auth)return reply({error:'Owner or admin access required for this workspace'},403);
  const {data,error}=await auth.db.from('courier_connections').select(columns).eq('business_id',auth.businessId);
  if(error)return reply({error:'Courier settings unavailable. Please retry.'},503);
  return reply({connections:data??[],bookingEnabled:false});
 }catch{return reply({error:'Courier settings unavailable'},503);}
}
export async function POST(req:NextRequest){
 try{
  const auth=await authorizeCourierManager(req);if(!auth)return reply({error:'Owner or admin access required for this workspace'},403);
  const raw=await req.text();if(raw.length>20000)return reply({error:'Request too large'},413);
  let body:ReturnType<typeof validateCourierInput>;
  try{body=validateCourierInput(JSON.parse(raw));}catch(e){return reply({error:e instanceof SyntaxError?'Invalid request':e instanceof Error?e.message:'Invalid setup'},400);}
  const credentials_ciphertext=encryptChannelCredential(JSON.stringify(body.credentials),`courier:${auth.businessId}:${body.provider}`);
  const {data,error}=await auth.db.from('courier_connections').upsert({business_id:auth.businessId,provider:body.provider,pickup_name:body.pickupName,pickup_phone:body.pickupPhone,pickup_address:body.pickupAddress,credentials_ciphertext,updated_by:auth.userId,updated_at:new Date().toISOString()},{onConflict:'business_id,provider'}).select(columns).single();
  if(error)return reply({error:'Could not save courier settings'},503);
  return reply({connection:data,bookingEnabled:false});
 }catch{return reply({error:'Could not save. Secure credential storage may need configuration.'},503);}
}
export async function DELETE(req:NextRequest){
 try{
  const auth=await authorizeCourierManager(req);if(!auth)return reply({error:'Owner or admin access required for this workspace'},403);
  const provider=req.nextUrl.searchParams.get('provider');if(!isCourier(provider))return reply({error:'Choose a supported courier'},400);
  const {error}=await auth.db.from('courier_connections').delete().eq('business_id',auth.businessId).eq('provider',provider);
  return error?reply({error:'Could not remove setup'},503):reply({ok:true});
 }catch{return reply({error:'Could not remove setup'},503);}
}
