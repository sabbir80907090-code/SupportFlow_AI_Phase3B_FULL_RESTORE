'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
export function SupportAiSettings({businessId,canEdit}:{businessId:string;canEdit:boolean}){
 const [prompt,setPrompt]=useState(''),[savedPrompt,setSavedPrompt]=useState(''),[promptSaving,setPromptSaving]=useState(false),[enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');getSupabase()?.from('support_ai_settings') .select('enabled,system_prompt').eq('business_id',businessId).maybeSingle().then(({data,error})=>{if(!live)return;setLoading(false);if(error)setError(error.message);else {setEnabled(Boolean(data?.enabled));setPrompt(data?.system_prompt??'');setSavedPrompt(data?.system_prompt??'');}});return()=>{live=false}},[businessId]);
 async function save(){const db=getSupabase();if(!db||saving||!canEdit)return;setSaving(true);setError('');setNotice('');const next=!enabled;const {error}=await db.from('support_ai_settings').upsert({business_id:businessId,enabled:next,updated_at:new Date().toISOString()},{onConflict:'business_id'});if(error)setError(error.message);else{setEnabled(next);setNotice(next?'AI preference saved. Automatic replies require the server workers to be enabled.':'AI Auto Reply disabled for this business.');}setSaving(false);}
 async function savePrompt(){const db=getSupabase();if(!db||!canEdit||promptSaving||prompt.length>8000)return;setPromptSaving(true);setError('');setNotice('');const {error}=await db.from('support_ai_settings').upsert({business_id:businessId,system_prompt:prompt.trim(),updated_at:new Date().toISOString()},{onConflict:'business_id'});if(error)setError(error.message);else{setSavedPrompt(prompt.trim());setNotice('AI System Prompt saved for this business.');}setPromptSaving(false);}
 return <div className="space-y-4">
 <section className="rounded-2xl border border-line bg-panel p-4 shadow-soft sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-ink">Automatic replies</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled?'bg-emerald-500/10 text-emerald-600':'bg-slate-500/10 text-subtle'}`}>{loading?'Checking…':enabled?'Enabled':'Disabled'}</span></div>
    <p className="mt-1 text-sm text-subtle">Let AI answer customer messages using your business knowledge.</p>
   </div>
   <button type="button" role="switch" aria-label="Automatic AI replies" aria-checked={enabled} disabled={!canEdit||loading||saving} onClick={save} className={`min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${enabled?'bg-emerald-600':'bg-slate-600'}`}>{loading?'Loading…':saving?'Saving…':enabled?'Turn off':'Turn on'}</button>
  </div>
  <p className="mt-3 text-xs text-subtle">AI replies also need an active server worker. You can pause AI for individual chats in Inbox.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-500">{error}</p>}
  {notice&&<p role="status" className="mt-3 text-sm text-subtle">{notice}</p>}
 </section>
 <details className="group rounded-2xl border border-line bg-panel p-4 shadow-soft sm:p-5">
  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
   <span className="min-w-0"><span className="block text-base font-bold text-ink">Business instructions</span><span className="mt-1 block text-sm text-subtle">Optional: customize the AI's tone, language and reply style.</span></span>
   <span aria-hidden="true" className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-subtle group-open:hidden">Edit</span>
   <span aria-hidden="true" className="hidden shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-subtle group-open:inline">Close</span>
  </summary>
  <div className="mt-5 border-t border-line pt-4">
   <p className="text-sm text-subtle">The AI will still follow your product and knowledge safety rules. Leave this empty to use the default instructions.</p>
   <label htmlFor="business-ai-prompt" className="mt-4 block text-sm font-semibold text-ink">Instructions for your AI assistant</label>
   <textarea id="business-ai-prompt" rows={6} maxLength={8000} disabled={!canEdit||loading||promptSaving} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Example: Reply in the customer's language. Keep replies friendly and short. Ask a human for help when unsure." className="mt-2 w-full resize-y rounded-xl border border-line bg-canvas p-3 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"/>
   <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
    <span className="text-xs text-subtle">{prompt.length}/8000 characters</span>
    <div className="flex flex-wrap gap-2">
     <button type="button" disabled={!canEdit||loading||promptSaving||!prompt} onClick={()=>setPrompt('')} className="min-h-11 rounded-xl border border-line px-4 text-sm text-ink disabled:opacity-50">Clear</button>
     <button type="button" disabled={!canEdit||loading||promptSaving||prompt.trim()===savedPrompt} onClick={savePrompt} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{promptSaving?'Saving…':'Save instructions'}</button>
    </div>
   </div>
  </div>
 </details>
 </div>;
}
