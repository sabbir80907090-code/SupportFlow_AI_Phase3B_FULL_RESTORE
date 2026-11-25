'use client';

import {useState, type FormEvent} from 'react';
import {db} from '../../lib/client';
import {useAdminRead} from '../../lib/use-admin-read';

export default function TeamPage() {
  const {result, retry} = useAdminRead<{owner:boolean} | null>('platform_team_access', {});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !db) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get('email')).trim();
    setBusy(true);
    setStatus('');
    try {
      const {error} = await db.rpc('platform_add_team_member', {member_email:email});
      if (error) {
        const messages:Record<string,string> = {
          P0002:'এই ইমেইলে সক্রিয় ও যাচাইকৃত BartaCare account পাওয়া যায়নি।',
          '23505':'এই সদস্যের আগে থেকেই access আছে।',
          '42501':'শুধু মূল Admin সদস্য যোগ করতে পারেন।',
        };
        setStatus(messages[error.code] ?? 'সদস্য যোগ করা যায়নি।');
      } else {
        setStatus(email+'-এর access চালু হয়েছে। ');
        form.reset();
      }
    } catch {setStatus('সংযোগ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');}
    finally {setBusy(false);}
  }
  if (!result) return <p>অনুমতি যাচাই হচ্ছে…</p>;
  if ('error' in result) return <p role="alert">{result.error} <button onClick={retry}>আবার চেষ্টা করুন</button></p>;
  if (!result.data?.owner) return <p>শুধু মূল Admin সদস্য যোগ করতে পারেন।</p>;
  return <form className="panel login" onSubmit={add}>
    <h1>স্থায়ী সদস্য</h1>
    <p>সদস্য নিজের BartaCare account দিয়ে সব ব্যবসার তালিকা, সদস্য ও channel দেখতে পারবেন।</p>
    <label>সদস্যের BartaCare ইমেইল<input type="email" name="email" required /></label>
    <button className="primary" disabled={busy}>{busy?'যোগ হচ্ছে…':'সদস্য যোগ করুন'}</button>
    {status && <output aria-live="polite">{status}</output>}
  </form>;
}
