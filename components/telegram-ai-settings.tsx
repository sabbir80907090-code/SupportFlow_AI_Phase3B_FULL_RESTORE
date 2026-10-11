'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
const sb=getSupabase();
export function TelegramAISettings({businessId,role}:{businessId:string;role:string}) {
  const [enabled,setEnabled]=useState(false),[prompt,setPrompt]=useState('');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    if(!sb||!businessId)return;
    const {data,error:e}=await sb.from('telegram_ai_settings').select('auto_reply_enabled,system_prompt').eq('business_id',businessId).maybeSingle();
    if(e)throw e;
    setEnabled(data?.auto_reply_enabled??false);setPrompt(data?.system_prompt??'');
  },[businessId]);
  useEffect(()=>{setLoading(true);setError('');load().catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false));},[load]);
  const save=async()=>{
    if(!sb||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error('Sign in again.');
      const res=await fetch('/api/telegram/ai/settings',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({businessId,enabled,systemPrompt:prompt})});
      const json=await res.json() as {error?:string};if(!res.ok)throw new Error(json.error??'Save failed');
      setNotice(enabled?'Gemini auto-reply enabled.':'Gemini auto-reply disabled.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  };
  const canEdit=['owner','admin'].includes(role);
  return <section className="rounded-2xl border border-line bg-panel p-5 shadow-soft">
    <h4 className="text-lg font-bold">Gemini AI Auto Reply</h4>
    <p className="mt-1 text-xs text-subtle">Phase 3B · Telegram private text only · Disabled by default. Configure GEMINI_API_KEY on the server before enabling.</p>
    {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-500">{error}</p>}
    {notice&&<p role="status" className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-500">{notice}</p>}
    <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={enabled} disabled={loading||saving||!canEdit} onChange={e=>setEnabled(e.target.checked)} className="h-4 w-4"/> Enable automatic Gemini replies</label>
    <label className="mt-4 block text-sm font-semibold" htmlFor="gemini-prompt">Store instructions (optional)</label>
    <textarea id="gemini-prompt" rows={4} maxLength={2500} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3 text-sm" value={prompt} disabled={loading||saving||!canEdit}
      onChange={e=>setPrompt(e.target.value)} placeholder="Example: We sell electronics. For shipping costs, ask the customer for their location and refer to a human for an exact quote."/>
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-subtle">Only owners/admins can change AI settings. Human replies pause AI for that chat.</span><button type="button" onClick={save} disabled={!canEdit||saving||loading} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving?'Saving…':'Save AI settings'}</button></div>
  </section>;
}
