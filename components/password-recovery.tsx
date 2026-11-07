'use client';
import {useState} from 'react';
import {getSupabase} from '@/lib/supabase';
export function PasswordRecovery({onBack}:{onBack:()=>void}){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setNotice('');setError('');
  try{const db=getSupabase();if(!db)throw Error('Account recovery is unavailable. Please try again later.');
   const {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/reset-password'});
   if(error)throw error;setNotice('If this email has an account, a reset link will arrive shortly. Check your inbox and spam folder.');
  }catch{setError('We could not request a reset link. Please wait a moment and try again.');}finally{setBusy(false);}
 }
 return <main className="grid min-h-dvh place-items-center bg-canvas p-4"><section className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft"><h1 className="text-2xl font-bold">Reset your password</h1><p className="mt-2 text-sm text-subtle">We will email a secure link to help you sign in again.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas p-3"/></label><button disabled={busy||!!notice} className="min-h-11 w-full rounded-xl bg-brand p-3 font-semibold text-white">{busy?'Sending…':notice?'Reset link requested':'Send reset link'}</button></form>{notice&&<p role="status" className="mt-4 text-sm text-emerald-600">{notice}</p>}{error&&<p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}<button type="button" onClick={onBack} className="mt-4 min-h-11 text-sm text-brand underline">Back to sign in</button></section></main>;
}
