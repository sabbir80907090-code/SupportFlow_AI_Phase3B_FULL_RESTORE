import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/telegram-server';
export async function authorizeWorkflow(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)return {ok:false as const,error:NextResponse.json({error:'Server configuration required'},{status:503})};
 const token=req.headers.get('authorization')?.match(/^Bearer (sf_[A-Za-z0-9_-]{43})$/)?.[1];
 if(!token)return {ok:false as const,error:NextResponse.json({error:'Invalid workflow credential'},{status:401})};
 const db=adminDb(url,secret);
 const {data,error}=await db.from('workflow_credentials').select('business_id').eq('token_hash',createHash('sha256').update(token).digest('hex')).maybeSingle();
 if(error)return {ok:false as const,error:NextResponse.json({error:'Workflow service unavailable'},{status:503})};
 if(!data)return {ok:false as const,error:NextResponse.json({error:'Invalid workflow credential'},{status:401})};
 return {ok:true as const,db,businessId:data.business_id as string};
}
