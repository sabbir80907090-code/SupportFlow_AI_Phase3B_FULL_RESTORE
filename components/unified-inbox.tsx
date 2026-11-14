'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {needsReply,needsAttention,waitMinutes,sortByPriority} from '@/lib/inbox-priority';
import {MessageCircle,RefreshCw,Search,Send,Pause,Play,Clock,Inbox,ChevronLeft,AlertCircle} from 'lucide-react';

type Conversation={id:string;channel:string;sender_id:string;display_name:string;ai_paused:boolean;last_message_at:string|null;last_inbound_at:string|null;last_outbound_at:string|null;assigned_to:string|null};
type Message={id:string;direction:string;text:string;kind:string;created_at:string;event_id:string};
type ReplyDraft={text:string;requestId:string};
type Queued={id:string;text:string;status:string};
const formatTime=(value:string)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const channelName=(name:string)=>name==='telegram'?'Telegram':name==='website'?'Website':name.charAt(0).toUpperCase()+name.slice(1);

export function UnifiedInbox({businessId,role,onDraftChange}:{businessId:string;role:'owner'|'admin'|'agent';onDraftChange?:(dirty:boolean)=>void}){
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [selected,setSelected]=useState('');
 const [channel,setChannel]=useState('all');
 const [mode,setMode]=useState('all');
 const [priority,setPriority]=useState<'all'|'attention'|'mine'>('all');
 const [priorityReady,setPriorityReady]=useState(false);
 const [userId,setUserId]=useState('');
 const [deliveryReviewIds,setDeliveryReviewIds]=useState<string[]>([]);
 const [deliveryReviewCount,setDeliveryReviewCount]=useState(0);
 const [deliveryReviewOnly,setDeliveryReviewOnly]=useState(false);
 const [deliveryReviewError,setDeliveryReviewError]=useState(false);
 useEffect(()=>{let live=true;getSupabase()?.auth.getUser().then(({data})=>{if(live)setUserId(data.user?.id??'')});return()=>{live=false}},[businessId]);
 const [drafts,setDrafts]=useState<Record<string,ReplyDraft>>({});
 function editDraft(id:string,text:string,reset=false){setDrafts(old=>({...old,[id]:{text,requestId:!reset&&old[id]?.requestId?old[id].requestId:crypto.randomUUID()}}));}
 useEffect(()=>{onDraftChange?.(Object.values(drafts).some(d=>d.text.trim().length>0))},[drafts,onDraftChange]);
 useEffect(()=>()=>onDraftChange?.(false),[onDraftChange]);
 const [search,setSearch]=useState('');
 const [error,setError]=useState('');
 const [tick,setTick]=useState(0);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setTick(n=>n+1)},10000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{let live=true;const db=getSupabase();if(!db){setLoading(false);setError('Inbox is unavailable. Reload the page and sign in again.');return;}
  db.from('support_conversations').select('id,channel,sender_id,display_name,ai_paused,last_message_at,assigned_to,last_inbound_at,last_outbound_at').eq('business_id',businessId).order('last_message_at',{ascending:false}).limit(100).then(({data,error})=>{
   if(!live)return;setLoading(false);
   if(error){
    // An unapplied migration must never break the existing working Inbox.
    db.from('support_conversations').select('id,channel,sender_id,display_name,ai_paused,last_message_at').eq('business_id',businessId).order('last_message_at',{ascending:false}).limit(100).then(({data:oldData,error:oldError})=>{
     if(!live)return;
     setPriorityReady(false);setPriority('all');
     if(oldError){setError(oldError.message);return;}
     const legacy=(oldData??[]).map(c=>({...c,assigned_to:null,last_inbound_at:null,last_outbound_at:null}));
     setConversations(legacy);setSelected(prev=>prev&&legacy.some(c=>c.id===prev)?prev:'');setError('');
    });
   }else{setPriorityReady(true);setError('');setConversations((data??[]) as Conversation[]);setSelected(prev=>prev===''?'':(data??[]).some(c=>c.id===prev)?prev:'')}
  });return()=>{live=false}
 },[businessId,tick]);
 // Read-only, tenant-scoped delivery monitoring. Only Owner/Admin see the summary.
 // Select only conversation IDs: never fetch provider credentials or message text.
 useEffect(()=>{
  let live=true;
  if(role==='agent'){setDeliveryReviewIds([]);setDeliveryReviewCount(0);setDeliveryReviewOnly(false);setDeliveryReviewError(false);return;}
  const db=getSupabase();
  if(!db){setDeliveryReviewError(true);return;}
  db.from('support_outbox').select('conversation_id',{count:'exact'})
   .eq('business_id',businessId).eq('status','needs_review')
   .order('created_at',{ascending:false}).limit(100)
   .then(({data,count,error})=>{
    if(!live)return;
    if(error){setDeliveryReviewError(true);setDeliveryReviewIds([]);setDeliveryReviewCount(0);return;}
    const ids=[...new Set((data??[]).map(x=>x.conversation_id).filter((x):x is string=>typeof x==='string'))];
    setDeliveryReviewIds(ids);
    setDeliveryReviewCount(count??0);
    setDeliveryReviewError(false);
    if((count??0)===0)setDeliveryReviewOnly(false);
   });
  return()=>{live=false};
 },[businessId,role,tick]);
 const active=conversations.find(c=>c.id===selected);
 const now=Date.now();
 // Every unanswered inbound message belongs in Needs Reply, even during its first two minutes.
 const pendingReplies=conversations.filter(needsReply).length;
 const myChats=conversations.filter(c=>!!userId&&c.assigned_to===userId).length;
 const filtered=(priorityReady?sortByPriority(conversations.filter(c=>(!deliveryReviewOnly||deliveryReviewIds.includes(c.id))&&(channel==='all'||c.channel===channel)&&(mode==='all'||(mode==='human'?c.ai_paused:!c.ai_paused))&&(priority==='all'||(priority==='attention'?needsReply(c):!!userId&&c.assigned_to===userId))&&(`${c.display_name} ${c.sender_id}`.toLowerCase().includes(search.trim().toLowerCase()))),now):conversations.filter(c=>(!deliveryReviewOnly||deliveryReviewIds.includes(c.id))&&(channel==='all'||c.channel===channel)&&(mode==='all'||(mode==='human'?c.ai_paused:!c.ai_paused))&&(`${c.display_name} ${c.sender_id}`.toLowerCase().includes(search.trim().toLowerCase()))));
 return <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
   <div><h2 className="text-left text-base font-bold tracking-tight text-ink">Conversations</h2><p className="hidden md:block mt-1 text-left text-xs text-subtle">Latest 100 conversations · waiting is based on message times, not read receipts.</p></div>
   <button type="button" onClick={()=>setTick(n=>n+1)} className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-canvas"><RefreshCw size={15}/> Refresh</button>
  </div>
  {error&&<p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-500"><AlertCircle size={16}/>{error}</p>}
  <div className="grid min-h-0 flex-1 overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:bg-panel lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
   <aside className={`min-w-0 rounded-xl border border-line bg-panel lg:rounded-none lg:border-0 lg:border-r ${active?'hidden lg:flex':'flex'} flex-col`}>
    {role!=='agent'&&deliveryReviewCount>0&&
     <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
      <AlertCircle size={17} className="shrink-0 text-amber-600 dark:text-amber-400"/>
      <div className="min-w-0 flex-1">
       <p className="font-semibold text-ink">{deliveryReviewCount} {deliveryReviewCount===1?'reply needs':'replies need'} delivery check</p>
       <p className="mt-0.5 text-subtle">Check the provider before sending again.</p>
      </div>
      <button type="button" aria-pressed={deliveryReviewOnly} onClick={()=>{
       if(!deliveryReviewOnly){setSearch('');setChannel('all');setMode('all');setPriority('all')}
       setDeliveryReviewOnly(v=>!v);
      }} className="min-h-11 shrink-0 rounded-lg border border-amber-500/40 bg-panel px-3 font-semibold text-ink hover:opacity-80">{deliveryReviewOnly?'Show all':'Review'}</button>
     </div>}
    {role!=='agent'&&deliveryReviewError&&<p role="status" className="border-b border-line px-3 py-2 text-xs text-subtle">Delivery check unavailable. Use Refresh to retry.</p>}
    <div className="space-y-2 border-b border-line p-3">
     <div className="grid grid-cols-3 gap-1.5" aria-label="Inbox priority filters">
      {([['all','All',conversations.length],['attention','Needs Reply',pendingReplies],['mine','My Chats',myChats]] as const).map(([value,label,count])=>
       <button type="button" key={value} disabled={!priorityReady&&value!=='all'} aria-pressed={priority===value}
        onClick={()=>setPriority(value)} className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-1.5 py-2 text-center text-xs font-semibold transition disabled:opacity-50 ${priority===value?'bg-brand text-white':'border border-line bg-canvas text-ink hover:border-brand'}`}>
        <span>{label}</span><span className="mt-0.5 text-[11px] opacity-75">{count}</span>
       </button>)}
     </div>
     <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3"><Search size={16} className="shrink-0 text-subtle"/><input aria-label="Search conversations" placeholder="Search customer or ID" value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 w-full bg-transparent py-2.5 text-sm text-ink outline-none"/></label>
     <details className="rounded-lg border border-line bg-canvas/40" key={businessId}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-medium text-subtle"><span>Filters {channel!=='all'||mode!=='all'?'· Active':''}</span><span className="flex items-center gap-1">{channel==='all'?'All channels':channelName(channel)} <span aria-hidden="true">⌄</span></span></summary>
      <div className="space-y-2 border-t border-line p-3">
       <label className="block text-xs text-subtle">Channel<select aria-label="Filter channel" className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink" value={channel} onChange={e=>setChannel(e.target.value)}>{['all','telegram','messenger','whatsapp','website'].map(c=><option key={c} value={c}>{c==='all'?'All channels':channelName(c)}</option>)}</select></label>
       <label className="block text-xs text-subtle">AI status<select aria-label="Filter AI mode" className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink" value={mode} onChange={e=>setMode(e.target.value)}><option value="all">All conversations</option><option value="human">Human takeover</option><option value="ai">AI not paused</option></select></label>
       {(channel!=='all'||mode!=='all')&&<button type="button" onClick={()=>{setChannel('all');setMode('all')}} className="min-h-10 text-xs font-semibold text-brand underline">Clear extra filters</button>}
      </div>
     </details>
     {(search||priority!=='all'||deliveryReviewOnly)&&<button type="button" className="min-h-8 text-xs text-brand underline" onClick={()=>{setSearch('');setChannel('all');setMode('all');setPriority('all');setDeliveryReviewOnly(false)}}>Clear filters</button>}
    </div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
     {filtered.map(c=><button type="button" key={c.id} aria-current={selected===c.id?true:undefined} onClick={()=>setSelected(c.id)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${selected===c.id?'bg-brand/15 ring-1 ring-brand/30':'hover:bg-canvas'}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-bold text-ink">{c.display_name.trim().charAt(0).toUpperCase()||'?'}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.display_name||'Unnamed customer'}</span><span className="mt-1 block truncate text-xs text-subtle" title={c.sender_id}>{channelName(c.channel)}</span>{c.last_message_at&&<time dateTime={c.last_message_at} className="mt-1 block text-[11px] text-subtle">{new Date(c.last_message_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}{(!!drafts[c.id]?.text||needsReply(c)||!!c.assigned_to||c.ai_paused)&&<span className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Conversation status">
       {drafts[c.id]?.text&&<span className="inline-flex max-w-full rounded-md bg-brand/10 px-2 py-1 text-xs leading-4 text-brand">Draft reply</span>}
       {needsReply(c)&&<span className={`inline-flex max-w-full rounded-md px-2 py-1 text-xs leading-4 ${needsAttention(c,now)?'bg-amber-500/10 font-semibold text-amber-600 dark:text-amber-400':'bg-brand/10 text-brand'}`}>{c.ai_paused?'Human reply needed':`Waiting ${waitMinutes(c,now)}m`}</span>}
       {c.assigned_to&&<span className="inline-flex max-w-full rounded-md border border-line bg-canvas px-2 py-1 text-xs leading-4 text-subtle">{c.assigned_to===userId?'Assigned to me':'Assigned to teammate'}</span>}
       {c.ai_paused&&!needsReply(c)&&<span className="inline-flex max-w-full rounded-md bg-amber-500/10 px-2 py-1 text-xs leading-4 text-amber-600 dark:text-amber-400">Human mode</span>}
      </span>}</span>
     </button>)}
     {!loading&&!filtered.length&&<div className="grid justify-items-center gap-2 px-5 py-10 text-center text-subtle">
       <Inbox size={26}/>
       <p className="text-sm font-semibold text-ink">{conversations.length===0?'No conversations yet':deliveryReviewOnly?'No recent delivery checks':search||channel!=='all'||mode!=='all'?'No matching conversations':priority==='mine'?'No chats assigned to you':priority==='attention'?'No replies waiting':'No matching conversations'}</p>
       <p className="max-w-[240px] text-xs leading-relaxed">{conversations.length===0?'Messages from your connected channels will appear here.':deliveryReviewOnly?'Some delivery checks may be in older conversations outside this latest-100 list. Check the provider before replying again.':search||channel!=='all'||mode!=='all'?'Try clearing your search or filters.':priority==='mine'?'Open a conversation and choose Take chat to see it here.':priority==='attention'?'New unanswered messages will appear here automatically.':'Try clearing your filters.'}</p>
       {conversations.length>0&&(search||channel!=='all'||mode!=='all'||priority!=='all'||deliveryReviewOnly)&&<button type="button" className="min-h-11 rounded-lg border border-line px-4 text-xs font-semibold text-brand" onClick={()=>{setSearch('');setChannel('all');setMode('all');setPriority('all');setDeliveryReviewOnly(false)}}>Show all conversations</button>}
      </div>}
     {loading&&!filtered.length&&<p className="p-5 text-center text-sm text-subtle">Loading conversations…</p>}
    </div>
   </aside>
   {active?<Thread key={active.id} conversation={active} businessId={businessId} tick={tick} role={role} userId={userId} priorityReady={priorityReady} draft={drafts[active.id]?.text??''} requestId={drafts[active.id]?.requestId} editDraft={(text,reset)=>editDraft(active.id,text,reset)} refresh={()=>setTick(n=>n+1)} back={()=>setSelected('')}/>:<div className="hidden min-h-[440px] flex-col items-center justify-center gap-3 p-8 text-center text-subtle lg:flex"><MessageCircle size={36}/><p className="font-medium">Select a conversation</p><p className="text-sm">Choose a customer to view their messages.</p></div>}
  </div>
 </div>
}
function Thread({conversation,businessId,tick,role,userId,priorityReady,refresh,back,draft,requestId,editDraft}:{conversation:Conversation;businessId:string;tick:number;role:'owner'|'admin'|'agent';userId:string;priorityReady:boolean;draft:string;requestId:string|undefined;editDraft:(text:string,reset?:boolean)=>void;refresh:()=>void;back:()=>void}){
 const [messages,setMessages]=useState<Message[]>([]),[queued,setQueued]=useState<Queued[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[newMessages,setNewMessages]=useState(false);
 const endRef=useRef<HTMLDivElement|null>(null),nearBottom=useRef(true),firstLoad=useRef(true),locked=useRef(false);
 const [loadingOlder,setLoadingOlder]=useState(false),[hasOlder,setHasOlder]=useState(true);
 const olderLock=useRef(false);
 function mergeMessages(previous:Message[],incoming:Message[]){return [...new Map([...previous,...incoming].map(m=>[m.id,m])).values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}
 async function loadOlder(){
  const db=getSupabase(),oldest=messages[0];if(!db||!oldest||olderLock.current)return;olderLock.current=true;setLoadingOlder(true);setError('');
  try{const {data,error}=await db.from('support_messages').select('id,direction,text,kind,created_at,event_id').eq('business_id',businessId).eq('conversation_id',conversation.id).or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);if(error)throw error;setMessages(previous=>mergeMessages(previous,data??[]));setHasOlder((data?.length??0)===100);}
  catch{setError('Could not load older messages. Please try again.');}finally{olderLock.current=false;setLoadingOlder(false);}
 }
 function scrollToLatest(){endRef.current?.parentElement?.scrollTo({top:endRef.current.parentElement.scrollHeight,behavior:'smooth'});nearBottom.current=true;setNewMessages(false);}

 useEffect(()=>{let live=true;const db=getSupabase();if(db)Promise.all([
  db.from('support_messages').select('id,direction,text,kind,created_at,event_id').eq('business_id',businessId).eq('conversation_id',conversation.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100),
  db.from('support_outbox').select('id,text,status').eq('business_id',businessId).eq('conversation_id',conversation.id).neq('status','sent').order('created_at',{ascending:false}).limit(30)
 ]).then(([m,q])=>{if(!live)return;setLoading(false);if(m.error||q.error)setLoadError(m.error?.message??q.error?.message??'Load failed');else{setLoadError('');if(firstLoad.current)setHasOlder((m.data?.length??0)===100);setMessages(previous=>mergeMessages(previous,m.data??[]));setQueued(q.data??[])}});return()=>{live=false}},[businessId,conversation.id,tick]);
 const latestMessage=messages.at(-1)?.id,latestQueued=queued[0]?.id;
 useEffect(()=>{if(loading)return;if(firstLoad.current||nearBottom.current){scrollToLatest();firstLoad.current=false;}else setNewMessages(true);},[latestMessage,latestQueued,loading]);
 const assignedElsewhere=!!conversation.assigned_to&&conversation.assigned_to!==userId;
 const canReply=!!userId&&!assignedElsewhere;
 async function send(e:React.FormEvent){e.preventDefault();const db=getSupabase();if(!db||locked.current||!canReply||!draft.trim()||!requestId)return;locked.current=true;setBusy(true);setError('');try{const {error}=await db.rpc('queue_support_reply',{p_conversation_id:conversation.id,p_text:draft.trim(),p_request_id:requestId});if(error)throw error;editDraft('',true);nearBottom.current=true;refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{locked.current=false;setBusy(false)}}
 async function pause(){const db=getSupabase();if(!db||locked.current||!userId||(assignedElsewhere&&role==='agent'))return;locked.current=true;setBusy(true);setError('');try{const {error}=await db.rpc('set_support_pause',{p_conversation_id:conversation.id,p_paused:priorityReady?(assignedElsewhere||!conversation.assigned_to?true:!conversation.ai_paused):!conversation.ai_paused});if(error)throw error;refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{locked.current=false;setBusy(false)}}
 return <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
   <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to conversations" onClick={back} className="min-h-11 min-w-11 rounded-lg p-1.5 text-subtle hover:bg-canvas lg:hidden"><ChevronLeft size={20}/></button><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/15 font-bold text-ink">{conversation.display_name.trim().charAt(0).toUpperCase()||'?'}</span><div className="min-w-0"><h3 className="truncate text-sm font-bold text-ink sm:text-base">{conversation.display_name}</h3><p className="truncate text-xs text-subtle">{channelName(conversation.channel)} · {conversation.ai_paused?'AI paused — human mode':'AI not paused'}</p></div></div>
   <button type="button" disabled={busy||!userId||(assignedElsewhere&&role==='agent')} onClick={pause} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-semibold text-ink hover:opacity-80 disabled:opacity-50">{conversation.ai_paused&&conversation.assigned_to===userId&&!assignedElsewhere?<Play size={14}/>:<Pause size={14}/>} {priorityReady?(assignedElsewhere?(role==='agent'?'Assigned to teammate':'Take over chat'):conversation.ai_paused&&conversation.assigned_to===userId?'Resume AI':'Take chat'):(conversation.ai_paused?'Resume AI':'Pause AI')}</button>
  </header>
  {conversation.assigned_to&&<p className="px-4 py-1 text-xs text-subtle">{conversation.assigned_to===userId?'You are handling this conversation.':'A teammate is handling this conversation.'} {assignedElsewhere&&role==='agent'?'Ask an Owner or Admin to transfer it.':''}</p>}
  <div onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;if(nearBottom.current)setNewMessages(false)}} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-canvas/30 p-4 sm:p-6">
   {loading&&<p role="status" className="py-12 text-center text-sm text-subtle">Loading messages…</p>}
   {!loading&&!loadError&&!messages.length&&!queued.length&&<p className="py-12 text-center text-sm text-subtle">No messages in this conversation yet.</p>}
   {hasOlder&&messages.length>0&&<button type="button" disabled={loadingOlder} onClick={()=>void loadOlder()} className="mx-auto block min-h-11 rounded-xl border border-line px-4 text-sm text-brand">{loadingOlder?'Loading older messages…':'Load older messages'}</button>}
   {messages.map(m=><div key={m.id} className={`flex ${m.direction==='outbound'?'justify-end':'justify-start'}`}><div className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[78%] ${m.direction==='outbound'?'rounded-br-md bg-brand text-white':'rounded-bl-md border border-line bg-panel text-ink'}`}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p><p className="mt-2 flex items-center justify-end gap-1 text-[11px] opacity-70"><Clock size={11}/>{new Date(m.created_at).toLocaleDateString([],{month:'short',day:'numeric'})+' · '+formatTime(m.created_at)}{m.direction==='outbound'&&m.event_id.startsWith('outbox:')&&<span title="Published to chat or accepted by the messaging provider; this does not confirm it was read."> · Sent</span>}</p></div></div>)}
   {queued.map(q=><div key={q.id} className="flex justify-end"><div className="max-w-[92%] rounded-2xl rounded-br-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 sm:max-w-[78%]"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{q.text}</p><p className="mt-2 text-xs text-amber-600">{q.status==='claimed'?'Sending…':q.status==='needs_review'?'Delivery unconfirmed — needs review':q.status==='queued'?'Waiting to send':'Status unavailable'}</p>{q.status==='needs_review'&&<p className="mt-1 text-xs text-subtle">The provider did not confirm delivery. Check the conversation in {channelName(conversation.channel)} before sending again to avoid a duplicate.</p>}</div></div>)}
   <div ref={endRef}/>
  </div>
  {newMessages&&<button type="button" onClick={scrollToLatest} className="mx-auto my-2 min-h-10 rounded-full border border-brand px-4 text-sm text-brand">View latest messages ↓</button>}
  {loadError&&<p role="alert" className="mx-4 mt-2 text-sm text-rose-500">Could not refresh messages. <button type="button" onClick={refresh} className="underline">Try again</button></p>}
  {error&&<p role="alert" className="mx-4 mt-2 text-sm text-rose-500">{error}</p>}
  <form onSubmit={send} className="flex items-end gap-3 border-t border-line bg-panel p-3 sm:p-4"><textarea aria-label="Reply" required maxLength={conversation.channel==='messenger'?2000:4096} rows={3} disabled={busy||!canReply} value={draft} onChange={e=>editDraft(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} placeholder="Write a message…" className="max-h-40 min-h-[48px] min-w-0 flex-1 resize-none rounded-xl border border-line bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-brand"/><button type="submit" aria-label={busy?'Queueing reply':'Send reply'} disabled={busy||!canReply||!draft.trim()} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"><Send size={16}/><span>{busy?'Queueing…':'Send'}</span></button></form>
  <p className="px-4 pb-3 text-xs text-subtle">{draft.length}/{conversation.channel==='messenger'?2000:4096} · Ctrl/⌘ + Enter to send. A manual reply takes an unclaimed chat and pauses AI. Drafts stay while switching chats; leaving Inbox or reloading clears them.</p>
 </section>
}

