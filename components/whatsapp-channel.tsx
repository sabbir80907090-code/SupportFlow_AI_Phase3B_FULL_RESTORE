'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
declare global{interface Window{FB?:{init:(config:Record<string,unknown>)=>void;login:(callback:(response:any)=>void,options:Record<string,unknown>)=>void};fbAsyncInit?:()=>void;}}
type Connection={id:string;display_name:string;external_account_id:string;enabled:boolean;phone_number?:string|null};
export function WhatsAppChannel({businessId}:{businessId:string}){
 const [connection,setConnection]=useState<Connection|null>(null),[configured,setConfigured]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const signup=useRef<{code:string|null;wabaId:string|null;phoneNumberId:string|null;finished:boolean}>({code:null,wabaId:null,phoneNumberId:null,finished:false});
 async function request(method:'GET'|'POST'|'DELETE',payload?:object){
  const sb=getSupabase();if(!sb)throw Error('Sign in required');const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Please sign in again');
  const response=await fetch('/api/channels/whatsapp/connect',{method,headers:{'x-business-id':businessId,authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'WhatsApp request failed');return result;
 }
 async function refresh(){setLoading(true);try{const result=await request('GET');setConfigured(result.configured);setConnection(result.connection??null);}catch(e){setError(e instanceof Error?e.message:'Unable to load WhatsApp');}finally{setLoading(false);}}
 useEffect(()=>{
  const appId=process.env.NEXT_PUBLIC_META_APP_ID;
  if(appId){
   const init=()=>{if(!window.FB)return;window.FB.init({appId,autoLogAppEvents:true,xfbml:false,version:process.env.NEXT_PUBLIC_META_GRAPH_VERSION||'v25.0'});};
   if(window.FB)init();else{window.fbAsyncInit=init;const script=document.createElement('script');script.async=true;script.defer=true;script.crossOrigin='anonymous';script.src='https://connect.facebook.net/en_US/sdk.js';document.head.appendChild(script);}
  }
  const handler=(event:MessageEvent)=>{
   if(event.origin!=='https://www.facebook.com')return;let data:any;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
   if(data?.type!=='WA_EMBEDDED_SIGNUP')return;const value=data.data??{};
   if(data.event==='FINISH'||value.current_step==='FINISH'){signup.current.wabaId=String(value.waba_id??'');signup.current.phoneNumberId=String(value.phone_number_id??'');signup.current.finished=true;void completeIfReady();}
   if(data.event==='CANCEL'||data.event==='ERROR'){setBusy(false);setError(data.event==='CANCEL'?'WhatsApp setup was cancelled.':'Meta could not complete WhatsApp setup.');}
  };
  window.addEventListener('message',handler);
  return()=>window.removeEventListener('message',handler);
 },[]);
 async function completeIfReady(){
  const s=signup.current;if(!s.code||!s.finished||!s.wabaId||!s.phoneNumberId)return;
  setBusy(true);setError('');try{const result=await request('POST',{code:s.code,wabaId:s.wabaId,phoneNumberId:s.phoneNumberId});setConnection(result.connection);setNotice('WhatsApp Business connected successfully.');}
  catch(e){setError(e instanceof Error?e.message:'WhatsApp connection failed.');}
  finally{signup.current={code:null,wabaId:null,phoneNumberId:null,finished:false};setBusy(false);}
 }
 function connect(){
  const appId=process.env.NEXT_PUBLIC_META_APP_ID,configId=process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID;
  if(!appId||!configId||!window.FB){setError('Meta Embedded Signup is not configured yet. Ask the platform administrator to finish Meta setup.');return;}
  signup.current={code:null,wabaId:null,phoneNumberId:null,finished:false};setBusy(true);setError('');setNotice('');
  window.FB.login((response:any)=>{
   const code=response?.authResponse?.code;
   if(!code){setBusy(false);setError('Meta authorization was cancelled or did not return a signup code. Try again.');return;}
   signup.current.code=code;void completeIfReady();
  },{config_id:configId,response_type:'code',override_default_response_type:true,extras:{setup:{}}});
 }
 async function disconnect(){setBusy(true);setError('');try{await request('DELETE');setConnection(null);setNotice('WhatsApp connection removed.');}catch(e){setError(e instanceof Error?e.message:'Disconnect failed.');}finally{setBusy(false);}}
 return <section className="rounded-2xl border border-line bg-panel p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-xl font-bold">WhatsApp Business</h4><span className="rounded-full bg-canvas px-3 py-1 text-xs">{loading?'Checking…':connection?.enabled?'Connected':configured?'Not connected':'Setup pending'}</span></div>
  <p className="mt-2 text-sm text-subtle">Connect a WhatsApp Business number using Meta's secure Embedded Signup. Messages will appear in your existing Inbox.</p>
  {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}
  {notice&&<p role="status" className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
  {connection?<div className="mt-5 space-y-3"><p className="font-semibold">{connection.display_name}</p><p className="text-sm text-subtle">{connection.phone_number||'Connected phone number'} · Phone ID {connection.external_account_id}</p><button type="button" disabled={busy} onClick={()=>void disconnect()} className="min-h-11 rounded-xl border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50">{busy?'Disconnecting…':'Disconnect WhatsApp'}</button></div>:
  <div className="mt-5 space-y-3"><button type="button" disabled={busy||loading||!configured} onClick={connect} className="min-h-11 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Connecting…':'Connect WhatsApp Business'}</button><p className="max-w-xl text-xs leading-5 text-subtle">You will sign in to Meta and select the Business Portfolio, WhatsApp Business Account and phone number. SupportFlow AI will only store the authorized account token encrypted on the server.</p></div>}
 </section>;
}
