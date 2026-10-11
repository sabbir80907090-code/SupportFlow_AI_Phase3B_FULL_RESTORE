import {NextRequest,NextResponse} from 'next/server';
import {authorizeTelegramStaff} from '@/lib/telegram-auth';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  let input:{businessId?:unknown;enabled?:unknown;systemPrompt?:unknown};
  try{input=await req.json() as typeof input;}catch{return NextResponse.json({error:'Bad JSON'},{status:400});}
  const auth=await authorizeTelegramStaff(req,input.businessId);
  if(!auth.ok)return auth.error;
  if(!['owner','admin'].includes(auth.role))return NextResponse.json({error:'Only owners and admins may change AI settings'},{status:403});
  if(typeof input.enabled!=='boolean'||typeof input.systemPrompt!=='string'||input.systemPrompt.length>2500)
    return NextResponse.json({error:'Invalid AI settings'},{status:400});
  if(input.enabled && !process.env.GEMINI_API_KEY)return NextResponse.json({error:'GEMINI_API_KEY is missing on server'},{status:503});
  const {error}=await auth.db.from('telegram_ai_settings').upsert({business_id:auth.cfg.businessId,
    auto_reply_enabled:input.enabled,system_prompt:input.systemPrompt,updated_at:new Date().toISOString()},{onConflict:'business_id'});
  if(error){console.error('AI settings write failed',error.code);return NextResponse.json({error:'Could not save AI settings. Run Phase 3B SQL first.'},{status:500});}
  return NextResponse.json({ok:true});
}
