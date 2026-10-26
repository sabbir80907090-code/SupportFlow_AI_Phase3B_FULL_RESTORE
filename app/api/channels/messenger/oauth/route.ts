import {randomBytes,randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {metaConfig,graphVersion,oauthCookie,stateHash} from '@/lib/messenger';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 try{
  const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
  const config=metaConfig();if(!config)return failure('Facebook connection is awaiting platform setup.',503);
  // OAuth cookies are host-only. Always start login on the canonical callback host.
  if(req.nextUrl.origin!==config.origin)return NextResponse.json({error:'Open the production dashboard to connect Facebook',canonicalUrl:config.origin+'/'},{status:409,headers:{'Cache-Control':'no-store'}});
  const state=randomBytes(32).toString('hex'),id=randomUUID();
  // Remove expired grants before issuing a new, short-lived authorization.
  await auth.database.from('support_messenger_oauth').delete().eq('business_id',auth.businessId);
  const {error}=await auth.database.from('support_messenger_oauth').insert({id,business_id:auth.businessId,state_hash:stateHash(state),expires_at:new Date(Date.now()+10*60*1000).toISOString()});
  if(error)return failure('Could not start Facebook login',503);
  const url=new URL('https://www.facebook.com/'+graphVersion+'/dialog/oauth');
  url.search=new URLSearchParams({client_id:config.appId,redirect_uri:config.redirectUri,state,response_type:'code',scope:'pages_show_list,pages_manage_metadata,pages_messaging',...(process.env.META_LOGIN_CONFIG_ID?{config_id:process.env.META_LOGIN_CONFIG_ID}:{})}).toString();
  const response=NextResponse.json({url:url.toString()},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(oauthCookie,state,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
  return response;
 }catch{return failure('Could not start Facebook login',503);}
}
