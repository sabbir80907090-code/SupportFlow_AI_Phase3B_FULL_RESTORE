import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function owner(req:NextRequest,businessId:string){
 const token=req.headers.get('authorization');
 if(!token?.startsWith('Bearer '))return null;
 const database=db();
 const {data:{user},error}=await database.auth.getUser(token.slice(7));
 if(error||!user)return null;
 const {data:business}=await database.from('businesses').select('id,name')
  .eq('id',businessId).eq('owner_id',user.id).maybeSingle();
 return business?{database,user,business}:null;
}
export async function GET(req:NextRequest){
 const businessId=new URL(req.url).searchParams.get('businessId')??'';
 if(!/^[a-f0-9-]{36}$/i.test(businessId))return respond({error:'Invalid workspace'},400);
 const auth=await owner(req,businessId);if(!auth)return respond({error:'Owner access required'},403);
 const {data,error}=await auth.database.from('business_team_invitations')
  .select('id,email,role,status,created_at,expires_at').eq('business_id',businessId)
  .order('created_at',{ascending:false}).limit(50);
 if(error)return respond({error:'Team invitations unavailable'},503);
 const {data:members}=await auth.database.from('business_members').select('user_id,role')
  .eq('business_id',businessId);
 return respond({invitations:data??[],members:members??[]});
}
export async function POST(req:NextRequest){
 let body:unknown;try{body=await req.json()}catch{return respond({error:'Invalid request'},400)}
 const input=body as {businessId?:unknown;email?:unknown};
 if(typeof input?.businessId!=='string'||typeof input?.email!=='string')return respond({error:'Invalid request'},400);
 const businessId=input.businessId,email=input.email.trim().toLowerCase();
 if(!/^[a-f0-9-]{36}$/i.test(businessId)||email.length>254||
 !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return respond({error:'Valid email and workspace required'},400);
 const auth=await owner(req,businessId);if(!auth)return respond({error:'Owner access required'},403);
 const base=process.env.SUPPORTFLOW_APP_URL;
 if(!base||!/^https:\/\/[^/]+\/?$/.test(base))return respond({error:'Invitation email redirect is not configured'},503);
 const {data:id,error:saveError}=await auth.database.rpc('create_moderator_invitation',{
  p_business_id:businessId,p_owner_id:auth.user.id,p_email:email
 });
 if(saveError)return respond({error:saveError.message},409);
 // Supabase Auth delivers the verification email; do not create any membership yet.
 const redirect=base.replace(/\/$/,'')+'/?teamInvite='+id;
 const {error:sendError}=await auth.database.auth.admin.inviteUserByEmail(email,{
  ...(redirect?{redirectTo:redirect}:{})
 });
 if(sendError){
  // Existing accounts cannot be re-invited via admin.inviteUserByEmail.
  // Send a normal login email instead, still requiring explicit acceptance.
  const existing=/already|registered|exists/i.test(sendError.message);
  let recovered=false;
  if(existing&&redirect&&process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){
   const publicClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
   const {error:otpError}=await publicClient.auth.signInWithOtp({
    email,options:{shouldCreateUser:false,emailRedirectTo:redirect}
   });
   recovered=!otpError;
  }
  if(!recovered){
   await auth.database.from('business_team_invitations').update({status:'revoked'})
    .eq('id',id).eq('business_id',businessId).eq('status','pending');
   return respond({error:'Invitation email could not be delivered. Check email service settings or try again later.'},502);
  }
 }
 return respond({invitationId:id,status:'pending'},201);
}
export async function DELETE(req:NextRequest){
 let body:unknown;try{body=await req.json()}catch{return respond({error:'Invalid request'},400)}
 const input=body as {businessId?:unknown;invitationId?:unknown};
 if(typeof input?.businessId!=='string'||typeof input?.invitationId!=='string')return respond({error:'Invalid request'},400);
 const auth=await owner(req,input.businessId);if(!auth)return respond({error:'Owner access required'},403);
 const {data,error}=await auth.database.from('business_team_invitations').update({status:'revoked'})
  .eq('id',input.invitationId).eq('business_id',input.businessId).eq('status','pending')
  .select('id').maybeSingle();
 if(error)return respond({error:'Could not revoke invitation'},503);
 return respond({revoked:!!data});
}
