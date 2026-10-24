'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
type Connection={id:string;display_name:string;external_account_id:string;enabled:boolean};
const other=[
 {name:'Facebook Messenger',description:'Planned Facebook Page conversations in your inbox.'},
 {name:'WhatsApp',description:'Planned WhatsApp Business conversations.'},
 {name:'Website chat',description:'Planned embeddable visitor chat widget.'}
];
export function Channels(){
 const [token,setToken]=useState(''),[connection,setConnection]=useState<Connection|null>(null),[showDeleteDialog,setShowDeleteDialog]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function request(method:'GET'|'POST'|'DELETE',payload?:object){
  const sb=getSupabase();if(!sb)throw Error('Sign in required');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw Error('Please sign in again');
  const response=await fetch('/api/channels/telegram/connect',{method,headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw Error(result.error??'Telegram connection failed');
  return result as {connection?:Connection|null;ok?:boolean};
 }
 async function refresh(){setLoading(true);try{const result=await request('GET');setConnection(result.connection??null);}catch(e){setError(e instanceof Error?e.message:'Unable to load');}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 async function connect(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');
  try{const result=await request('POST',{token:token.trim()});setConnection(result.connection??null);setToken('');setNotice('Telegram bot connected.');}
  catch(e){setError(e instanceof Error?e.message:'Connection failed');}
  finally{setBusy(false);}
 }
 async function disconnect(){setBusy(true);setError('');setNotice('');
  try{await request('DELETE');setConnection(null);setShowDeleteDialog(false);setNotice('Telegram bot connection deleted. You can connect a new bot now.');}
  catch(e){setError(e instanceof Error?e.message:'Disconnect failed');}
  finally{setBusy(false);}
 }
 return <div className="space-y-5">
  {showDeleteDialog&&connection&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShowDeleteDialog(false);}}>
   <div role="alertdialog" aria-modal="true" aria-labelledby="delete-telegram-title" aria-describedby="delete-telegram-description" className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"/></svg></div>
    <h3 id="delete-telegram-title" className="text-xl font-bold text-ink">Delete Telegram connection?</h3>
    <p id="delete-telegram-description" className="mt-2 text-sm leading-6 text-subtle">You are about to disconnect <strong className="text-ink">{connection.display_name}</strong> from SupportFlow AI. Its webhook and saved credentials will be removed. The Telegram bot itself will remain available in BotFather.</p>
    <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-subtle">New messages from this bot will no longer reach this workspace until you reconnect it.</div>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
     <button type="button" disabled={busy} onClick={()=>setShowDeleteDialog(false)} className="rounded-xl border border-line px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50">Cancel</button>
     <button type="button" disabled={busy} onClick={disconnect} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{busy?'Deleting…':'Yes, delete connection'}</button>
    </div>
   </div>
  </div>}
  <p className="text-sm text-subtle">Connect a Telegram bot to your business without editing server settings. Other channels are coming later.</p>
  <section className="rounded-2xl border border-line bg-panel p-6">
   <div className="flex items-center justify-between gap-3"><h4 className="text-xl font-bold">Telegram</h4><span className="rounded-full bg-canvas px-3 py-1 text-xs">{loading?'Checking…':connection?.enabled?'Connected':'Not connected'}</span></div>
   <p className="mt-2 text-sm text-subtle">Create a bot using Telegram @BotFather, then paste its token here. Your business is selected automatically.</p>
   {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600">{error}</p>}
   {notice&&<p role="status" className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</p>}
   {connection?<div className="mt-5 space-y-3"><p className="font-semibold">{connection.display_name}</p><p className="text-sm text-subtle">Bot ID: {connection.external_account_id}</p><button disabled={busy} onClick={()=>setShowDeleteDialog(true)} className="rounded-xl border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50">{busy?'Deleting…':'Delete bot connection'}</button></div>:
   <form onSubmit={connect} className="mt-5 max-w-lg space-y-3">
    <label className="block text-sm font-semibold">BotFather token<input type="password" autoComplete="off" spellCheck={false} required value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste your Telegram bot token" className="mt-2 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm"/></label>
    <button disabled={busy||loading||!token.trim()} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Verifying…':'Verify & Connect Bot'}</button>
   </form>}
  </section>
  <div className="grid gap-5 md:grid-cols-2">{other.map(c=><div key={c.name} className="rounded-2xl border border-line bg-panel p-6"><span className="rounded-full bg-canvas px-3 py-1 text-xs text-subtle">Not implemented</span><h4 className="mt-4 text-xl font-bold">{c.name}</h4><p className="mt-3 text-sm text-subtle">{c.description}</p></div>)}</div>
 </div>;
}
