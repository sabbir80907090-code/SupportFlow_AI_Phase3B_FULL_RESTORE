'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Search,X} from 'lucide-react';

type Props={
 provider:string;
 label:string;
 models:string[];
 value:string;
 disabled?:boolean;
 loading?:boolean;
 onChange:(value:string)=>void;
};

const readable=(id:string)=>id.replace(/^models\//,'').split('-').map(part=>
 /^(gemini|gpt|claude|flash|lite|pro|mini|sonnet|haiku|opus|preview)$/i.test(part)
 ?part.charAt(0).toUpperCase()+part.slice(1):part).join(' ');

/** Custom dialog avoids Android's fullscreen native <select> with hundreds of unrelated models. */
export function AiModelPicker({provider,label,models,value,disabled,loading,onChange}:Props){
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [showAll,setShowAll]=useState(false);
 const [custom,setCustom]=useState(false);
 const [customId,setCustomId]=useState('');
 const searchRef=useRef<HTMLInputElement>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus()}};
  document.addEventListener('keydown',onKey);
  searchRef.current?.focus();
  return()=>document.removeEventListener('keydown',onKey);
 },[open,custom]);
 const unique=[...new Set(models)];
 const results=unique.filter(id=>id.toLowerCase().includes(query.trim().toLowerCase()));
 const shown=query.trim()||showAll?results:results.slice(0,6);
 const customValid=customId.trim().length>=2&&customId.trim().length<=100&&/^[a-zA-Z0-9._:-]+$/.test(customId.trim());
 function choose(id:string){onChange(id);setOpen(false);setCustom(false);triggerRef.current?.focus()}
 function close(){setOpen(false);setCustom(false);triggerRef.current?.focus()}
 return <>
  <button ref={triggerRef} type="button" disabled={disabled} aria-label={'Choose model for '+label}
   aria-haspopup="dialog" aria-expanded={open}
   onClick={()=>{setQuery('');setShowAll(false);setCustom(false);setOpen(true)}}
   className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-left text-ink transition hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60">
   <span className="min-w-0 flex-1"><span className="block text-xs text-subtle">Selected AI model</span>
    <span className="mt-1 block break-all text-sm font-semibold">{value||'Choose a model'}</span></span>
   <ChevronDown size={19} className="shrink-0 text-subtle"/>
  </button>
  {open&&<div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5" role="presentation">
   <button type="button" tabIndex={-1} aria-label="Close model picker" className="absolute inset-0 bg-black/65" onClick={close}/>
   <div role="dialog" aria-modal="true" aria-label={'Choose '+provider+' model'} className="relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-panel text-ink shadow-2xl sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl">
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
     <div className="min-w-0"><h4 className="text-lg font-bold">Choose AI Model</h4><p className="mt-1 text-xs text-subtle">{provider} · {unique.length} available models</p></div>
     <button type="button" aria-label="Close" onClick={close} className="rounded-lg border border-line p-2"><X size={18}/></button>
    </div>
    {!custom?<div className="flex min-h-0 flex-1 flex-col">
     <div className="px-4 pt-4 sm:px-5"><label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-brand"><Search size={18} className="shrink-0 text-subtle"/>
      <input ref={searchRef} type="search" aria-label="Search models" placeholder="Search model name…" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/>
     </label></div>
     <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 sm:px-5">
      {!query&&unique.length>0&&<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{showAll?'Available models':'Suggested models'}</p>}
      <div className="space-y-2">{shown.map((id,index)=><button key={id} type="button" onClick={()=>choose(id)}
       aria-pressed={id===value}
       className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${id===value?'border-brand bg-brand/10':'border-line bg-canvas hover:border-brand'}`}>
       <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{readable(id)}</span>
        <span className="mt-1 block break-all text-xs text-subtle">{id}</span>
        {!query&&index===0&&<span className="mt-1 inline-block text-xs font-medium text-emerald-500">Suggested</span>}</span>
       <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${id===value?'border-brand bg-brand text-white':'border-line'}`}>{id===value&&<Check size={14}/>}</span>
      </button>)}</div>
      {!shown.length&&<p className="py-8 text-center text-sm text-subtle">{loading?'Loading models…':'No matching models. Try another search or enter a custom ID.'}</p>}
      {!query&&!showAll&&results.length>shown.length&&<button type="button" className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold" onClick={()=>setShowAll(true)}>Show all {results.length} models</button>}
     </div>
     <div className="border-t border-line px-4 py-3 sm:px-5"><button type="button" onClick={()=>{setCustomId(value);setCustom(true)}} className="w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold">Enter Custom Model ID</button></div>
    </div>:<form className="space-y-4 p-4 sm:p-5" onSubmit={e=>{e.preventDefault();if(customValid)choose(customId.trim())}}>
     <p className="text-sm text-subtle">Use this only if your provider supports the model. A custom ID is not automatically verified.</p>
     <label className="block text-sm font-semibold">Model ID<input ref={searchRef} autoComplete="off" maxLength={100} value={customId} onChange={e=>setCustomId(e.target.value)} placeholder="e.g. gemini-flash-lite-latest" className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-3 text-sm outline-none focus:border-brand"/></label>
     <div className="flex gap-2"><button type="button" onClick={()=>setCustom(false)} className="flex-1 rounded-xl border border-line p-3 text-sm">Back</button><button type="submit" disabled={!customValid} className="flex-1 rounded-xl bg-brand p-3 text-sm font-semibold text-white disabled:opacity-50">Use this model</button></div>
    </form>}
   </div>
  </div>}
 </>;
}
