'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
type Connection={id:string;display_name:string;external_account_id:string;enabled:boolean};
type Page={id:string;name:string};
export function MessengerChannel(){
 const [connection,setConnection]=useState<Connection|null>(null),[pages,setPages]=useState<Page[]>([]),[page,setPage]=useState('');
 const [configured,setConfigured]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
 async function request(path:string,method='GET',body?:object){
  const sb=getSupabase();if(!sb)throw Error('Sign in required');const {data}=await sb.auth.getSession();if(!data.session)throw Error('Sign in required');
  const response=await fetch('/api/channels/messenger/'+path,{method,headers:{authorization:'Bearer '+data.session.access_token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Facebook connection failed');return result;
 }
 async function refresh(){try{const data=await request('connect');setConfigured(data.configured);setConnection(data.connection);setPages(data.pages||[]);setPage(data.pages?.[0]?.id||'');}catch(e){setError(e instanceof Error?e.message:'Could not load Messenger');}finally{setLoading(false);}}
 useEffect(()=>{
  void refresh();
  const status=new URLSearchParams(window.location.search).get('messenger');
  const messages:Record<string,string>={
   error:'Facebook login was cancelled or failed. Please try again.',
   canonical:'You are now on the correct site for Facebook login. Sign in here, then select Continue with Facebook.',
   cookies:'Your browser did not save the login cookie. Allow cookies for this site, then select Continue with Facebook.',
   'session-missing':'The Facebook login session is missing or expired. Keep this browser open and select Continue with Facebook to start a new session.',
   'state-mismatch':'A different Facebook login was started in this browser. Close the older login tab and start once from here.',
   expired:'Facebook login expired or was already used. Select Continue with Facebook to start again.'
  };
  if(status&&messages[status])setError(messages[status]);
 },[]);
 async function act(action:'login'|'connect'|'disconnect'){
  setBusy(true);setError('');try{
   if(action==='login'){const data=await request('oauth','POST');window.location.assign(data.url);return;}
   await request('connect',action==='disconnect'?'DELETE':'POST',action==='connect'?{pageId:page}:undefined);setConfirm(false);await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Facebook request failed');}finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-line bg-panel p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-xl font-bold">Facebook Messenger</h4><span className="rounded-full bg-canvas px-3 py-1 text-xs">{loading?'Checking…':connection?.enabled?'Connected':connection?'Disabled':configured?'Ready to connect':'Setup pending'}</span></div>
  <p className="mt-2 text-sm text-subtle">Connect your Facebook Page to receive conversations and send AI or team replies from one inbox.</p>
  {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}
  {!loading&&!configured&&<p className="mt-4 rounded-xl border border-line bg-canvas p-4 text-sm text-subtle">Facebook connection is not available yet. The platform administrator needs to finish Meta setup. Your Telegram connection continues to work.</p>}
  {connection?<div className="mt-5 space-y-3"><p className="font-semibold">{connection.display_name}</p><p className="text-sm text-subtle">Page ID: {connection.external_account_id}</p><button disabled={busy} onClick={()=>setConfirm(true)} className="rounded-xl border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50">Disconnect Page</button></div>:configured&&<div className="mt-5 max-w-lg space-y-3">
   {pages.length>0?<><label className="block text-sm font-semibold">Choose your Facebook Page<select value={page} onChange={e=>setPage(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3">{pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy||!page} onClick={()=>void act('connect')} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Connecting…':'Connect selected Page'}</button></>:<button disabled={busy||loading} onClick={()=>void act('login')} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Opening Facebook…':'Continue with Facebook'}</button>}
   <p className="text-xs leading-5 text-subtle">One Page per business. Facebook asks you to grant Page and messaging permissions. No access token needs to be pasted here.</p>
   {pages.length>0&&<button disabled={busy} onClick={()=>void act('login')} className="text-sm text-brand underline">Choose a different Facebook account</button>}
  </div>}
  <p className="mt-5 text-xs leading-5 text-subtle">Text conversations are supported. Standard replies must be sent within 24 hours of the customer's latest message.</p>
  {confirm&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="disconnect-messenger" className="w-full max-w-md rounded-2xl border border-line bg-panel p-6"><h3 id="disconnect-messenger" className="text-xl font-bold">Disconnect Facebook Page?</h3><p className="mt-3 text-sm text-subtle">New messages and replies for {connection?.display_name} will stop. Existing inbox history will remain.</p><div className="mt-6 flex justify-end gap-3"><button disabled={busy} onClick={()=>setConfirm(false)} className="rounded-xl border border-line px-4 py-2">Cancel</button><button disabled={busy} onClick={()=>void act('disconnect')} className="rounded-xl bg-rose-600 px-4 py-2 text-white">{busy?'Disconnecting…':'Disconnect'}</button></div></div></div>}
 </section>;
}
