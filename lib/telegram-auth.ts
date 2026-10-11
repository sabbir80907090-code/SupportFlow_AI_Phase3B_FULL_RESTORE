import {NextRequest,NextResponse} from 'next/server';
import {adminDb,getServerConfig} from '@/lib/telegram-server';

export async function authorizeTelegramStaff(req:NextRequest, businessId:unknown) {
  let cfg:ReturnType<typeof getServerConfig>;
  try{cfg=getServerConfig();}catch{return {ok:false as const,error:NextResponse.json({error:'Server not configured'},{status:503})};}
  if(businessId!==cfg.businessId)return {ok:false as const,error:NextResponse.json({error:'This bot is connected to a different business'},{status:409})};
  const header=req.headers.get('authorization')??'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return {ok:false as const,error:NextResponse.json({error:'Sign in required'},{status:401})};
  const db=adminDb(cfg.url,cfg.secret);
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth.user)return {ok:false as const,error:NextResponse.json({error:'Invalid login'},{status:401})};
  const {data:member,error:memberError}=await db.from('business_members').select('role')
    .eq('business_id',cfg.businessId).eq('user_id',auth.user.id).maybeSingle();
  if(memberError||!member)return {ok:false as const,error:NextResponse.json({error:'Not authorized for this business'},{status:403})};
  return {ok:true as const,db,cfg,userId:auth.user.id,role:member.role as string};
}
