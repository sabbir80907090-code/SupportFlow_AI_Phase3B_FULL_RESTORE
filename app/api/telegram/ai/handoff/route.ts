import {NextRequest,NextResponse} from 'next/server';
import {authorizeTelegramStaff} from '@/lib/telegram-auth';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  let input:{businessId?:unknown;conversationId?:unknown;paused?:unknown};
  try{input=await req.json() as typeof input;}catch{return NextResponse.json({error:'Bad JSON'},{status:400});}
  const auth=await authorizeTelegramStaff(req,input.businessId);
  if(!auth.ok)return auth.error;
  if(typeof input.conversationId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.conversationId)||typeof input.paused!=='boolean')
    return NextResponse.json({error:'Invalid conversation or pause state'},{status:400});
  const {data,error}=await auth.db.from('telegram_conversations').update({ai_paused:input.paused})
    .eq('business_id',auth.cfg.businessId).eq('id',input.conversationId).select('id').maybeSingle();
  if(error){console.error('AI handoff update failed',error.code);return NextResponse.json({error:'Could not update AI handoff. Run Phase 3B SQL first.'},{status:500});}
  if(!data)return NextResponse.json({error:'Conversation not found'},{status:404});
  return NextResponse.json({ok:true});
}
