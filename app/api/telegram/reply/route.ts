import {NextRequest,NextResponse} from 'next/server';
import {adminDb,getServerConfig,telegramSend} from '@/lib/telegram-server';

export const runtime='nodejs';

export async function POST(req:NextRequest) {
  let cfg:ReturnType<typeof getServerConfig>;
  try{cfg=getServerConfig();}catch{return NextResponse.json({error:'Server not configured'},{status:503});}
  const header=req.headers.get('authorization')??'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return NextResponse.json({error:'Sign in required'},{status:401});
  const db=adminDb(cfg.url,cfg.secret);
  const {data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth.user)return NextResponse.json({error:'Invalid login'},{status:401});
  let input:{conversationId?:unknown;text?:unknown};
  try{input=await req.json() as typeof input;}catch{return NextResponse.json({error:'Bad JSON'},{status:400});}
  const id=typeof input.conversationId==='string'?input.conversationId:'';
  const message=typeof input.text==='string'?input.text.trim():'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
     message.length<1||message.length>4096)
    return NextResponse.json({error:'Invalid conversation or message (1-4096 characters)'},{status:400});
  const {data:member,error:memberError}=await db.from('business_members')
    .select('role').eq('business_id',cfg.businessId).eq('user_id',auth.user.id).maybeSingle();
  if(memberError||!member)return NextResponse.json({error:'Not authorized for Telegram business'},{status:403});
  const {data:conversation,error:conversationError}=await db.from('telegram_conversations')
    .select('id,external_chat_id').eq('business_id',cfg.businessId).eq('id',id).maybeSingle();
  if(conversationError||!conversation)return NextResponse.json({error:'Conversation not found'},{status:404});
  // Human replies take ownership of the chat before attempting Telegram delivery.
  // Safe even if Telegram fails: a human can resume AI explicitly from the dashboard.
  const {error:pauseError}=await db.from('telegram_conversations').update({ai_paused:true})
    .eq('id',id).eq('business_id',cfg.businessId);
  if(pauseError){console.error('Could not pause AI for manual reply',pauseError.code);
    return NextResponse.json({error:'Could not pause AI; reply was not sent. Run Phase 3B SQL first.'},{status:500});}
  let telegramMessageId:string;
  try{telegramMessageId=await telegramSend(cfg.botToken,conversation.external_chat_id,message);}
  catch(e){console.error('Telegram send failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Telegram delivery failed'},{status:502});}
  const {error:insertError}=await db.from('telegram_messages').insert({
    business_id:cfg.businessId,conversation_id:id,direction:'outbound',text:message,
    telegram_message_id:telegramMessageId,sent_by:auth.user.id
  });
  if(insertError){console.error('Telegram message was sent but history write failed',insertError.code);
    return NextResponse.json({error:'Message delivered to Telegram, but saving history failed. Do not retry automatically.'},{status:500});}
  const {error:recentError}=await db.from('telegram_conversations')
    .update({last_message_at:new Date().toISOString()}).eq('id',id).eq('business_id',cfg.businessId);
  if(recentError)console.error('Telegram conversation timestamp update failed',recentError.code);
  return NextResponse.json({ok:true});
}
