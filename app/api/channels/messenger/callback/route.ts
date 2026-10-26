import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/support-telegram-connect';
import {encryptChannelCredential} from '@/lib/support-channel-credentials';
import {metaConfig,graphVersion,oauthCookie,stateHash} from '@/lib/messenger';
import {secureEqual} from '@/lib/messenger-security';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const config=metaConfig();if(!config)return new Response('Facebook platform setup incomplete',{status:503});
 const redirect=(status:string)=>NextResponse.redirect(config.origin+'/?messenger='+status,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 const state=req.nextUrl.searchParams.get('state')??'',cookie=req.cookies.get(oauthCookie)?.value??'';
 if(!/^[a-f0-9]{64}$/.test(state)||!secureEqual(state,cookie))return redirect(cookie?'state-mismatch':'session-missing');
 const database=db();
 const {data:session,error}=await database.from('support_messenger_oauth').update({status:'exchanging'})
  .eq('state_hash',stateHash(state)).eq('status','pending').gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
 if(error||!session)return redirect('expired');
 const fail=async()=>{await database.from('support_messenger_oauth').delete().eq('id',session.id);const r=redirect('error');r.cookies.delete(oauthCookie);return r;};
 if(req.nextUrl.searchParams.has('error'))return fail();
 const code=req.nextUrl.searchParams.get('code');if(!code||code.length>4096)return fail();
 try{
  const exchange=async(params:Record<string,string>)=>{
   const response=await fetch('https://graph.facebook.com/'+graphVersion+'/oauth/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,...params}),signal:AbortSignal.timeout(12000),cache:'no-store'});
   const json=await response.json();if(!response.ok||typeof json.access_token!=='string')throw Error('Token exchange failed');return json.access_token as string;
  };
  const short=await exchange({code,redirect_uri:config.redirectUri});
  const token=await exchange({grant_type:'fb_exchange_token',fb_exchange_token:short});
  const {error:saveError}=await database.from('support_messenger_oauth').update({status:'selecting',token_ciphertext:encryptChannelCredential(token,session.id),expires_at:new Date(Date.now()+10*60*1000).toISOString()}).eq('id',session.id);
  if(saveError)return fail();
  return redirect('select-page');
 }catch{return fail();}
}
