import {createHmac,timingSafeEqual} from 'node:crypto';
import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential,encryptChannelCredential} from '@/lib/support-channel-credentials';

export const whatsappGraphVersion=process.env.META_GRAPH_VERSION||'v25.0';
export function whatsappConfig(){
 const appId=process.env.META_APP_ID,appSecret=process.env.META_APP_SECRET;
 const origin=process.env.SUPPORTFLOW_APP_URL,verifyToken=process.env.META_WEBHOOK_VERIFY_TOKEN;
 const loginConfigId=process.env.META_LOGIN_CONFIG_ID;
 if(!appId||!/^\\d+$/.test(appId)||!appSecret||!origin||!verifyToken||verifyToken.length<24||!loginConfigId||!/^v\\d+\\.0$/.test(whatsappGraphVersion))return null;
 try{const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;return {appId,appSecret,origin:u.origin,verifyToken,loginConfigId};}catch{return null;}
}
export function validWhatsAppSignature(raw:string,signature:string,secret:string){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 const a=Buffer.from(signature),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function whatsappGraph<T>(path:string,token:string,method='GET',body?:Record<string,unknown>):Promise<T>{
 if(!/^[a-zA-Z0-9_/-]+$/.test(path))throw Error('Invalid Graph path');
 const url='https://graph.facebook.com/'+whatsappGraphVersion+'/'+path;
 const response=await fetch(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),cache:'no-store'});
 const result=await response.json();
 if(!response.ok||result.error)throw Error('WhatsApp provider request failed');
 return result as T;
}
export type WhatsAppInbound={phoneNumberId:string;senderId:string;eventId:string;text:string;timestamp:number;displayName:string};
export function whatsappEvents(payload:unknown):WhatsAppInbound[]{
 const root=payload as {object?:unknown;entry?:unknown[]};if(root?.object!=='whatsapp_business_account'||!Array.isArray(root.entry))return [];
 const out:WhatsAppInbound[]=[];
 for(const entryRaw of root.entry){
  const entry=entryRaw as {changes?:unknown[]};
  for(const changeRaw of entry?.changes??[]){
   const change=changeRaw as {field?:unknown;value?:{metadata?:{phone_number_id?:unknown};contacts?:unknown[];messages?:unknown[]}};
   if(change?.field!=='messages'||!change.value)continue;
   const phone=change.value.metadata?.phone_number_id;
   if(typeof phone!=='string'||!/^\\d{1,40}$/.test(phone))continue;
   const contacts=new Map<string,string>();
   for(const rawContact of change.value.contacts??[]){const c=rawContact as {wa_id?:unknown;profile?:{name?:unknown}};if(typeof c.wa_id==='string'&&typeof c.profile?.name==='string')contacts.set(c.wa_id,c.profile.name.slice(0,160));}
   for(const rawMessage of change.value.messages??[]){
    const m=rawMessage as {from?:unknown;id?:unknown;timestamp?:unknown;type?:unknown;text?:{body?:unknown}};
    if(typeof m.from!=='string'||!/^\\d{1,40}$/.test(m.from)||typeof m.id!=='string'||!/^wamid\\.[A-Za-z0-9_-]{4,190}$/.test(m.id)||m.type!=='text'||typeof m.text?.body!=='string'||!m.text.body.trim()||typeof m.timestamp!=='string'||!/^\\d{10,13}$/.test(m.timestamp))continue;
    const numeric=Number(m.timestamp),timestamp=numeric<1e12?numeric*1000:numeric;
    if(!Number.isSafeInteger(timestamp)||timestamp>Date.now()+60000)continue;
    out.push({phoneNumberId:phone,senderId:phone+':'+m.from,eventId:m.id,text:m.text.body.trim().slice(0,12000),timestamp,displayName:contacts.get(m.from)||'WhatsApp customer'});
   }
  }
 }
 return out;
}
export function whatsappRecipient(senderId:string,phoneNumberId:string){
 const [phone,recipient,...extra]=senderId.split(':');
 if(extra.length||phone!==phoneNumberId||!/^\\d{1,40}$/.test(phone)||!/^\\d{1,40}$/.test(recipient??''))return null;
 return recipient;
}
export function withinWhatsAppWindow(timestamp:string,now=Date.now()){
 const at=Date.parse(timestamp);return Number.isFinite(at)&&at<=now+60000&&now-at<24*60*60*1000;
}
export function asksForWhatsAppHuman(text:string){
 return /\\b(human|real person|live agent|speak to (an? )?(agent|person)|talk to (an? )?(agent|person))\\b/i.test(text)||
 /(মানুষের সাথে|মানুষের সঙ্গে|এজেন্টের সাথে|এজেন্টের সঙ্গে|কাস্টমার কেয়ার|কাস্টমার কেয়ার)/.test(text);
}
