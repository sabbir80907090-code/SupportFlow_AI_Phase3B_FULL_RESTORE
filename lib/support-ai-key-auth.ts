import {NextRequest} from 'next/server';
import {db} from '@/lib/support-telegram-connect';

// All key/model operations require an explicit tenant and an owner/admin role.
// Service-role database access must never substitute for a membership check.
export async function authorizedAiManager(req:NextRequest){
 const bearer=req.headers.get('authorization')??'';
 const businessId=req.headers.get('x-business-id')??'';
 if(!bearer.startsWith('Bearer ')||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(businessId))return null;
 const database=db();
 const {data:{user},error}=await database.auth.getUser(bearer.slice(7));
 if(error||!user)return null;
 const {data:member,error:me}=await database.from('business_members').select('role')
  .eq('business_id',businessId).eq('user_id',user.id).maybeSingle();
 if(me)return null;
 if(member?.role==='owner'||member?.role==='admin')return {database,businessId};
 // Preserve owner access if a legacy workspace has no matching membership row.
 const {data:owned,error:oe}=await database.from('businesses').select('id')
  .eq('id',businessId).eq('owner_id',user.id).maybeSingle();
 if(oe||!owned)return null;
 return {database,businessId};
}
