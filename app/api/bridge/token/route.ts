import {randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return NextResponse.json({error:'Supabase configuration required'},{status:503});
 const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return NextResponse.json({error:'Sign in required'},{status:401});
 let input;try{input=await req.json()}catch{return NextResponse.json({error:'Bad JSON'},{status:400})}
 if(!input||typeof input.businessId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.businessId))return NextResponse.json({error:'Invalid business'},{status:400});
 const db=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await db.auth.getUser(authorization.slice(7));if(authError||!auth.user)return NextResponse.json({error:'Sign in required'},{status:401});
 const token='sf_'+randomBytes(32).toString('base64url');
 const {error}=await db.rpc('rotate_workflow_token',{p_business_id:input.businessId,p_hash:createHash('sha256').update(token).digest('hex')});
 if(error)return NextResponse.json({error:'Only an owner or admin can configure this workflow'},{status:403});
 return NextResponse.json({token},{headers:{'Cache-Control':'no-store'}});
}
