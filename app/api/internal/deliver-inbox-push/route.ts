import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';
import {pushAuthorization,trustedPushEndpoint} from '@/lib/inbox-web-push';

export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request: Request) {
  const secret=process.env.CRON_SECRET;
  const actual=Buffer.from(request.headers.get('authorization')??'');
  const expected=Buffer.from('Bearer '+secret);
  if (!secret || secret.length<24 || actual.length!==expected.length || !timingSafeEqual(actual,expected)) return new Response(null,{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub=process.env.NEXT_PUBLIC_INBOX_VAPID_KEY, priv=process.env.INBOX_VAPID_PRIVATE_KEY, subject=process.env.INBOX_VAPID_SUBJECT;
  if (!url || !key || !pub || !priv || !subject) return new Response(null,{status:503});
  const db=adminDb(url,key);
  const {data,error}=await db.rpc('claim_inbox_push');
  if (error) return new Response(null,{status:503});
  const results=await Promise.allSettled((data??[]).map(async (job:{job_id:number;device_id:string;endpoint:string})=>{
    const endpoint=trustedPushEndpoint(job.endpoint);
    const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{Authorization:pushAuthorization(endpoint.origin,pub,priv,subject),TTL:'60',Urgency:'high'}});
    if (response.status===404 || response.status===410) {
      await db.from('inbox_push_devices').delete().eq('id',job.device_id).throwOnError();
    } else if (response.ok) {
      await db.from('inbox_push_queue').delete().eq('id',job.job_id).throwOnError();
    } else throw new Error('Delivery deferred');
  }));
  return Response.json({claimed:results.length,deferred:results.filter(r=>r.status==='rejected').length});
}
