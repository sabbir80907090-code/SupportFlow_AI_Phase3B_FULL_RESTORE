'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {AiModelPicker} from '@/components/ai-model-picker';
type Provider='gemini'|'openai'|'anthropic';
type Key={id:string;label:string;provider:Provider;model:string;key_hint:string;priority:number;enabled:boolean};
const models:Record<Provider,string[]>={gemini:['gemini-flash-lite-latest','gemini-flash-latest','gemini-pro-latest'],openai:['gpt-4.1-mini','gpt-4.1','gpt-4o-mini'],anthropic:['claude-sonnet-4-5','claude-haiku-4-5','claude-opus-4-1']};
const names:Record<Provider,string>={gemini:'Google Gemini',openai:'OpenAI',anthropic:'Anthropic Claude'};
export function GeminiKeyManager({businessId,canEdit}:{businessId:string;canEdit:boolean}){
 const [keys,setKeys]=useState<Key[]>([]),[adding,setAdding]=useState(false),[label,setLabel]=useState('Primary AI Key'),[secret,setSecret]=useState(''),[provider,setProvider]=useState<Provider>('gemini'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [modelDraft,setModelDraft]=useState<Record<string,string>>({});
 const [available,setAvailable]=useState<Record<string,string[]>>({});
 const [modelLoading,setModelLoading]=useState<Record<string,boolean>>({});
 const [modelErrors,setModelErrors]=useState<Record<string,string>>({});
 async function request(method:string,body?:object){const db=getSupabase();if(!db)throw Error('Sign in required');const {data}=await db.auth.getSession();if(!data.session)throw Error('Sign in required');const res=await fetch('/api/ai/keys',{method,headers:{'x-business-id':businessId,authorization:'Bearer '+data.session.access_token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});const json=await res.json();if(!res.ok)throw Error(json.error??'Request failed');return json;}
 async function discover(id:string,refresh=false){
  setModelLoading(v=>({...v,[id]:true}));setModelErrors(v=>({...v,[id]:''}));
  try{
   const db=getSupabase();if(!db)throw Error('Sign in required');
   const {data}=await db.auth.getSession();if(!data.session)throw Error('Sign in required');
   const response=await fetch('/api/ai/keys/models',{method:'POST',headers:{'x-business-id':businessId,authorization:'Bearer '+data.session.access_token,'content-type':'application/json'},body:JSON.stringify({id,refresh}),cache:'no-store'});
   const json=await response.json();if(!response.ok)throw Error(json.error??'Model discovery failed');
   setAvailable(v=>({...v,[id]:json.models as string[]}));
  }catch(e){setModelErrors(v=>({...v,[id]:e instanceof Error?e.message:'Unable to load models'}))}
  finally{setModelLoading(v=>({...v,[id]:false}))}
 }
 async function load(){const result=await request('GET');setKeys(result.keys);setModelDraft(Object.fromEntries((result.keys as Key[]).map(k=>[k.id,k.model])))}
 useEffect(()=>{setAvailable({});setModelErrors({});void load().then(()=>{}).catch(e=>setError(e.message))},[businessId]);
 useEffect(()=>{if(!canEdit)return;for(const k of keys){if(!available[k.id]&&!modelLoading[k.id]&&!modelErrors[k.id])void discover(k.id)}},[keys,canEdit,available,modelLoading,modelErrors]);
 async function act(method:string,body:object){setBusy(true);setError('');setNotice('');try{await request(method,body);if(method==='POST'){setSecret('');setAdding(false)}await load();setNotice(method==='POST'?'API key verified and saved.':method==='DELETE'?'API key deleted.':'Settings saved.')}catch(e){setError(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 const field='w-full rounded-xl border border-line bg-canvas p-3';
 return <div className="space-y-5">
 <section className="rounded-2xl border border-line bg-panel p-6 shadow-soft space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">API Key Management</h3><p className="text-sm text-subtle">Up to 10 encrypted business-owned keys. Each provider can have multiple keys.</p></div>{canEdit&&<button className="rounded-xl bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy||keys.length>=10} onClick={()=>setAdding(v=>!v)}>{adding?'Cancel':'+ Add API Key'}</button>}</div>
 {keys.map(k=><div key={k.id} className="rounded-xl border border-line p-4 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{k.label}</p><p className="text-xs text-subtle">{names[k.provider]} · ••••{k.key_hint} · Priority {k.priority} · {k.enabled?'Enabled':'Disabled'}</p></div>{canEdit&&<div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>void act('PATCH',{id:k.id,enabled:!k.enabled})}>{k.enabled?'Disable':'Enable'}</button><button disabled={busy||k.priority<=1} className="rounded-lg border border-line px-3 py-2 text-sm" onClick={()=>void act('PATCH',{id:k.id,priority:Math.max(1,k.priority-1)})}>↑ Priority</button><button disabled={busy} className="rounded-lg border border-rose-500 px-3 py-2 text-sm text-rose-500" onClick={()=>{if(window.confirm('Permanently delete this API key?'))void act('DELETE',{id:k.id})}}>Delete</button></div>}</div></div>)}
 {!keys.length&&<p className="text-sm text-subtle">No API keys yet. Select + Add API Key to connect a provider.</p>}
 {adding&&canEdit&&<form className="grid gap-3 rounded-xl border border-line p-4" onSubmit={e=>{e.preventDefault();void act('POST',{label,provider,apiKey:secret,priority:keys.length?Math.min(9999,Math.max(...keys.map(k=>k.priority))+1):1})}}><label className="text-sm font-semibold">AI Provider<select className={field} value={provider} onChange={e=>setProvider(e.target.value as Provider)}>{(Object.keys(names) as Provider[]).map(p=><option key={p} value={p}>{names[p]}</option>)}</select></label><label className="text-sm font-semibold">Key name<input className={field} maxLength={80} required value={label} onChange={e=>setLabel(e.target.value)}/></label><label className="text-sm font-semibold">API Key<input className={field} type="password" autoComplete="off" required value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Paste provider API key"/></label><button className="rounded-xl bg-brand p-3 font-semibold text-white disabled:opacity-50" disabled={busy||!secret.trim()}>{busy?'Verifying…':'Verify & Save Key'}</button></form>}</section>
 <section className="rounded-2xl border border-line bg-panel p-6 shadow-soft space-y-4"><h3 className="text-xl font-bold">AI Model Management</h3><p className="text-sm text-subtle">Choose a model for each connected key. Search suggested text models or use a custom ID. Changes apply only after Save Model.</p>
 {keys.map(k=>{const found=available[k.id]??[];const selected=modelDraft[k.id]??k.model;return <div key={k.id} className="grid gap-3 rounded-xl border border-line p-4">
 <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{k.label}</p><p className="text-xs text-subtle">{names[k.provider]}</p></div>
 {canEdit&&<button type="button" disabled={busy||modelLoading[k.id]} className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs disabled:opacity-50" onClick={()=>void discover(k.id,true)}>{modelLoading[k.id]?'Finding models…':'↻ Refresh'}</button>}</div>
 <AiModelPicker provider={names[k.provider]} label={k.label} models={found} value={selected} disabled={!canEdit||busy} loading={modelLoading[k.id]} onChange={value=>setModelDraft(d=>({...d,[k.id]:value}))}/>
 <div className="flex flex-wrap items-center justify-between gap-2">
 <p className="text-xs text-subtle">{modelLoading[k.id]?'Loading available models…':found.length?found.length+' text models available':'Custom model entry available'}</p>
 <button type="button" disabled={!canEdit||busy||!selected||selected===k.model} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void act('PATCH',{id:k.id,model:selected})}>{busy?'Saving…':'Save Model'}</button></div>
 {modelErrors[k.id]&&<p role="alert" className="text-xs text-amber-500">{modelErrors[k.id]} · You can still enter a custom model ID.</p>}
 </div>})}
 {!keys.length&&<p className="text-sm text-subtle">Add an API key above to configure its model.</p>}</section>
 {error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}{notice&&<p role="status" className="text-sm text-subtle">{notice}</p>}
 </div>;
}

