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
  const blockedHint = 'To enable alerts, allow notifications in your browser settings.';
  useEffect(()=>{
    let active=true;
    async function read() {
      if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
        if(active)setMessage('This browser does not support push notifications. On iPhone, add BartaCare to your Home Screen and open it there.');
        return;
      }
      const db=getSupabase();
      if (!db || !publicKey) {if(active)setMessage('Device notifications are unavailable for this site.');return;}
      const registration=await navigator.serviceWorker.getRegistration(scope);
      const subscription=registration?.scope===new URL(scope,location.origin).href ? await registration.pushManager.getSubscription() : null;
      let subscribed=false;
      if (subscription) {
        const {data}=await db.from('inbox_push_devices').select('id').eq('endpoint',subscription.endpoint)
          .eq('business_id',businessId).eq('user_id',userId).maybeSingle().throwOnError();
        subscribed=Boolean(data) && Notification.permission==='granted';
      }
      if(active){setEnabled(subscribed);setAvailable(true);if(Notification.permission==='denied')setMessage(blockedHint);}
    }
    read().catch(()=>{if(active)setMessage('Could not load your preference. Reopen Settings to try again.');})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[businessId,userId,scope]);

  async function change(want:boolean) {
    const db=getSupabase();
    if(!db || !publicKey || !available || busy)return;
    setBusy(true);setMessage('');
    try {
      if(want && await Notification.requestPermission()!=='granted'){
        setMessage(Notification.permission==='denied' ? blockedHint : 'Notifications stayed off. Turn them on when you’re ready.');return;
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
    } catch {setMessage('Could not save your preference. Try again.');}
    finally {setBusy(false);}
  }

  const stateLabel = busy ? (available ? 'Saving…' : 'Checking…') : !available ? 'Unavailable' : enabled ? 'On' : 'Off';
  return <div>
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5 sm:px-4">
      <div className="min-w-0">
        <p id="inbox-alert-label" className="text-sm font-semibold text-ink">New inbox messages</p>
        <p id="inbox-alert-help" className="mt-1 text-sm leading-5 text-subtle">Get alerts on this device when a customer messages you.</p>
      </div>
      <button type="button" role="switch" aria-checked={enabled} aria-labelledby="inbox-alert-label"
        aria-describedby="inbox-alert-help" disabled={!available || busy} onClick={()=>void change(!enabled)}
        className="inline-flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:flex-row sm:gap-2">
        <span aria-hidden="true" className={`relative inline-block h-6 w-11 rounded-full border transition-colors ${enabled ? 'border-brand bg-brand' : 'border-subtle bg-panel'}`}>
          <span className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-5 bg-white' : 'bg-subtle'}`}/>
        </span>
        <span aria-hidden="true" className="text-xs font-medium text-subtle">{stateLabel}</span>
      </button>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-subtle">{message && <span className="mt-2 block">{message}</span>}</p>
  </div>;
}
