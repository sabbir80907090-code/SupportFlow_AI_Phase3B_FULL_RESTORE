import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {db} from '@/lib/support-telegram-connect';

export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

/** Remove a membership, not a global Supabase Auth user. Only the workspace owner may remove another member. */
export async function DELETE(req:NextRequest){
 const bearer=req.headers.get('authorization')??'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Sign in required'},401);
 let input:unknown;
 try{input=await req.json()}catch{return reply({error:'Invalid request'},400)}
 if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"Invalid request"},400);
 const {businessId,memberId,password}=input as {businessId?:unknown;memberId?:unknown;password?:unknown};
 if(typeof businessId!=='string'||!uuid.test(businessId)||typeof memberId!=='string'||!uuid.test(memberId)
   ||typeof password!=='string'||password.length<1||password.length>1024)return reply({error:'Invalid request'},400);
 try{
  const database=db();
  const {data:{user},error:userError}=await database.auth.getUser(bearer.slice(7));
  if(userError||!user?.email)return reply({error:'Sign in required'},401);
  // Never trust the client's role or selected workspace without a fresh DB check.
  const checkOwner=()=>database.from('businesses').select('id')
   .eq('id',businessId).eq('owner_id',user.id).maybeSingle();
  const {data:owner,error:ownerError}=await checkOwner();
  if(ownerError)return reply({error:'Team service unavailable'},503);
  if(!owner)return reply({error:'Workspace owner access required'},403);
  if(memberId===user.id)return reply({error:'You cannot remove yourself'},403);
  const {data:target,error:targetError}=await database.from('business_members').select('role')
   .eq('business_id',businessId).eq('user_id',memberId).maybeSingle();
  if(targetError)return reply({error:'Team service unavailable'},503);
  if(!target)return reply({error:'Member is not in this workspace'},404);
  if(!['admin','agent'].includes(target.role))return reply({error:'This membership is protected'},403);
  // Password verification uses an isolated non-persistent auth client; it must never replace
  // the currently signed-in browser session or be written to the database or logs.
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return reply({error:'Password verification unavailable'},503);
  const verifier=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:verified,error:passwordError}=await verifier.auth.signInWithPassword({email:user.email,password});
  if(passwordError||verified.user?.id!==user.id)return reply({error:'Incorrect password. Team member was not removed.'},403);
  const {data:stillOwner,error:recheckError}=await checkOwner();
  if(recheckError)return reply({error:'Team service unavailable'},503);
  if(!stillOwner)return reply({error:'Workspace ownership has changed'},403);
  const {data:removed,error:deleteError}=await database.from('business_members').delete()
   .eq('business_id',businessId).eq('user_id',memberId).eq('role',target.role)
   .select('user_id').maybeSingle();
  if(deleteError)return reply({error:'Could not remove team member'},503);
  if(!removed)return reply({error:'Member role changed or was already removed'},409);
  return reply({removed:true});
 }catch{return reply({error:'Team service unavailable'},503)}
}
