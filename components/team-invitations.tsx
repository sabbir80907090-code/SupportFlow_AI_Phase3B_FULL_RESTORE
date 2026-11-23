'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {FormDialog} from '@/components/form-dialog';
import {ShieldCheck,UserMinus,MoreHorizontal,Users,Mail,Eye,EyeOff} from 'lucide-react';

type Invitation={id:string;email:string;status:string;created_at:string;expires_at:string;accepted_by:string|null};
type Member={user_id:string;role:string;email?:string|null};
const field='w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-3 text-sm';
const button='rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';

export function TeamInvitations({businessId,role}:{businessId:string;role:string}){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [invitations,setInvitations]=useState<Invitation[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true);
 const [removing,setRemoving]=useState<Member|null>(null),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false);
 const reserved=invitations.filter(i=>i.status==='pending'&&new Date(i.expires_at)>new Date()).length;
 const seatsUsed=members.length+reserved;
 const request=useCallback(async(method:'GET'|'POST'|'DELETE',body?:object)=>{
  const sb=getSupabase();
  const {data:{session}}=await sb!.auth.getSession();
  if(!session)throw Error('Sign in again');
  const url='/api/team/invitations'+(method==='GET'?'?businessId='+encodeURIComponent(businessId):'');
  const res=await fetch(url,{method,headers:{authorization:'Bearer '+session.access_token,...(body?{'content-type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const result=await res.json();
  if(!res.ok)throw Error(result.error||'Request failed');
  return result;
 },[businessId]);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{const result=await request('GET');setInvitations(result.invitations);setMembers(result.members);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Could not load team')}
  finally{setLoading(false)}
 },[request]);
 useEffect(()=>{if(role==='owner'||role==='admin')void refresh()},[role,refresh]);
 if(role!=='owner'&&role!=='admin')return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5"><h4 className="font-bold">Team members</h4><p className="mt-2 text-sm text-subtle">Team management is available to the workspace Owner and Admin.</p></section>;
 async function invite(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   await request('POST',{businessId,email:email.trim()});
   setEmail('');setNotice('Invitation sent. Access starts only after email verification and acceptance.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Invitation failed')}
  finally{setBusy(false)}
 }
 async function revoke(id:string){
  if(busy||!window.confirm('Cancel this invitation?'))return;
  setBusy(true);setError('');setNotice('');
  try{await request('DELETE',{businessId,invitationId:id});setNotice('Invitation cancelled.');await refresh()}
  catch(e){setError(e instanceof Error?e.message:'Could not cancel')}
  finally{setBusy(false)}
 }
 function closeRemove(){if(busy)return;setRemoving(null);setPassword('');setShowPassword(false);}
 async function removeMember(e:React.FormEvent){
  e.preventDefault();if(!removing||busy||role!=='owner'||!password)return;
  setBusy(true);setError('');setNotice('');
  try{
   const sb=getSupabase();const {data:{session}}=await sb!.auth.getSession();if(!session)throw Error('Sign in again');
   const response=await fetch('/api/team/members',{method:'DELETE',headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify({businessId,memberId:removing.user_id,password}),cache:'no-store'});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Could not remove member');
   setRemoving(null);setPassword('');setShowPassword(false);
   await refresh();setNotice('Team member removed from this workspace. Their account was not deleted.');
  }catch(e){setError(e instanceof Error?e.message:'Could not remove member')}
  finally{setBusy(false)}
 }
 return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
  <div className="flex items-start gap-3"><span className="rounded-xl bg-brand/10 p-2 text-brand"><Users size={22}/></span><div><h4 className="text-lg font-bold">Team members</h4><p className="mt-1 text-sm text-subtle">Manage your workspace team. Each business has its own private members.</p></div></div>
  {!loading&&<div role="status" className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-canvas p-3 text-center"><div><p className="text-lg font-bold">{seatsUsed}/5</p><p className="text-xs text-subtle">Seats used</p></div><div><p className="text-lg font-bold">{Math.max(0,5-seatsUsed)}</p><p className="text-xs text-subtle">Available</p></div><div><p className="text-lg font-bold">{reserved}</p><p className="text-xs text-subtle">Pending</p></div></div>}
  {role==='owner'&&<form onSubmit={invite} className="mt-4 flex flex-col gap-2 sm:flex-row">
   <label className="min-w-0 flex-1 text-sm">Moderator email
    <input className={field+' mt-1'} type="email" required maxLength={254} autoComplete="email" placeholder="moderator@example.com" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/>
   </label>
   <button className={button+' sm:self-end'} disabled={busy||loading||seatsUsed>=5||!email.trim()}>{busy?'Please wait…':'Send invitation'}</button>
  </form>}
  {notice&&<p role="status" className="mt-3 text-sm text-emerald-600">{notice}</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
  <div className="mt-6 space-y-3"><div className="flex items-center justify-between gap-2"><h5 className="font-semibold">Current team ({members.length})</h5><span className="text-xs text-subtle">Owner · Admin · Agent</span></div>
   {loading?<p className="text-sm text-subtle">Loading team…</p>:members.map(m=><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 sm:p-4" key={m.user_id}>
    <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">{m.role==='owner'?<ShieldCheck size={20}/>:<Users size={19}/>}</span><div className="min-w-0">{role==='owner'&&<p className="break-all text-sm font-semibold">{m.email||'Email unavailable'}</p>}<p className="text-sm">{m.role==='owner'?'Workspace Owner':m.role==='admin'?'Administrator':'Support Agent'}</p><p className="break-all text-xs text-subtle">Member ID: {m.user_id}</p></div></div>
    {role==='owner'&&['admin','agent'].includes(m.role)&&<details className="relative"><summary aria-label={'Actions for member '+m.user_id} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line"><MoreHorizontal size={20}/></summary><button type="button" disabled={busy} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setRemoving(m);setPassword('');setError('');setShowPassword(false)}} className="absolute right-0 z-10 flex min-h-11 w-max items-center gap-2 rounded-xl bg-panel border border-rose-500/40 px-3 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"><UserMinus size={16}/>Delete member</button></details>}
    {m.role==='owner'&&<span className="text-xs text-subtle">Protected</span>}
   </div>)}
   {role==='owner'&&<p className="text-xs text-subtle">Enter your owner password to remove a member from this workspace.</p>}
  </div>
  {role==='owner'&&<div className="mt-5 space-y-2"><h5 className="flex items-center gap-2 font-semibold"><Mail size={17}/>Invitations</h5>
   {!loading&&!invitations.length&&<p className="text-sm text-subtle">No invitations yet.</p>}
   {invitations.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
    <div className="min-w-0"><p className="break-all font-medium">{i.email}</p><p className="text-xs text-subtle">{i.status==='pending'&&new Date(i.expires_at)<new Date()?'Expired':i.status} · {new Date(i.created_at).toLocaleDateString()}</p>{i.status==='accepted'&&i.accepted_by&&<p className="break-all text-xs text-subtle">Member ID: {i.accepted_by}</p>}</div>
    {i.status==='pending'&&new Date(i.expires_at)>new Date()&&<button type="button" disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void revoke(i.id)}>Cancel</button>}
   </div>)}
  </div>}
  <FormDialog open={!!removing} title="Delete team member?" description="This action removes access to this workspace only." onClose={closeRemove} busy={busy}>
   <form onSubmit={removeMember} className="space-y-4"><p className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm">This member will lose access to the selected workspace.</p><div className="break-all text-sm"><p>{removing?.email||'Email unavailable'}</p><p className="text-subtle">Member ID: {removing?.user_id}</p></div><label className="block text-sm font-semibold">Confirm your owner password<div className="relative mt-2"><input type={showPassword?'text':'password'} autoComplete="current-password" required minLength={1} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} className={field+' pr-14'} placeholder="Enter your password"/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(v=>!v)} className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-subtle">{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>{error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}<div className="flex gap-2"><button type="button" disabled={busy} onClick={closeRemove} className="min-h-11 flex-1 rounded-xl border border-line px-4 text-sm">Cancel</button><button type="submit" disabled={busy||!password} className="min-h-11 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?'Verifying…':'Delete member'}</button></div></form>
  </FormDialog>
 </section>;
}

