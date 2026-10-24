import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';
import {encryptChannelCredential,decryptChannelCredential} from '@/lib/support-channel-credentials';
export const tokenPattern=/^\d{5,}:[A-Za-z0-9_-]{20,}$/;
export function db(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Database unavailable');return adminDb(url,key);}
export async function authorizedBusiness(req:NextRequest){
 const bearer=req.headers.get('authorization')??'';
 if(!bearer.startsWith('Bearer '))return null;
 const database=db();const {data:{user},error}=await database.auth.getUser(bearer.slice(7));
 if(error||!user)return null;
 const {data:owned,error:oe}=await database.from('businesses').select('id').eq('owner_id',user.id).order('created_at',{ascending:true}).limit(2);
 if(oe||!owned||owned.length!==1)return null;
 return {database,businessId:owned[0].id};
}
export function failure(message:string,status=400){return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}
export async function telegramApi<T>(token:string,method:string,body?:object):Promise<T>{
 const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),cache:'no-store'});
 const json=await response.json() as {ok:boolean;result:T};
 if(!response.ok||!json.ok)throw Error('Telegram rejected the request');
 return json.result;
}
export function newConnectionId(){return randomUUID();}
export function newWebhookSecret(){return randomBytes(32).toString('hex');}
export function seal(token:string,secret:string,id:string){return {token:encryptChannelCredential(token,id),secret:encryptChannelCredential(secret,id)};}
export function unseal(token:string,secret:string,id:string){return {token:decryptChannelCredential(token,id),secret:decryptChannelCredential(secret,id)};}
