'use client';

import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';

const publicKey=process.env.NEXT_PUBLIC_INBOX_VAPID_KEY;
const worker='/bartacare-push/sw.js';

export async function clearPhoneAlertsOnLogout() {
  if (!('serviceWorker' in navigator)) return;
  const registrations=await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter(r=>new URL(r.scope).pathname.startsWith('/bartacare-push/')).map(async r=>{
    const subscription=await r.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }));
}

export function InboxPhoneAlerts({businessId,userId}:{businessId:string;userId:string}) {
  const scope='/bartacare-push/'+businessId+'/'+userId+'/';
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(true);
  const [available,setAvailable]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    async function read() {
      if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
        if(active)setMessage('এই ব্রাউজারে Push পাওয়া যাচ্ছে না। iPhone হলে Home Screen থেকে BartaCare খুলুন।');
        return;
      }
      const db=getSupabase();
      if (!db || !publicKey) {if(active)setMessage('এই সাইটে ডিভাইসের নোটিফিকেশন এখনো চালু হয়নি।');return;}
      const registration=await navigator.serviceWorker.getRegistration(scope);
      const subscription=registration?.scope===new URL(scope,location.origin).href ? await registration.pushManager.getSubscription() : null;
      let subscribed=false;
      if (subscription) {
        const {data}=await db.from('inbox_push_devices').select('id').eq('endpoint',subscription.endpoint)
          .eq('business_id',businessId).eq('user_id',userId).maybeSingle().throwOnError();
        subscribed=Boolean(data) && Notification.permission==='granted';
      }
      if(active){setEnabled(subscribed);setAvailable(true);}
    }
    read().catch(()=>{if(active)setMessage('পছন্দ যাচাই করা যায়নি। Inbox আবার খুলুন।');})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[businessId,userId,scope]);

  async function change(want:boolean) {
    const db=getSupabase();
    if(!db || !publicKey || !available || busy)return;
    setBusy(true);setMessage('');
    try {
      if(want && await Notification.requestPermission()!=='granted'){
        setMessage('অনুমতি পাওয়া যায়নি। পরে চাইলে ব্রাউজারের Settings থেকে অনুমতি দিতে পারবেন।');return;
      }
      const registration=await navigator.serviceWorker.register(worker,{scope});
      if (!registration.active) {
        const installing=registration.installing??registration.waiting;
        if(!installing)throw new Error();
        await new Promise<void>((resolve,reject)=>{
          function changed(){
            if(installing!.state==='activated' || installing!.state==='redundant'){
              installing!.removeEventListener('statechange',changed);
              if(installing!.state==='activated')resolve();else reject(new Error());
            }
          }
          installing.addEventListener('statechange',changed);changed();
        });
      }
      let subscription=await registration.pushManager.getSubscription();
      if(want){
        const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        subscription??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
        const {error}=await db.from('inbox_push_devices').insert({business_id:businessId,endpoint:subscription.endpoint});
        if(error){
          if(error.code!=='23505')throw error;
          await db.from('inbox_push_devices').select('id').eq('business_id',businessId).eq('endpoint',subscription.endpoint).single().throwOnError();
        }
      } else if(subscription) {
        await db.from('inbox_push_devices').delete().eq('endpoint',subscription.endpoint).eq('business_id',businessId).throwOnError();
        setEnabled(false);
        await subscription.unsubscribe();
      }
      setEnabled(want);
    } catch {setMessage('পছন্দ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।');}
    finally {setBusy(false);}
  }

  return <fieldset className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-ink" disabled={!available||busy}>
    <legend className="sr-only">ডিভাইসের নোটিফিকেশন</legend>
    <span>নতুন মেসেজ এলে এই ডিভাইসে নোটিফিকেশন চান?</span>
    {([true,false] as const).map(want=><button key={String(want)} type="button" aria-pressed={enabled===want}
      disabled={!available||busy||enabled===want} onClick={()=>void change(want)}
      className={'min-h-11 rounded-lg border px-3 '+(enabled===want?'border-brand bg-panel font-semibold':'border-line')}>{want?'হ্যাঁ':'না'}</button>)}
    {message&&<span role="status" className="text-xs text-subtle">{message}</span>}
  </fieldset>;
}
