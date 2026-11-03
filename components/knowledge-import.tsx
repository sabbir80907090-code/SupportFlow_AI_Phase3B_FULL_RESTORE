'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {splitKnowledge,MAX_KNOWLEDGE_TEXT,type KnowledgeDraft} from '@/lib/knowledge-import';
const field='w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm';
export function KnowledgeImport({businessId,onSaved}:{businessId:string;onSaved:()=>void}){
 const [url,setUrl]=useState(''),[crawl,setCrawl]=useState(false),[drafts,setDrafts]=useState<KnowledgeDraft[]>([]),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const controller=useRef<AbortController|null>(null),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
 async function website(){
  if(busy||saving)return;const sb=getSupabase();if(!sb)return;
  setBusy(true);setDrafts([]);setMessage('Reading website…');const control=new AbortController();controller.current=control;
  const collected:KnowledgeDraft[]=[];let failed=0,chars=0,limit=false,read=0;
  try{
   const {data}=await sb.auth.getSession();if(!data.session)throw Error('Sign in again.');
   const queue=[new URL(url).href],seen=new Set<string>();let origin='';
   while(queue.length&&seen.size<(crawl?20:1)&&!control.signal.aborted){
    const next=queue.shift()!;if(seen.has(next))continue;seen.add(next);
    try{
     const response=await fetch('/api/knowledge/import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({url:next}),signal:control.signal});
     const page=await response.json();if(!response.ok)throw Error(page.error??'Import failed');
     if(!origin)origin=new URL(page.source).origin;
     if(new URL(page.source).origin!==origin)throw Error('Page redirected outside this website');
     if(chars+page.text.length>MAX_KNOWLEDGE_TEXT){limit=true;break;}
     const parts=splitKnowledge(page.text,page.title,page.source);chars+=page.text.length;collected.push(...parts);read++;
     if(crawl)for(const link of page.links as string[])if(!seen.has(link)&&new URL(link).origin===origin&&!queue.includes(link)&&queue.length<100)queue.push(link);
    }catch(e){if(control.signal.aborted)break;failed++;if(!collected.length&&seen.size===1)throw e;}
    if(live.current)setMessage(`Read ${read} pages. ${failed} failed. Preparing review…`);
   }
   limit=limit||queue.length>0;
   if(live.current){setDrafts(collected);setMessage(`${read} pages read; ${failed} failed. ${collected.length} text sections ready to review.${limit?' Scan limit reached; more pages may remain.':''}${control.signal.aborted?' Scan stopped.':''} Nothing saved yet.`);}
  }catch(e){if(live.current)setMessage(e instanceof Error?e.message:'Import failed');}finally{if(live.current)setBusy(false);controller.current=null;}
 }
 async function fileImport(file:File){
  if(!/\.(txt|md|csv)$/i.test(file.name)){setMessage('Choose a TXT, Markdown or CSV file.');return;}
  if(file.size>1048576){setMessage('File must be under 1 MB.');return;}
  setBusy(true);setDrafts([]);
  try{const text=await file.text();const parts=splitKnowledge(text,file.name.replace(/\.[^.]+$/,''),file.name);if(live.current){setDrafts(parts);setMessage(`${parts.length} sections ready. Review before saving. CSV is imported as reference text, not product inventory.`);}}catch(e){if(live.current)setMessage(e instanceof Error?e.message:'Could not read file');}finally{if(live.current)setBusy(false);}
 }
 async function save(){
  const sb=getSupabase();if(!sb||busy||saving||!drafts.length)return;setSaving(true);
  try{
   // Compare only this tenant's existing content. One insert statement is atomic.
   const {data:existing,error:readError}=await sb.from('knowledge_articles').select('content').eq('business_id',businessId).limit(1000);
   if(readError)throw readError;
   const known=new Set((existing??[]).map(a=>a.content.trim()));
   const unique=drafts.filter(a=>{const c=a.content.trim();if(known.has(c))return false;known.add(c);return true;});
   if(unique.length){const {error}=await sb.from('knowledge_articles').insert(unique.map(a=>({...a,business_id:businessId})));if(error)throw error;}
   if(live.current){setDrafts([]);setMessage(`Saved ${unique.length} sections. Skipped ${drafts.length-unique.length} duplicate sections.`);onSaved();}
  }catch(e){if(live.current)setMessage(e instanceof Error?e.message:String(e));}finally{if(live.current)setSaving(false);}
 }
 return <section className="rounded-2xl border border-line bg-panel p-6 space-y-4"><h4 className="text-lg font-bold">Import business knowledge</h4><p className="text-sm text-subtle">Add website information or a document, review it, then save for AI answers. Manage prices and stock in Products.</p><label className="block text-sm">Website URL<input type="url" className={field} value={url} disabled={busy||saving} onChange={e=>setUrl(e.target.value)} placeholder="https://your-business.com"/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={crawl} disabled={busy||saving} onChange={e=>setCrawl(e.target.checked)}/>Also read linked pages (up to 20 pages / 120,000 characters)</label><div className="flex gap-3"><button type="button" disabled={busy||saving||!url.trim()} onClick={()=>void website()} className="rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">Read website</button>{busy&&<button type="button" onClick={()=>controller.current?.abort()}>Stop scan</button>}</div><label className="block text-sm">Or upload TXT, Markdown or CSV (1 MB; 120,000 characters)<input type="file" className={field} accept=".txt,.md,.csv" disabled={busy||saving} onChange={e=>{const file=e.target.files?.[0];if(file)void fileImport(file);e.target.value='';}}/></label><p className="text-xs text-subtle">Keep this page open while scanning. Imports are one-time snapshots. PDF and Google Drive sync are not supported here yet.</p>{message&&<p role="status" className="text-sm">{message}</p>}{!!drafts.length&&<><div className="max-h-96 overflow-y-auto space-y-3">{drafts.map((d,i)=><details key={i} className="rounded-xl border border-line p-3"><summary>{d.title}</summary><p className="text-xs text-subtle break-all">{d.source_filename}</p><textarea aria-label={'Review '+d.title} className={field} rows={5} maxLength={12000} disabled={saving} value={d.content} onChange={e=>setDrafts(a=>a.map((x,j)=>j===i?{...x,content:e.target.value}:x))}/><button type="button" disabled={saving} onClick={()=>setDrafts(a=>a.filter((_,j)=>j!==i))}>Remove section</button></details>)}</div><button type="button" disabled={busy||saving||drafts.some(d=>!d.content.trim())} onClick={()=>void save()} className="rounded-xl bg-brand px-4 py-3 text-white disabled:opacity-50">{saving?'Saving…':`Save ${drafts.length} sections to knowledge`}</button></>}</section>;
}
