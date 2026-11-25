'use client';

import {useState,useEffect} from 'react';
import {db} from './client';

type Result<T> = {data:T} | {error:string} | null;
export function useAdminRead<T>(rpc:string, args:Record<string,string|number>) {
  const request = JSON.stringify([rpc,args]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{request:string; attempt:number; value:Result<T>}>();
  useEffect(() => {
    let active = true;
    const [name, params] = JSON.parse(request);
    async function load() {
      let value:Result<T>;
      try {
        const {data,error} = await db!.rpc(name,params);
        value = error ? {error:error.code === '42501' ? 'এই অ্যাকাউন্টে Platform Admin অনুমতি নেই।' : 'তথ্য লোড করা যায়নি।'} : {data};
      } catch {value = {error:'সংযোগ ব্যর্থ হয়েছে।'};}
      if (active) setResult({request,attempt,value});
    }
    void load();
    return () => {active=false;};
  }, [request,attempt]);
  return {result:result?.request === request && result.attempt === attempt ? result.value : null, retry:()=>setAttempt(v=>v+1)};
}
