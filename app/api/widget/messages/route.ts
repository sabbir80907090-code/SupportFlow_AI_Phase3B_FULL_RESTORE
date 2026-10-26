import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db,failure} from '@/lib/support-telegram-connect';
import {asksForHuman} from '@/lib/messenger-security';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==new URL(req.url).origin)return failure('Origin rejected',403);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');if(!token||!/^[a-f0-9]{64}$/.test(token))return failure('Session required',401);
 try{const raw=await req.text();if(raw.length>10000)return failure('Message too large',413);const input=JSON.parse(raw);
 if(typeof input.site!=='string'||!/^[a-f0-9-]{36}$/.test(input.site)||!['send','poll'].includes(input.action))return failure('Invalid request');
 if(input.action==='send'&&(typeof input.text!=='string'||input.text.trim().length<1||input.text.length>2000||typeof input.event!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(input.event)))return failure('Invalid message');
 const {data,error}=await db().rpc('website_chat',{p_site:input.site,p_hash:createHash('sha256').update(token).digest('hex'),p_action:input.action,p_text:input.action==='send'?input.text:'',p_event:input.action==='send'?input.event:'',p_handoff:input.action==='send'&&asksForHuman(input.text)});
 if(error)return failure(error.message==='Session expired'?'Chat session expired. Start a new chat.':'Chat unavailable or sending too quickly. Please try again.',error.message==='Session expired'?401:429);
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Chat unavailable',503);}
}
