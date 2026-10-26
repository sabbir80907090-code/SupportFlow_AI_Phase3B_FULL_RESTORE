import {randomBytes,createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db,failure} from '@/lib/support-telegram-connect';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==new URL(req.url).origin)return failure('Origin rejected',403);
 try{const {site}=await req.json();if(typeof site!=='string'||!/^[a-f0-9-]{36}$/.test(site))return failure('Invalid site');
 const token=randomBytes(32).toString('hex');
 const {error}=await db().rpc('website_chat',{p_site:site,p_hash:createHash('sha256').update(token).digest('hex'),p_action:'start'});
 if(error)return failure('Chat unavailable or busy. Please try later.',429);
 return NextResponse.json({token},{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Chat unavailable',503);}
}
