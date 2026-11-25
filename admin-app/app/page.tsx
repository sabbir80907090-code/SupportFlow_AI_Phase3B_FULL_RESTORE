'use client';

import Link from 'next/link';
import {useState} from 'react';
import {useAdminRead} from '../lib/use-admin-read';

type Business = {id:string; name:string; created_at:string; member_count:number};
const size = 25;
export default function Directory() {
  const [input,setInput] = useState('');
  const [search,setSearch] = useState('');
  const [offset,setOffset] = useState(0);
  const {result,retry} = useAdminRead<Business[]>('platform_list_businesses',{search_text:search,page_offset:offset});
  return <><h1>ব্যবসার তালিকা</h1>
    <form className="search" onSubmit={e=>{e.preventDefault();setSearch(input.trim());setOffset(0);}}>
      <input aria-label="ব্যবসার নাম বা ID" placeholder="ব্যবসার নাম বা ID" value={input} maxLength={120} onChange={e=>setInput(e.target.value)} />
      <button className="primary">খুঁজুন</button></form>
    {!result ? <p role="status">তালিকা আসছে…</p> : 'error' in result ? <p role="alert">{result.error} <button onClick={retry}>আবার চেষ্টা করুন</button></p> :
      <><div className="panel">{result.data.slice(0,size).map(b=><Link key={b.id} className="row" href={'/businesses/'+b.id}>
        <div><strong>{b.name}</strong><small>{b.id}</small></div><span>{b.member_count} সদস্য ›</span></Link>)}
        {!result.data.length && <p>কোনো ব্যবসা পাওয়া যায়নি।</p>}</div>
        <nav><button disabled={!offset} onClick={()=>setOffset(v=>v-size)}>আগের পাতা</button><button disabled={result.data.length<=size} onClick={()=>setOffset(v=>v+size)}>পরের পাতা</button></nav></>}
    </>;
}
