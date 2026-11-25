'use client';

import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useAdminRead} from '../../../lib/use-admin-read';

const roles: Record<string,string> = {owner:'মালিক', admin:'অ্যাডমিন', agent:'এজেন্ট'};
const number = new Intl.NumberFormat('bn-BD');

type Details = {id:string;name:string;created_at:string;members:{id:string;email:string|null;role:string}[];
  channels:{channel:string;name:string;enabled:boolean}[]};
export default function BusinessDetails() {
  const {id}=useParams<{id:string}>();
  const {result,retry}=useAdminRead<Details|null>('platform_business_details',{target_id:id});
  const detail=result && 'data' in result ? result.data : null;
  return <><Link href="/">‹ ব্যবসার তালিকা</Link>
    {!result ? <p role="status">বিস্তারিত আসছে…</p> : 'error' in result ? <p role="alert">{result.error} <button onClick={retry}>আবার চেষ্টা করুন</button></p> :
    !detail ? <p>এই ব্যবসা পাওয়া যায়নি।</p> : <>
      <h1>{detail.name}</h1><p className="meta">তৈরি {new Date(detail.created_at).toLocaleDateString('bn-BD', {timeZone:'Asia/Dhaka'})}</p>
      <details className="business-id"><summary>ব্যবসার পুরো ID দেখুন</summary><code>{detail.id}</code></details>
      <div className="grid"><section className="panel"><h2>সদস্য ({number.format(detail.members.length)})</h2>
        {detail.members.map(m=><div className="row" key={m.id}><span>{m.email||m.id}</span><b className="role">{roles[m.role] ?? m.role}</b></div>)}
        {!detail.members.length && <p>কোনো সদস্য পাওয়া যায়নি।</p>}</section>
        <section className="panel"><h2>Channel সংযোগ</h2><p className="channel-total">{number.format(detail.channels.filter(c=>c.enabled).length)}টি সংযোগ চালু</p>{['telegram','messenger','whatsapp','website'].map(channel=>{
          const connections=detail.channels.filter(c=>c.channel===channel);
          return <div key={channel} className="channel"><strong>{({telegram:'Telegram',messenger:'Messenger',whatsapp:'WhatsApp',website:'Website'})[channel]}</strong>
            {!connections.length ? <small>সেটআপ করা হয়নি</small> : connections.map((c,i)=><div className="connection" key={i}><span>{c.name || 'সংযোগ'}</span><b className={c.enabled?'enabled':'paused'}>{c.enabled?'চালু':'বন্ধ'}</b></div>)}</div>;
        })}</section></div>
    </>}</>;
}
