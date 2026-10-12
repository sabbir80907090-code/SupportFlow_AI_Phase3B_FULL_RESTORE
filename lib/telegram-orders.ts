import {adminDb,getServerConfig,telegramSend} from '@/lib/telegram-server';

/**
 * Phase 3C deterministic Telegram order intake.
 * Feature flag OFF by default. Apply Phase 3C SQL before enabling.
 * Order details are validated and finalized atomically by the Supabase RPC.
 */
export async function handleTelegramOrderMessage(
  conversationId:string,
  messageId:number,
  messageText:string
):Promise<boolean> {
  if (process.env.TELEGRAM_ORDER_FLOW_ENABLED !== 'true') return false;
  const cfg=getServerConfig();
  const db=adminDb(cfg.url,cfg.secret);
  const {data,error}=await db.rpc('handle_telegram_order_message',{
    p_business_id:cfg.businessId,
    p_conversation_id:conversationId,
    p_message_id:messageId,
    p_text:messageText
  });
  if(error){
    console.error('Phase 3C order RPC failed',error.code);
    throw new Error('Telegram order intake unavailable');
  }
  const result=data as {handled?:boolean;reply?:string;order_created?:boolean}|null;
  if(!result?.handled) return false;
  if(result.reply){
    const {data:chat,error:chatError}=await db.from('telegram_conversations')
      .select('external_chat_id').eq('business_id',cfg.businessId)
      .eq('id',conversationId).single();
    if(chatError||!chat)throw new Error('Telegram order chat not found');
    // Delivery is not blindly retried; the RPC already recorded the step.
    // This avoids sending duplicate prompts if Telegram retries a webhook.
    try {
      const telegramId=await telegramSend(cfg.botToken,chat.external_chat_id,result.reply);
      const {error:writeError}=await db.from('telegram_messages').insert({
        business_id:cfg.businessId,conversation_id:conversationId,
        direction:'outbound',text:result.reply,telegram_message_id:telegramId,
        ai_generated:false
      });
      if(writeError)console.error('Phase 3C order prompt history write failed',writeError.code);
    }catch(e){
      console.error('Phase 3C Telegram delivery uncertain',e instanceof Error?e.message:String(e));
    }
  }
  return true;
}
