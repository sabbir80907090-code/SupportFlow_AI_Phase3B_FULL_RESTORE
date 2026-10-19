import {NextRequest,NextResponse} from 'next/server';
import {authorizeWorkflow} from '@/lib/workflow-auth';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const auth=await authorizeWorkflow(req);if(!auth.ok)return auth.error;
 const raw=await req.text();if(raw.length>20000)return NextResponse.json({error:'Message too large'},{status:413});
 let input;try{input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 const {data,error}=await auth.db.rpc('ingest_support_message',{p_business_id:auth.businessId,p_input:input});
 if(error)return NextResponse.json({error:'Message could not be stored'},{status:422});
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
}
