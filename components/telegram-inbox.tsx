'use client';
import {useCallback,useEffect,useState} from 'react';
import {MessageCircle,RefreshCcw,Send} from 'lucide-react';
import {getSupabase} from '@/lib/supabase';

type Conversation={id:string;business_id:string;display_name:string;username:string|null;last_message_at:string;ai_paused:boolean};
type Message={id:string;conversation_id:string;direction:'inbound'|'outbound';text:string;created_at:string;ai_generated:boolean};
const sb=getSupabase();

export function TelegramInbox({businessId}:{businessId:string}){
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    if(!sb||!businessId)return;
    const {data,error:e}=await sb.from('telegram_conversations')
      .select('id,business_id,display_name,username,last_message_at,ai_paused')
      .eq('business_id',businessId).order('last_message_at',{ascending:false}).limit(100);
    if(e)throw e;
    const list=(data??[]) as Conversation[];
    setConversations(list);
    setSelected(prev=>list.some(c=>c.id===prev)?prev:(list[0]?.id??''));
  },[businessId]);
  const loadMessages=useCallback(async(id:string)=>{
    if(!sb||!id){setMessages([]);return;}
    const {data,error:e}=await sb.from('telegram_messages')
      .select('id,conversation_id,direction,text,created_at,ai_generated').eq('business_id',businessId)
      .eq('conversation_id',id).order('created_at',{ascending:false}).limit(100);
    if(e)throw e;
    setMessages(((data??[]) as Message[]).reverse());
  },[businessId]);
  useEffect(()=>{setSelected('');setConversations([]);setMessages([]);setError('');setLoading(true);
    load().catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false));
  },[load]);
  useEffect(()=>{loadMessages(selected).catch(e=>setError(e instanceof Error?e.message:String(e)));},[selected,loadMessages]);
  useEffect(()=>{
    const interval=setInterval(()=>{
      if(document.visibilityState!=='visible'||busy)return;
      load().catch(()=>{});
      if(selected)loadMessages(selected).catch(()=>{});
    },8000);
    return()=>clearInterval(interval);
  },[load,loadMessages,selected,busy]);
  const refresh=async()=>{setError('');try{await load();if(selected)await loadMessages(selected);}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const send=async(e:React.FormEvent)=>{
    e.preventDefault();if(!sb||!selected||!draft.trim()||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('Sign in again.');
      const res=await fetch('/api/telegram/reply',{method:'POST',headers:{
        'content-type':'application/json',authorization:`Bearer ${session.access_token}`
      },body:JSON.stringify({conversationId:selected,text:draft.trim()})});
      const json=await res.json() as {error?:string};
      if(!res.ok)throw new Error(json.error??'Could not send message');
      setDraft('');setNotice('Reply delivered.');await loadMessages(selected);await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const setHandoff=async(paused:boolean)=>{
    if(!sb||!selected||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error('Sign in again.');
      const res=await fetch('/api/telegram/ai/handoff',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({businessId,conversationId:selected,paused})});
      const json=await res.json() as {error?:string};if(!res.ok)throw new Error(json.error??'Handoff update failed');
      setNotice(paused?'Human handoff enabled. AI will not reply in this chat.':'AI resumed for future messages in this chat.');await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const current=conversations.find(c=>c.id===selected);
  return <section className="rounded-2xl border border-line bg-panel p-5 shadow-soft">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-lg font-bold">Telegram inbox</h4><p className="text-xs text-subtle">Live database messages · refreshes every 8 seconds while visible</p></div>
      <button className="rounded-xl border border-line p-3" onClick={refresh} title="Refresh inbox"><RefreshCcw size={17}/></button>
    </div>
    {error&&<div role="alert" className="mb-3 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-500">{error}</div>}
    {notice&&<div role="status" className="mb-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-500">{notice}</div>}
    <div className="grid min-h-[450px] gap-4 md:grid-cols-[minmax(190px,1fr)_minmax(0,2fr)]">
      <div className="rounded-xl border border-line bg-canvas p-2">
        <p className="px-3 py-2 text-xs font-semibold uppercase text-subtle">Chats ({conversations.length})</p>
        {loading&&<p className="p-3 text-sm text-subtle">Loading…</p>}
        {!loading&&conversations.length===0&&<p className="p-3 text-sm text-subtle">No Telegram messages yet. Send your bot a message after connecting its webhook.</p>}
        {conversations.map(c=><button key={c.id} onClick={()=>{setSelected(c.id);setNotice('');setError('');}}
          className={`mb-1 w-full rounded-lg p-3 text-left text-sm ${selected===c.id?'bg-brand text-white':'hover:bg-panel'}`}>
          <span className="block truncate font-semibold">{c.display_name}</span>
          <span className="block truncate text-xs opacity-70">{c.username?`@${c.username}`:'Telegram'} · {new Date(c.last_message_at).toLocaleString()}</span>
        </button>)}
      </div>
      <div className="flex min-h-[450px] flex-col rounded-xl border border-line bg-canvas">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4"><span className="font-semibold">{current?.display_name??'Select a chat'}</span>{current&&<button type="button" disabled={busy} onClick={()=>setHandoff(!current.ai_paused)} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 ${current.ai_paused?'bg-amber-500/20 text-amber-500':'bg-emerald-500/15 text-emerald-500'}`}>{current.ai_paused?'Human mode · Resume AI':'AI allowed · Pause for human'}</button>}</div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{maxHeight:420}}>
          {!selected&&<div className="grid h-full place-items-center text-sm text-subtle"><MessageCircle size={22} className="mr-2 inline"/>No conversation selected</div>}
          {messages.map(m=><div key={m.id} className={`flex ${m.direction==='outbound'?'justify-end':'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${m.direction==='outbound'?'bg-brand text-white':'border border-line bg-panel'}`}>
              <p>{m.text}</p><p className="mt-2 text-right text-[10px] opacity-60">{m.ai_generated?'Gemini AI':m.direction==='outbound'?'Human reply':'Received'} · {new Date(m.created_at).toLocaleTimeString()}</p>
            </div>
          </div>)}
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Write a reply…" aria-label="Telegram reply" maxLength={4096}
            value={draft} onChange={e=>setDraft(e.target.value)} disabled={!selected||busy}/>
          <button className="rounded-xl bg-brand px-4 py-2 font-semibold text-white disabled:opacity-40" disabled={!selected||!draft.trim()||busy} title="Send reply">
            <Send size={17}/>
          </button>
        </form>
      </div>
    </div>
    <p className="mt-3 text-xs text-subtle">Phase 3B: Gemini AI auto-reply is optional. Sending a manual reply pauses AI in that chat. WhatsApp and Messenger are not connected.</p>
  </section>;
}
