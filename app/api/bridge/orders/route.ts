import {NextRequest,NextResponse} from 'next/server';
import {authorizeWorkflow} from '@/lib/workflow-auth';
import {validateWorkflowOrder,validIdentity} from '@/lib/workflow-input';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const auth=await authorizeWorkflow(req);if(!auth.ok)return auth.error;
 const raw=await req.text();if(raw.length>16000)return NextResponse.json({error:'Request too large'},{status:413});
 let input:Record<string,unknown>;try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=='object')throw Error();}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 const invalid=validateWorkflowOrder(input);if(invalid)return NextResponse.json({error:invalid},{status:400});
 const {data,error}=await auth.db.rpc('intake_workflow_order',{p_business_id:auth.businessId,p_input:input});
 if(error){console.error('Workflow order intake failed',error.code);return NextResponse.json({error:'Order could not be saved'},{status:422})}
 return NextResponse.json(data,{status:data.duplicate?200:201,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:NextRequest){
 const auth=await authorizeWorkflow(req);if(!auth.ok)return auth.error;
 const input=Object.fromEntries(req.nextUrl.searchParams);
 if(!validIdentity(input)||!/^\d{7,}$/.test(input.orderId??''))return NextResponse.json({error:'Invalid order lookup'},{status:400});
 const {data,error}=await auth.db.from('orders').select('order_number,status').eq('business_id',auth.businessId).eq('order_number',input.orderId).eq('source_channel',input.channel).eq('external_sender_id',input.senderId).maybeSingle();
 if(error)return NextResponse.json({error:'Order lookup unavailable'},{status:503});
 if(!data)return NextResponse.json({error:'Order not found for this customer'},{status:404});
 return NextResponse.json({orderId:data.order_number,status:data.status},{headers:{'Cache-Control':'no-store'}});
}
