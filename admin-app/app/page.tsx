'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {useAdminRead} from '../lib/use-admin-read';

type Business = {id: string; name: string; created_at: string; member_count: number};
const pageSize = 25;
const number = new Intl.NumberFormat('bn-BD');
const date = new Intl.DateTimeFormat('bn-BD', {dateStyle: 'medium', timeZone: 'Asia/Dhaka'});

export default function Directory() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const term = input.trim();
    if (term === search) return;
    const timer = window.setTimeout(() => {
      setSearch(term);
      setOffset(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [input, search]);
  const {result, retry} = useAdminRead<Business[]>('platform_list_businesses', {
    search_text: search, page_offset: offset
  });
  const rows = result && 'data' in result ? result.data.slice(0, pageSize) : [];
  const more = !!result && 'data' in result && result.data.length > pageSize;
  return <>
    <h1>ব্যবসার তালিকা</h1>
    <form role="search" className="search" onSubmit={event => {
      event.preventDefault();
      setSearch(input.trim());
      setOffset(0);
    }}>
      <input type="search" aria-label="ব্যবসার নাম বা ID" placeholder="নাম বা পুরো ID দিয়ে খুঁজুন" value={input}
        maxLength={120} onChange={event => setInput(event.target.value)} />
      {input && <button type="button" onClick={() => {setInput(''); setSearch(''); setOffset(0);}}>মুছুন</button>}
    </form>
    {!result ? <p role="status">তালিকা আসছে…</p> : 'error' in result ?
      <p role="alert">{result.error} <button onClick={retry}>আবার চেষ্টা করুন</button></p> : <>
        {rows.length > 0 && <div className="directory-summary" aria-label="এই পাতার হিসাব">
          <div><span>এই পাতায় ব্যবসা</span><strong>{number.format(rows.length)}</strong></div>
          <div><span>সদস্যপদ</span><strong>{number.format(rows.reduce((total, b) => total + b.member_count, 0))}</strong></div>
        </div>}
        <div className="panel">
          {rows.map(b => <Link key={b.id} className="row business" href={'/businesses/' + b.id}>
            <div><strong>{b.name}</strong><small>তৈরি {date.format(new Date(b.created_at))}</small></div>
            <span className="member-count">{number.format(b.member_count)} সদস্য <i aria-hidden="true">›</i></span>
          </Link>)}
          {!rows.length && <p role="status">{search ? 'এই অনুসন্ধানে কোনো ব্যবসা পাওয়া যায়নি।' : 'কোনো ব্যবসা পাওয়া যায়নি।'}</p>}
        </div>
        {(offset > 0 || more) && <nav aria-label="ব্যবসার তালিকার পাতা">
          <button disabled={!offset} onClick={() => setOffset(v => v - pageSize)}>আগের পাতা</button>
          <span>পাতা {number.format(offset / pageSize + 1)}</span>
          <button disabled={!more} onClick={() => setOffset(v => v + pageSize)}>পরের পাতা</button>
        </nav>}
      </>}
  </>;
}
