import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const header=req.headers.get('authorization');
 if(!header?.startsWith('Bearer '))return NextResponse.json({error:'Sign in first'},{status:401});
 let input:{invitationId?:unknown};
 try{input=await req.json()}catch{return NextResponse.json({error:'Invalid request'},{status:400})}
 if(typeof input.invitationId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.invitationId))
  return NextResponse.json({error:'Invalid invitation'},{status:400});
 try{
  const database=db();
  const {data:{user},error}=await database.auth.getUser(header.slice(7));
  if(error||!user?.email||!user.email_confirmed_at)
   return NextResponse.json({error:'Sign in with a verified email first'},{status:403});
  const {data:businessId,error:acceptError}=await database.rpc('accept_moderator_invitation',{
   p_invitation_id:input.invitationId,p_user_id:user.id,p_email:user.email
  });
  if(acceptError)return NextResponse.json({error:'Invitation expired, invalid, or belongs to another email'},{status:403});
  return NextResponse.json({accepted:true,businessId},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Invitation service unavailable'},{status:503})}
}
