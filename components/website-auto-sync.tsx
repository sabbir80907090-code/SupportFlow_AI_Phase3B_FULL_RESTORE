'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
type Connection={id:string;website_url:string;status:string;frequency_minutes:number;next_sync_at:string;last_sync_at:string|null;last_status:string|null;last_error:string|null;pages_discovered:number;pages_processed:number;products_synced:number};
type Run={id:string;status:string;pages_processed:number;products_created:number;products_updated:number;started_at:string;error:string|null};
const input='w-full rounded-xl border border-line bg-canvas px-3 py-3 text-sm';
export function WebsiteAutoSync({businessId,role}:{businessId:string;role:string}){
 const [rows,setRows]=useState<Connection[]>([]),[runs,setRuns]=useState<Run[]>([]),[url,setUrl]=useState(''),[frequency,setFrequency]=useState('360'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const allowed=role==='owner'||role==='admin';
 const token=async()=>{const {data}=await getSupabase()!.auth.getSession();if(!data.session)throw Error('Sign in again');return data.session.access_token};
 const load=useCallback(async()=>{if(!allowed)return;try{const t=await token();const r=await fetch('/api/products/website-sync?businessId='+encodeURIComponent(businessId),{headers:{authorization:'Bearer '+t},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.connections??[]);setRuns(d.runs??[]);}catch(e){setError(e instanceof Error?e.message:'Could not load sync settings')}},[allowed,businessId]);
 useEffect(()=>{void load()},[load]);
 async function action(body:Record<string,unknown>){setBusy(true);setError('');setNotice('');try{const t=await token();const r=await fetch('/api/products/website-sync',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({...body,businessId})});const d=await r.json();if(!r.ok)throw Error(d.error);setNotice('Website connected. Initial catalogue sync is queued.');setUrl('');await load();}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}}
 async function control(connectionId:string,operation:string,frequencyMinutes?:number){setBusy(true);setError('');try{const t=await token();const r=await fetch('/api/products/website-sync',{method:'PATCH',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({businessId,connectionId,action:operation,frequencyMinutes})});const d=await r.json();if(!r.ok)throw Error(d.error);setNotice(operation==='disconnect'?'Website disconnected. Existing products were kept.':operation==='pause'?'Automatic sync paused.':operation==='sync-now'?'Manual sync finished or queued. Check sync history for details.':'Website sync settings updated.');await load();}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}}
 if(!allowed)return null;
 return <section className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
  <div><h5 className="font-bold">Website Connect & Auto Sync</h5><p className="mt-1 text-sm text-subtle">Connect a public store once. Product changes are checked automatically. Existing products are never deleted when a scan is incomplete.</p></div>
  <form className="grid gap-2 sm:grid-cols-[1fr_180px_auto]" onSubmit={e=>{e.preventDefault();void action({url,frequencyMinutes:Number(frequency)});}}>
   <input className={input} type="url" required placeholder="https://your-store.com" value={url} onChange={e=>setUrl(e.target.value)} disabled={busy}/>
   <select className={input} value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="60">Every hour</option><option value="360">Every 6 hours</option><option value="720">Every 12 hours</option><option value="1440">Daily</option></select>
   <button disabled={busy||!url.trim()} className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Connect website</button>
  </form>
  {rows.length===0&&<p className="text-sm text-subtle">No connected websites yet.</p>}
  {rows.map(row=><article key={row.id} className="space-y-3 rounded-xl border border-line p-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all text-sm">{row.website_url}</strong><span className="rounded-full bg-canvas px-2 py-1 text-xs">{row.status}</span></div>
   <div className="grid grid-cols-2 gap-2 text-xs text-subtle sm:grid-cols-3"><span>Last sync: {row.last_sync_at?new Date(row.last_sync_at).toLocaleString():'Not yet'}</span><span>Pages: {row.pages_processed}/{row.pages_discovered}</span><span>Products changed: {row.products_synced}</span></div>
   {row.last_error&&<p className="text-xs text-amber-600">{row.last_error}</p>}
   <div className="flex flex-wrap gap-2">
    <button disabled={busy} onClick={()=>void control(row.id,row.status==='paused'?'resume':'pause')} className="rounded-lg border border-line px-3 py-2 text-xs">{row.status==='paused'?'Resume':'Pause'}</button>
    <select aria-label="Sync frequency" disabled={busy} value={String(row.frequency_minutes)} onChange={e=>void control(row.id,'frequency',Number(e.target.value))} className="rounded-lg border border-line bg-canvas px-2 py-2 text-xs"><option value="60">Hourly</option><option value="360">Every 6 hours</option><option value="720">Every 12 hours</option><option value="1440">Daily</option></select>
    <button disabled={busy} onClick={()=>void control(row.id,'sync-now')} className="rounded-lg border border-line px-3 py-2 text-xs">Sync now</button>
    <button disabled={busy} onClick={()=>{if(confirm('Disconnect website? Existing products will be kept.'))void control(row.id,'disconnect')}} className="rounded-lg border border-line px-3 py-2 text-xs text-rose-500">Disconnect</button>
   </div>
  </article>)}
  {runs.length>0&&<details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Sync history ({runs.length})</summary><div className="mt-3 space-y-2">{runs.map(run=><div key={run.id} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2 text-xs"><span>{new Date(run.started_at).toLocaleString()} · {run.status}</span><span>Pages {run.pages_processed} · +{run.products_created} / ~{run.products_updated}</span>{run.error&&<span className="w-full text-amber-600">{run.error}</span>}</div>)}</div></details>}
  {notice&&<p role="status" className="text-sm text-emerald-600">{notice}</p>}{error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}
  <p className="text-xs text-subtle">Initial scans run in batches of 10 pages and continue automatically. Public HTML and sitemaps are supported. CAPTCHA, login-only and bot-protected pages are not bypassed. Disconnecting never deletes your catalogue.</p>
 </section>;
}
