import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';
import {processSupportAiJob} from '@/lib/support-ai-engine';
export const runtime='nodejs';
export const maxDuration=60;
function authorized(request:NextRequest){
 const expected=process.env.CRON_SECRET;
 const actual=request.headers.get('authorization')??'';
 if(!expected||expected.length<24)return false;
 const a=Buffer.from(actual),b=Buffer.from('Bearer '+expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function GET(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Not configured'},{status:503});
 const db=adminDb(url,key);
 const {data:jobs,error}=await db.from('support_ai_jobs').select('id')
   .eq('status','queued').order('created_at',{ascending:true}).limit(3);
 if(error)return NextResponse.json({error:'Queue unavailable'},{status:503});
 const results=[];
 for(const job of jobs??[]){
   try{results.push({id:job.id,result:await processSupportAiJob(job.id)});}
   catch{results.push({id:job.id,result:'error'});}
 }
 return NextResponse.json({processed:results.length,results},{headers:{'Cache-Control':'no-store'}});
}
