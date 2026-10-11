import {createClient} from '@supabase/supabase-js';

export function getServerConfig() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken=process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret=process.env.TELEGRAM_WEBHOOK_SECRET;
  const businessId=process.env.TELEGRAM_BUSINESS_ID;
  if (!url || !secret || !botToken || !webhookSecret || !businessId || webhookSecret.length<16)
    throw new Error('Server Telegram environment variables are missing or invalid.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId))
    throw new Error('TELEGRAM_BUSINESS_ID must be a UUID.');
  return {url,secret,botToken,webhookSecret,businessId};
}

export function adminDb(url:string,secret:string) {
  return createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function telegramSend(botToken:string,chatId:string,text:string) {
  const response=await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text}),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const result=await response.json().catch(()=>null) as null|{ok?:boolean;description?:string;result?:{message_id?:number}};
  if(!response.ok||!result?.ok||!result.result?.message_id)
    throw new Error(`Telegram delivery failed (${response.status}): ${result?.description??'unknown response'}`);
  return String(result.result.message_id);
}
