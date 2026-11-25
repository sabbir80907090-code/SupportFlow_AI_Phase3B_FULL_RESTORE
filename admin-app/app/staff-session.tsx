'use client';

import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {db} from '../lib/client';

export default function StaffSession({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const listener = db?.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.id ?? null);
      setMessage('');
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const {error} = await db.auth.signInWithPassword({email:String(form.get('email')).trim(), password:String(form.get('password'))});
      if (error) setMessage('লগ ইন করা যায়নি। ইমেইল ও পাসওয়ার্ড যাচাই করুন।');
    } catch {setMessage('সংযোগ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');}
    finally {setBusy(false);}
  }
  async function logout() {
    setBusy(true);
    try {
      const result = await db!.auth.signOut({scope:'local'});
      if (result.error) setMessage('লগ আউট করা যায়নি। আবার চেষ্টা করুন।');
    } catch {setMessage('লগ আউট করা যায়নি। আবার চেষ্টা করুন।');}
    finally {setBusy(false);}
  }
  return <><header><div className="bar"><Link href="/" className="brand"><span aria-hidden="true">B</span>BartaCare <small>Admin</small></Link>
    {user && <button disabled={busy} onClick={logout}>লগ আউট</button>}</div></header>
    <main>{message && <p role="alert">{message}</p>}
    {!db ? <p role="alert">Admin App-এর Supabase সংযোগ কনফিগার করতে হবে।</p> : user === undefined ? <p role="status">সেশন যাচাই হচ্ছে…</p> :
    user ? <section key={user}>{children}</section> : <form className="login panel" onSubmit={login}>
      <h1>স্টাফ লগ ইন</h1><label>ইমেইল<input type="email" name="email" autoComplete="username" required /></label>
      <label>পাসওয়ার্ড<input type="password" name="password" autoComplete="current-password" required /></label>
      <button className="primary" disabled={busy}>{busy ? 'যাচাই হচ্ছে…' : 'লগ ইন'}</button>
    </form>}</main></>;
}
