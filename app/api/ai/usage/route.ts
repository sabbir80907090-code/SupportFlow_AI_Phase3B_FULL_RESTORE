import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
export const runtime='nodejs';
const send=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function authorize(req:NextRequest){
 const bearer=req.headers.get('authorization');
 const businessId=req.headers.get('x-business-id')??'';
 if(!bearer?.startsWith('Bearer ')||!uuid.test(businessId))return null;
 const database=db();
 const {data:{user},error}=await database.auth.getUser(bearer.slice(7));
 if(error||!user)return null;
 const {data:member,error:memberError}=await database.from('business_members').select('role')
  .eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
 if(memberError||!member||!['owner','admin'].includes(member.role))return null;
 return {database,businessId};
}
export async function GET(req:NextRequest){
 const ctx=await authorize(req);if(!ctx)return send({error:'Owner or Admin access required'},403);
 const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
 const [usage,rates,budget]=await Promise.all([
  ctx.database.rpc('get_bartacare_ai_usage_summary',{p_business_id:ctx.businessId,p_since:month.toISOString()}),
  ctx.database.from('support_ai_usage_rates').select('provider,model,input_usd_per_million,output_usd_per_million').eq('business_id',ctx.businessId).order('provider'),
  ctx.database.from('support_ai_usage_budgets').select('monthly_budget_usd,monthly_token_budget').eq('business_id',ctx.businessId).maybeSingle()
 ]);
 if(usage.error||rates.error||budget.error)return send({error:'Usage tracking is not ready. Apply the reviewed staging migration first.'},503);
 return send({month:month.toISOString(),summary:usage.data,rates:rates.data??[],budget:budget.data??null,
  providerBalance:null,providerBalanceStatus:'not_available'});
}
export async function POST(req:NextRequest){
 const ctx=await authorize(req);if(!ctx)return send({error:'Owner or Admin access required'},403);
 let input:any;try{input=await req.json()}catch{return send({error:'Invalid request'},400)}
 if(input?.action==='budget'){
  const usd=input.monthlyBudgetUsd,tokens=input.monthlyTokenBudget;
  const valid=(value:unknown,max:number)=>value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max);
  if(!valid(usd,10000000)||!valid(tokens,1000000000000)||usd===undefined||tokens===undefined||
    (tokens!==null&&!Number.isSafeInteger(tokens)))return send({error:'Invalid budget'},400);
  const {error}=await ctx.database.from('support_ai_usage_budgets').upsert({
   business_id:ctx.businessId,monthly_budget_usd:usd,monthly_token_budget:tokens,updated_at:new Date().toISOString()
  },{onConflict:'business_id'});
  return error?send({error:'Budget could not be saved'},503):send({ok:true});
 }
 if(input?.action==='rate'){
  const {provider,model,inputRate,outputRate}=input;
  if(!['gemini','openai','anthropic'].includes(provider)||typeof model!=='string'||
    model.length<2||model.length>120||!/^[a-zA-Z0-9._:-]+$/.test(model)||
    ![inputRate,outputRate].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=10000))
    return send({error:'Invalid model rates'},400);
  const {error}=await ctx.database.from('support_ai_usage_rates').upsert({
   business_id:ctx.businessId,provider,model,input_usd_per_million:inputRate,output_usd_per_million:outputRate,updated_at:new Date().toISOString()
  },{onConflict:'business_id,provider,model'});
  return error?send({error:'Rates could not be saved'},503):send({ok:true});
 }
 return send({error:'Unknown action'},400);
}
