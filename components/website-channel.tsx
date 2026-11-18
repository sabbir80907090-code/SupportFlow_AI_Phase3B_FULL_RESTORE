'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {Globe,ChevronDown} from 'lucide-react';
type Site={id:string;origin:string;enabled:boolean};
export function WebsiteChannel({businessId}:{businessId:string}){
 const [site,setSite]=useState<Site|null>(null),[origin,setOrigin]=useState(''),[appOrigin,setAppOrigin]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function request(method='GET'){
  const sb=getSupabase();const session=await sb?.auth.getSession();if(!session?.data.session)throw Error('Sign in required');
  const r=await fetch('/api/channels/website/connect',{method,headers:{'x-business-id':businessId,authorization:'Bearer '+session.data.session.access_token,'content-type':'application/json'},body:method==='POST'?JSON.stringify({origin:origin.trim()}):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Website setup failed');setSite(data.site);setOrigin(data.site?.origin||'');setAppOrigin(data.appOrigin||window.location.origin);
 }
 useEffect(()=>{request().catch(e=>setError(e.message)).finally(()=>setLoaded(true))},[]);
 async function save(method:string){setBusy(true);setError('');setNotice('');try{await request(method);setNotice(method==='DELETE'?'Website chat disabled.':'Website chat enabled. Copy the code below to your website.')}catch(e){setError(e instanceof Error?e.message:'Could not update chat')}finally{setBusy(false)}}
 const embed=site?'<script async src="'+appOrigin+'/widget/loader.js" data-site="'+site.id+'"></script>':'';
 return <details className="group rounded-2xl border border-line bg-panel shadow-soft">
  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
   <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><Globe size={22}/></span>
   <span className="min-w-0 flex-1"><span className="block font-bold text-ink">Website Chat</span><span className="mt-1 block truncate text-sm text-subtle">{site?.origin??'Add live chat to your business website'}</span></span>
   <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${site?.enabled?'bg-emerald-500/10 text-emerald-600':'bg-canvas text-subtle'}`}>{!loaded?'Checking…':site?.enabled?'Enabled':'Not connected'}</span>
   <ChevronDown size={18} className="hidden shrink-0 text-subtle transition-transform group-open:rotate-180 sm:block"/>
  </summary>
  <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5"><p className="text-sm text-subtle">Enter your website address to enable chat. Customer messages will appear in your Inbox.</p>
  <form className="mt-4 max-w-xl space-y-3" onSubmit={e=>{e.preventDefault();void save('POST')}}><label className="block text-sm">Website origin<input type="url" required placeholder="https://example.com" value={origin} onChange={e=>setOrigin(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3"/></label><p className="text-xs text-subtle">Use the exact HTTPS origin, including www if your website uses it. One website per workspace.</p><button disabled={busy||!loaded} className="rounded-xl bg-brand px-4 py-3 text-white disabled:opacity-50">{busy?'Saving…':site?.enabled?'Save website':'Enable website chat'}</button></form>{error&&<p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-subtle">{notice}</p>}{site?.enabled&&<div className="mt-4 space-y-3"><label className="block text-sm">Paste before your website’s closing &lt;/body&gt; tag<textarea aria-label="Widget embed code" readOnly rows={3} value={embed} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3 font-mono text-xs"/></label><div className="flex flex-wrap gap-4"><button onClick={()=>navigator.clipboard.writeText(embed).then(()=>setNotice('Embed code copied.')).catch(()=>setError('Copy the code from the box above.'))} className="text-brand underline">Copy code</button><a href={appOrigin+'/widget?site='+site.id} target="_blank" rel="noreferrer" className="text-brand underline">Test chat</a><button disabled={busy} onClick={()=>{if(window.confirm('Disable website chat? Existing conversations will stay in your Inbox.'))void save('DELETE')}} className="text-rose-500 underline">Disable chat</button></div><p className="text-xs text-subtle">Text chat only. Visitor sessions last 7 days. Includes limits of 6 messages per visitor per minute and 500 combined new sessions/messages per website per day. Visitors should avoid sharing sensitive information.</p></div>}</div></details>
}

