'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
export default function ResetPassword(){
 const [ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const db=getSupabase();if(!db){setReady(true);return;}let live=true;
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(live){setSignedIn(!!session);setReady(true);}});
  void db.auth.getSession().then(({data})=>{if(live){setSignedIn(!!data.session);setReady(true);}}).catch(()=>{if(live)setReady(true);});
  return()=>{live=false;subscription.unsubscribe();};
 },[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!signedIn)return;setError('');if(password!==confirmation){setError('The passwords do not match.');return;}setBusy(true);
  try{const db=getSupabase();if(!db)throw Error();const {error}=await db.auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');setDone(true);}
  catch{setError('Could not update your password. Use a different password or request a fresh reset link.');}finally{setBusy(false);}
 }
 return <main className="grid min-h-dvh place-items-center bg-canvas p-4"><section className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft"><h1 className="text-2xl font-bold">Choose a new password</h1>{!ready?<p role="status" className="mt-4">Checking your reset link…</p>:done?<p role="status" className="mt-4 text-emerald-600">Your password has been updated.</p>:!signedIn?<p role="alert" className="mt-4 text-sm">This link is invalid or expired. Return to sign in and request a new password reset link.</p>:<form onSubmit={submit} className="mt-6 space-y-4"><p className="text-sm text-subtle">Use at least 6 characters.</p>{[['New password',password,setPassword],['Confirm password',confirmation,setConfirmation]].map(([label,value,setter])=><label key={label as string} className="block text-sm font-semibold">{label as string}<input type={visible?'text':'password'} autoComplete="new-password" minLength={6} required value={value as string} onChange={e=>(setter as (s:string)=>void)(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3"/></label>)}<button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)} className="min-h-11 text-sm text-brand underline">{visible?'Hide passwords':'Show passwords'}</button><button disabled={busy} className="min-h-11 w-full rounded-xl bg-brand p-3 font-semibold text-white">{busy?'Updating…':'Update password'}</button></form>}{error&&<p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}<a href="/" className="mt-5 inline-flex min-h-11 items-center text-sm text-brand underline">{done?'Continue to workspace':'Back to sign in'}</a></section></main>;
}
