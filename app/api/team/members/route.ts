import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {db} from '@/lib/support-telegram-connect';

export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
type Action='disconnect'|'reconnect'|'delete';

async function manage(req:NextRequest,method:'POST'|'DELETE'){
 const bearer=req.headers.get('authorization')??'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Sign in required'},401);
 if(Number(req.headers.get('content-length')??0)>4096)return reply({error:'Request too large'},413);
 let input:unknown;
 try{input=await req.json()}catch{return reply({error:'Invalid request'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
 const {businessId,memberId,action,password}=input as Record<string,unknown>;
 if(typeof businessId!=='string'||!uuid.test(businessId)||typeof memberId!=='string'||!uuid.test(memberId)
  ||(action!=='disconnect'&&action!=='reconnect'&&action!=='delete'))return reply({error:'Invalid request'},400);
 if((method==='POST')!==(action==='reconnect'))return reply({error:'Unsupported action for method'},405);
 if(action==='delete'&&(typeof password!=='string'||!password||password.length>1024))
  return reply({error:'Owner password is required for deletion'},400);
 try{
  const database=db();
  const {data:{user},error:userError}=await database.auth.getUser(bearer.slice(7));
  if(userError||!user)return reply({error:'Sign in required'},401);
  if(user.id===memberId)return reply({error:'You cannot change your own membership'},403);
  // Tenant ownership is always checked server-side, never by email or UI role.
  const {data:workspace,error:workspaceError}=await database.from('businesses').select('owner_id')
   .eq('id',businessId).maybeSingle();
  if(workspaceError)return reply({error:'Team service unavailable'},503);
  if(!workspace||workspace.owner_id!==user.id)return reply({error:'Workspace owner only'},403);
  if(action==='delete'){
   if(!user.email)return reply({error:'Owner email is unavailable'},403);
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
   const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   if(!url||!key)return reply({error:'Password verification unavailable'},503);
   const verifier=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {data:verified,error:passwordError}=await verifier.auth.signInWithPassword({email:user.email,password:password as string});
   if(passwordError||verified.user?.id!==user.id)
    return reply({error:'Password verification failed. No changes were made.'},403);
  }
  let memberEmail:string|null=null;
  if(action!=='reconnect'){
   const {data:target,error:targetError}=await database.auth.admin.getUserById(memberId);
   if(targetError||!target.user?.email)return reply({error:'Member identity unavailable'},503);
   memberEmail=target.user.email.trim().toLowerCase();
  }
  // Database RPC rechecks owner under lock and performs the transition atomically.
  const {data,error}=await database.rpc('bartacare_manage_team_member',{
   p_business_id:businessId,p_actor_id:user.id,p_member_id:memberId,
   p_action:action as Action,p_member_email:memberEmail
  });
  if(error){
   if(error.code==='42501')return reply({error:'Not authorized for this team action'},403);
   if(error.code==='P0002')return reply({error:'Member state changed; refresh and retry'},409);
   if(error.code==='23514')return reply({error:'No available team seats'},409);
   if(error.code==='22023')return reply({error:'Invalid team action'},400);
   return reply({error:'Team update unavailable'},503);
  }
  return reply({success:true,status:data});
 }catch{return reply({error:'Team service unavailable'},503)}
}
export async function POST(req:NextRequest){return manage(req,'POST')}
export async function DELETE(req:NextRequest){return manage(req,'DELETE')}
