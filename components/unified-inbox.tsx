'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {MessageCircle,RefreshCw,Search,Send,Pause,Play,Clock,Inbox,ChevronLeft,AlertCircle} from 'lucide-react';

type Conversation={id:string;channel:string;sender_id:string;display_name:string;ai_paused:boolean};
type Message={id:string;direction:string;text:string;kind:string;created_at:string;event_id:string};
type Queued={id:string;text:string;status:string};
const formatTime=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const channelName=(name:string)=>name==='telegram'?'Telegram':name==='website'?'Website':name.charAt(0).toUpperCase()+name.slice(1);

export function UnifiedInbox({businessId}:{businessId:string}){
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [selected,setSelected]=useState('');
 const [channel,setChannel]=useState('all');
 const [search,setSearch]=useState('');
 const [error,setError]=useState('');
 const [tick,setTick]=useState(0);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{const timer=setInterval(()=>setTick(n=>n+1),10000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{let live=true;const db=getSupabase();if(!db)return;
  db.from('support_conversations').select('id,channel,sender_id,display_name,ai_paused').eq('business_id',businessId).order('last_message_at',{ascending:false}).limit(100).then(({data,error})=>{
   if(!live)return;setLoading(false);
   if(error)setError(error.message);else{setError('');setConversations(data??[]);setSelected(prev=>prev===''?'':(data??[]).some(c=>c.id===prev)?prev:data?.[0]?.id??'')}
  });return()=>{live=false}
 },[businessId,tick]);
 const active=conversations.find(c=>c.id===selected);
 const filtered=conversations.filter(c=>(channel==='all'||c.channel===channel)&&(`${c.display_name} ${c.sender_id}`.toLowerCase().includes(search.toLowerCase())));
 return <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
   <div><h2 className="text-right text-lg font-bold tracking-tight text-ink">Team inbox</h2><p className="hidden md:block mt-1 text-right text-xs text-subtle">Manage conversations across your connected channels.</p></div>
   <button type="button" onClick={()=>setTick(n=>n+1)} className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-canvas"><RefreshCw size={15}/> Refresh</button>
  </div>
  {error&&<p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-500"><AlertCircle size={16}/>{error}</p>}
  <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
   <aside className={`min-w-0 border-line lg:border-r ${active?'hidden lg:flex':'flex'} flex-col`}>
    <div className="space-y-3 border-b border-line p-4">
     <div className="flex items-center justify-between"><span className="text-sm font-semibold text-ink">Conversations</span><span className="rounded-full bg-canvas px-2.5 py-1 text-xs text-subtle">{filtered.length}</span></div>
     <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3"><Search size={16} className="shrink-0 text-subtle"/><input aria-label="Search conversations" placeholder="Search name or ID" value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 w-full bg-transparent py-2.5 text-sm text-ink outline-none"/></label>
     <select aria-label="Filter channel" className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink" value={channel} onChange={e=>setChannel(e.target.value)}>{['all','telegram','messenger','whatsapp','website'].map(c=><option key={c} value={c}>{c==='all'?'All channels':channelName(c)}</option>)}</select>
    </div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
     {filtered.map(c=><button type="button" key={c.id} onClick={()=>setSelected(c.id)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${selected===c.id?'bg-brand/15 ring-1 ring-brand/30':'hover:bg-canvas'}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-bold text-ink">{c.display_name.trim().charAt(0).toUpperCase()||'?'}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.display_name}</span><span className="mt-1 block truncate text-xs text-subtle">{channelName(c.channel)} · {c.sender_id}</span>{c.ai_paused&&<span className="mt-1 inline-block text-xs text-amber-500">Human takeover</span>}</span>
     </button>)}
     {!loading&&!filtered.length&&<div className="grid justify-items-center gap-2 p-8 text-center text-subtle"><Inbox size={26}/><p className="text-sm">No matching conversations</p></div>}
     {loading&&!filtered.length&&<p className="p-5 text-center text-sm text-subtle">Loading conversations…</p>}
    </div>
   </aside>
   {active?<Thread key={active.id} conversation={active} businessId={businessId} tick={tick} refresh={()=>setTick(n=>n+1)} back={()=>setSelected('')}/>:<div className="hidden min-h-[440px] flex-col items-center justify-center gap-3 p-8 text-center text-subtle lg:flex"><MessageCircle size={36}/><p className="font-medium">Select a conversation</p><p className="text-sm">Choose a customer to view their messages.</p></div>}
  </div>
 </div>
}
function Thread({conversation,businessId,tick,refresh,back}:{conversation:Conversation;businessId:string;tick:number;refresh:()=>void;back:()=>void}){
 const [messages,setMessages]=useState<Message[]>([]),[queued,setQueued]=useState<Queued[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const endRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{let live=true;const db=getSupabase();if(db)Promise.all([
  db.from('support_messages').select('id,direction,text,kind,created_at,event_id').eq('business_id',businessId).eq('conversation_id',conversation.id).order('created_at',{ascending:false}).limit(100),
  db.from('support_outbox').select('id,text,status').eq('business_id',businessId).eq('conversation_id',conversation.id).neq('status','sent').order('created_at',{ascending:false}).limit(30)
 ]).then(([m,q])=>{if(!live)return;if(m.error||q.error)setError(m.error?.message??q.error?.message??'Load failed');else{setError('');setMessages((m.data??[]).reverse());setQueued(q.data??[])}});return()=>{live=false}},[businessId,conversation.id,tick]);
 useEffect(()=>{endRef.current?.parentElement?.scrollTo({top:endRef.current.parentElement.scrollHeight,behavior:'smooth'})},[messages.length,queued.length,conversation.id]);
 async function send(e:React.FormEvent){e.preventDefault();const db=getSupabase();if(!db||busy||!draft.trim())return;setBusy(true);setError('');try{const {error}=await db.rpc('queue_support_reply',{p_conversation_id:conversation.id,p_text:draft.trim(),p_request_id:requestId});if(error)throw error;setDraft('');setRequestId(crypto.randomUUID());refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function pause(){const db=getSupabase();if(!db||busy)return;setBusy(true);try{const {error}=await db.rpc('set_support_pause',{p_conversation_id:conversation.id,p_paused:!conversation.ai_paused});if(error)throw error;refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
   <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to conversations" onClick={back} className="rounded-lg p-1.5 text-subtle hover:bg-canvas lg:hidden"><ChevronLeft size={20}/></button><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 font-bold text-ink">{conversation.display_name.trim().charAt(0).toUpperCase()||'?'}</span><div className="min-w-0"><h3 className="truncate text-sm font-bold text-ink sm:text-base">{conversation.display_name}</h3><p className="truncate text-xs text-subtle">{channelName(conversation.channel)} · {conversation.ai_paused?'AI paused — human mode':'AI enabled'}</p></div></div>
   <button type="button" disabled={busy} onClick={pause} className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:opacity-80 disabled:opacity-50">{conversation.ai_paused?<Play size={14}/>:<Pause size={14}/>} {conversation.ai_paused?'Resume AI':'Pause AI'}</button>
  </header>
  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-canvas/30 p-4 sm:p-6">
   {!messages.length&&!queued.length&&<p className="py-12 text-center text-sm text-subtle">No messages in this conversation yet.</p>}
   {messages.map(m=><div key={m.id} className={`flex ${m.direction==='outbound'?'justify-end':'justify-start'}`}><div className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[78%] ${m.direction==='outbound'?'rounded-br-md bg-brand text-white':'rounded-bl-md border border-line bg-panel text-ink'}`}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p><p className="mt-2 flex items-center justify-end gap-1 text-[11px] opacity-70"><Clock size={11}/>{formatTime(m.created_at)}{m.direction==='outbound'&&m.event_id.startsWith('outbox:')&&<span title="Published to chat or accepted by the messaging provider; this does not confirm it was read."> · Sent</span>}</p></div></div>)}
   {queued.map(q=><div key={q.id} className="flex justify-end"><div className="max-w-[92%] rounded-2xl rounded-br-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 sm:max-w-[78%]"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{q.text}</p><p className="mt-2 text-xs text-amber-600">{q.status==='claimed'?'Sending…':q.status==='needs_review'?'Delivery unconfirmed — needs review':q.status==='queued'?'Waiting to send':'Status unavailable'}</p>{q.status==='needs_review'&&<p className="mt-1 text-xs text-subtle">The provider did not confirm delivery. Check the conversation in {channelName(conversation.channel)} before sending again to avoid a duplicate.</p>}</div></div>)}
   <div ref={endRef}/>
  </div>
  {error&&<p role="alert" className="mx-4 mt-2 text-sm text-rose-500">{error}</p>}
  <form onSubmit={send} className="flex items-end gap-3 border-t border-line bg-panel p-3 sm:p-4"><textarea aria-label="Reply" required maxLength={conversation.channel==='messenger'?2000:4096} rows={1} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" className="max-h-40 min-h-[48px] min-w-0 flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-brand"/><button type="submit" disabled={busy||!draft.trim()} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"><Send size={16}/><span className="hidden sm:inline">{busy?'Queueing…':'Send'}</span></button></form>
  <p className="hidden sm:block px-4 pb-3 text-xs text-subtle">Manual replies are queued for delivery and pause AI for this conversation.</p>
 </section>
}
