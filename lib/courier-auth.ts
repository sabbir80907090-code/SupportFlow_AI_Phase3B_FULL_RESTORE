import {NextRequest} from 'next/server';
import {adminDb} from '@/lib/telegram-server';
export async function authorizeCourierManager(req:NextRequest){
 const businessId=req.nextUrl.searchParams.get('businessId');
 const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!businessId||!token||!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(businessId))return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Server unavailable');
 const db=adminDb(url,key);
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return null;
 const {data:member,error:memberError}=await db.from('business_members').select('role').eq('business_id',businessId).eq('user_id',data.user.id).maybeSingle();
 if(memberError||!member||!['owner','admin'].includes(member.role))return null;
 return {db,businessId,userId:data.user.id};
}
