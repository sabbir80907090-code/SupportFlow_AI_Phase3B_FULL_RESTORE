'use client';
import {useEffect,useRef,useState} from 'react';
import {MoreVertical,UserMinus,UserRoundCheck,Trash2,Eye,EyeOff} from 'lucide-react';
import {FormDialog} from '@/components/form-dialog';
import {getSupabase} from '@/lib/supabase';

type Action='disconnect'|'reconnect'|'delete';
type Props={businessId:string;memberId:string;state:'active'|'disconnected';onChanged:()=>Promise<void>};
const labels:Record<Action,string>={disconnect:'Disconnect member',reconnect:'Reconnect member',delete:'Delete member'};

export function TeamMemberActions({businessId,memberId,state,onChanged}:Props){
 const [open,setOpen]=useState(false),[action,setAction]=useState<Action|null>(null);
 const [password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const menuRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:MouseEvent)=>{if(!menuRef.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  document.addEventListener('mousedown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape)};
 },[open]);
 function choose(next:Action){setOpen(false);setAction(next);setPassword('');setShowPassword(false);setError('')}
 function close(){if(busy)return;setAction(null);setPassword('');setError('')}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!action||busy||(action==='delete'&&!password))return;
  setBusy(true);setError('');
  try{
   const sb=getSupabase();if(!sb)throw Error('Sign in again');
   const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sign in again');
   const response=await fetch('/api/team/members',{
    method:action==='reconnect'?'POST':'DELETE',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},
    body:JSON.stringify({businessId,memberId,action,...(action==='delete'?{password}:{})})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not update member');
   setAction(null);setPassword('');setShowPassword(false);
   await onChanged();
  }catch(e){setError(e instanceof Error?e.message:'Request failed')}
  finally{setBusy(false)}
 }
 const actions:Action[]=state==='active'?['disconnect','delete']:['reconnect','delete'];
 return <div className="relative" ref={menuRef}>
  <button type="button" aria-label="Member actions" aria-haspopup="menu" aria-expanded={open} disabled={busy}
   onClick={()=>setOpen(v=>!v)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-ink hover:bg-canvas disabled:opacity-50"><MoreVertical size={20}/></button>
  {open&&<div role="menu" aria-label="Member actions" className="absolute right-0 top-full z-30 mt-1 min-w-52 rounded-xl border border-line bg-panel p-1 shadow-lg">
   {actions.map(item=><button key={item} type="button" role="menuitem" onClick={()=>choose(item)}
    className={'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-canvas '+(item==='delete'?'text-rose-500':'text-ink')}>
    {item==='disconnect'?<UserMinus size={17}/>:item==='reconnect'?<UserRoundCheck size={17}/>:<Trash2 size={17}/>}{labels[item]}
   </button>)}
  </div>}
  <FormDialog open={!!action} title={action?labels[action]+'?':'Team action'}
   description={action==='disconnect'?'Temporarily revoke access to this workspace.':action==='reconnect'?'Restore workspace access.':'Delete only this workspace membership, not the global account.'}
   busy={busy} onClose={close}>
   <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-subtle">Member ID: {memberId.slice(0,8)}…</p>
    {action==='delete'&&<label className="block text-sm font-semibold">Confirm workspace owner password
     <div className="relative mt-2"><input type={showPassword?'text':'password'} autoComplete="current-password" required maxLength={1024}
       value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password"
       className="w-full rounded-xl border border-line bg-canvas px-3 py-3 pr-14 text-sm"/>
      <button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)}
       className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-subtle">
       {showPassword?<EyeOff size={19}/>:<Eye size={19}/>}
      </button></div></label>}
    {error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}
    <div className="flex gap-2">
     <button type="button" disabled={busy} onClick={close} className="min-h-11 flex-1 rounded-xl border border-line px-4 text-sm">Cancel</button>
     <button type="submit" disabled={busy||(action==='delete'&&!password)} className={'min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 '+(action==='delete'?'bg-rose-600':'bg-brand')}>
      {busy?'Working…':action?labels[action]:'Confirm'}
     </button>
    </div>
   </form>
  </FormDialog>
 </div>;
}
