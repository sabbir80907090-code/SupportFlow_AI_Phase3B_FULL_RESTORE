import {createHmac,timingSafeEqual} from 'node:crypto';

export function secureEqual(a:string,b:string){
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export function validMetaSignature(raw:string,signature:string,secret:string){
 return !!secret&&/^sha256=[a-f0-9]{64}$/.test(signature)&&
  secureEqual(signature,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));
}
export function messengerRecipient(senderId:string,pageId:string){
 const [page,recipient,...extra]=senderId.split(':');
 if(extra.length||page!==pageId||!/^\d{1,40}$/.test(page)||!/^\d{1,40}$/.test(recipient??''))return null;
 return recipient;
}
export function withinMessengerWindow(timestamp:string,now=Date.now()){
 const at=Date.parse(timestamp);
 return Number.isFinite(at)&&at<=now+60000&&now-at<24*60*60*1000;
}
export type MessengerInbound={pageId:string;senderId:string;eventId:string;text:string;timestamp:number};
export function messengerEvents(payload:unknown):MessengerInbound[]{
 const root=payload as {object?:unknown;entry?:unknown[]};
 if(root?.object!=='page'||!Array.isArray(root.entry))return [];
 const result:MessengerInbound[]=[];
 for(const rawEntry of root.entry){
  const entry=rawEntry as {id?:unknown;messaging?:unknown[]};
  if(typeof entry?.id!=='string'||!/^\d{1,40}$/.test(entry.id)||!Array.isArray(entry.messaging))continue;
  for(const rawEvent of entry.messaging){
   const e=rawEvent as {sender?:{id?:unknown};recipient?:{id?:unknown};timestamp?:unknown;message?:{mid?:unknown;text?:unknown;is_echo?:unknown}};
   if(e?.message?.is_echo||e?.recipient?.id!==entry.id||typeof e.sender?.id!=='string'||!/^\d{1,40}$/.test(e.sender.id))continue;
   if(typeof e.message?.mid!=='string'||!e.message.mid||e.message.mid.length>200||typeof e.message.text!=='string'||!e.message.text.trim())continue;
   if(typeof e.timestamp!=='number'||!Number.isSafeInteger(e.timestamp)||e.timestamp<=0||e.timestamp>Date.now()+60000)continue;
   result.push({pageId:entry.id,senderId:entry.id+':'+e.sender.id,eventId:e.message.mid,text:e.message.text.trim().slice(0,12000),timestamp:e.timestamp});
  }
 }
 return result;
}
export function asksForHuman(text:string){
 return /\b(human|real person|live agent|speak to (an? )?(agent|person)|talk to (an? )?(agent|person))\b/i.test(text)||
  /(মানুষের সাথে|মানুষের সঙ্গে|এজেন্টের সাথে|এজেন্টের সঙ্গে|কাস্টমার কেয়ার|কাস্টমার কেয়ার)/.test(text);
}
