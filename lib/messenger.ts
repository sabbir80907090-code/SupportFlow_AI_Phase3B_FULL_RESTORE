import {createHash,createHmac} from 'node:crypto';
import {NextRequest} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
import {decryptChannelCredential} from '@/lib/support-channel-credentials';
export const oauthCookie='__Host-supportflow_messenger';
export const graphVersion=process.env.META_GRAPH_VERSION||'v25.0';
export function metaConfig(){
 const appId=process.env.META_APP_ID,appSecret=process.env.META_APP_SECRET,origin=process.env.SUPPORTFLOW_APP_URL,verifyToken=process.env.META_WEBHOOK_VERIFY_TOKEN;
 if(!appId||!/^\d+$/.test(appId)||!appSecret||!origin||!verifyToken||verifyToken.length<24||!/^v\d+\.0$/.test(graphVersion))return null;
 try{const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;return {appId,appSecret,origin:u.origin,verifyToken,redirectUri:u.origin+'/api/channels/messenger/callback'};}catch{return null;}
}
export const stateHash=(state:string)=>createHash('sha256').update(state).digest('hex');
export async function graph<T>(path:string,token:string,method='GET',params:Record<string,string>={}):Promise<T>{
 if(!/^[a-zA-Z0-9_/-]+$/.test(path))throw Error('Invalid Graph path');
 const config=metaConfig();if(!config)throw Error('Messenger platform setup incomplete');
 const url=new URL('https://graph.facebook.com/'+graphVersion+'/'+path);
 const data=new URLSearchParams({...params,appsecret_proof:createHmac('sha256',config.appSecret).update(token).digest('hex')});
 if(method==='GET')url.search=data.toString();
 const response=await fetch(url,{method,headers:{authorization:'Bearer '+token,...(method!=='GET'?{'content-type':'application/x-www-form-urlencoded'}:{})},body:method==='GET'?undefined:data.toString(),signal:AbortSignal.timeout(12000),cache:'no-store'});
 const result=await response.json();
 if(!response.ok||result.error)throw Error('Facebook request failed. Check Page permissions or reconnect.');
 return result as T;
}
export type MetaPage={id:string;name:string;access_token:string;tasks?:string[]};
export async function managedPages(token:string){
 const pages:MetaPage[]=[];let after:string|undefined;
 for(let i=0;i<10;i++){
  const result=await graph<{data:MetaPage[];paging?:{next?:string;cursors?:{after?:string}}}>('me/accounts',token,'GET',{fields:'id,name,access_token,tasks',limit:'100',...(after?{after}:{})});
  for(const p of result.data??[])if(/^\d{1,40}$/.test(p.id)&&p.access_token&&p.tasks?.includes('MESSAGING'))pages.push(p);
  if(!result.paging?.next)break;
  after=result.paging.cursors?.after;if(!after)break;
 }
 return pages;
}
export async function oauthSession(req:NextRequest,businessId:string){
 const state=req.cookies.get(oauthCookie)?.value;
 if(!state||!/^[a-f0-9]{64}$/.test(state))return null;
 const {data,error}=await db().from('support_messenger_oauth').select('id,token_ciphertext,expires_at,status')
  .eq('state_hash',stateHash(state)).eq('business_id',businessId).eq('status','selecting').gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error||!data?.token_ciphertext)return null;
 return {...data,token:decryptChannelCredential(data.token_ciphertext,data.id)};
}
