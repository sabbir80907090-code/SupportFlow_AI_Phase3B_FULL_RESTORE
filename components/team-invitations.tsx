'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';

type Invitation={id:string;email:string;status:string;created_at:string;expires_at:string};
type Member={user_id:string;role:string};
const field='w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-3 text-sm';
const button='rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';

export function TeamInvitations({businessId,role}:{businessId:string;role:string}){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [invitations,setInvitations]=useState<Invitation[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true);
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
 useEffect(()=>{if(role==='owner')void refresh()},[role,refresh]);
 if(role!=='owner')return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5"><h4 className="font-bold">Team members</h4><p className="mt-2 text-sm text-subtle">Only the workspace owner can invite moderators.</p></section>;
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
 return <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
  <h4 className="text-lg font-bold">Team & moderators</h4>
  <p className="mt-1 text-sm text-subtle">Invite a moderator by email. They get Agent access to this workspace only. Limit: 5 team seats including the owner.</p>
  {!loading&&<p role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm">Team seats: {seatsUsed}/5 used · {Math.max(0,5-seatsUsed)} available. {reserved} reserved by pending invitations. Current invitation limit: 10 attempts per workspace per day.</p>}
  <form onSubmit={invite} className="mt-4 flex flex-col gap-2 sm:flex-row">
   <label className="min-w-0 flex-1 text-sm">Moderator email
    <input className={field+' mt-1'} type="email" required maxLength={254} autoComplete="email" placeholder="moderator@example.com" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/>
   </label>
   <button className={button+' sm:self-end'} disabled={busy||loading||seatsUsed>=5||!email.trim()}>{busy?'Please wait…':'Send invitation'}</button>
  </form>
  {notice&&<p role="status" className="mt-3 text-sm text-emerald-600">{notice}</p>}
  {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
  <div className="mt-5 space-y-2"><h5 className="font-semibold">Current team ({members.length})</h5>
   {loading?<p className="text-sm text-subtle">Loading team…</p>:members.map(m=><p className="rounded-xl border border-line p-3 text-sm" key={m.user_id}>{m.role==='owner'?'Owner':m.role==='admin'?'Admin':'Moderator'} <span className="text-subtle">· Member ID {m.user_id.slice(0,8)}…</span></p>)}
  </div>
  <div className="mt-5 space-y-2"><h5 className="font-semibold">Invitations</h5>
   {!loading&&!invitations.length&&<p className="text-sm text-subtle">No invitations yet.</p>}
   {invitations.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
    <div className="min-w-0"><p className="break-all font-medium">{i.email}</p><p className="text-xs text-subtle">{i.status==='pending'&&new Date(i.expires_at)<new Date()?'Expired':i.status} · {new Date(i.created_at).toLocaleDateString()}</p></div>
    {i.status==='pending'&&new Date(i.expires_at)>new Date()&&<button type="button" disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50" onClick={()=>void revoke(i.id)}>Cancel</button>}
   </div>)}
  </div>
 </section>;
}

