'use client';

import Link from 'next/link';
import {useAdminRead} from '../../lib/use-admin-read';

type Access = {owner: boolean};

export function TeamAccess({children}: {children: React.ReactNode}) {
  const {result, retry} = useAdminRead<Access | null>('platform_team_access', {});
  if (!result) return <p role="status">অনুমতি যাচাই হচ্ছে…</p>;
  if ('error' in result) return <p role="alert">{result.error} <button onClick={retry}>আবার চেষ্টা করুন</button></p>;
  if (!result.data) return <p role="alert">এই অ্যাকাউন্টে সক্রিয় Admin App access নেই।</p>;
  return <>{result.data.owner && <nav aria-label="Admin মেনু"><Link href="/">ব্যবসার তালিকা</Link><Link href="/team">সদস্য যোগ করুন</Link></nav>}{children}</>;
}
