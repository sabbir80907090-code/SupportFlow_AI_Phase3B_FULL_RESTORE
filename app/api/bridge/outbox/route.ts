import {NextRequest,NextResponse} from 'next/server';
import {authorizeWorkflow} from '@/lib/workflow-auth';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const auth=await authorizeWorkflow(req);if(!auth.ok)return auth.error;
 let input;try{input=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(input?.action==='claim'){
 const {data,error}=await auth.db.rpc('claim_support_outbox',{p_business_id:auth.businessId});
 if(error)return NextResponse.json({error:'Queue unavailable'},{status:503});
 return NextResponse.json({items:data},{headers:{'Cache-Control':'no-store'}});
 }
 if(input?.action==='ack'&&typeof input.id==='string'&&typeof input.claimToken==='string'&&typeof input.sent==='boolean'&&(!input.sent||typeof input.providerMessageId==='string')){
 const {data,error}=await auth.db.rpc('ack_support_outbox',{p_business_id:auth.businessId,p_id:input.id,p_claim_token:input.claimToken,p_sent:input.sent,p_provider_id:input.providerMessageId??null});
 if(error||!data)return NextResponse.json({error:'Acknowledgement rejected'},{status:409});
 return NextResponse.json({ok:true});
 }
 return NextResponse.json({error:'Invalid queue action'},{status:400});
}
