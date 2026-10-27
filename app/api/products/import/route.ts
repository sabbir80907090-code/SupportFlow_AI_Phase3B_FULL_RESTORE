import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {fetchPublicUrl} from '@/lib/public-url-fetch';
import {parseProductPage} from '@/lib/product-url-import';
export const runtime='nodejs';
export const maxDuration=20;
export async function POST(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 try{
  const raw=await req.text();if(raw.length>6000)return failure('URL is too long');
  const input=JSON.parse(raw);if(typeof input.url!=='string'||input.url.length>2048)return failure('Enter a valid product URL');
  if(input.action==='image'){
   const image=await fetchPublicUrl(input.url,5242880,'image');
   const b=image.body;
   const matches=image.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:image.type==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
   if(!matches)return failure('Product image is not a valid JPG, PNG or WebP');
   return new Response(new Uint8Array(b),{headers:{'content-type':image.type,'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  const page=await fetchPublicUrl(input.url,2097152,'page');
  const products=parseProductPage(page.body.toString('utf8'),page.url);
  if(!products.length)return failure('No readable product data found. Use a product details URL. Login-protected or JavaScript-only pages may require manual entry.',422);
  return NextResponse.json({products},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e instanceof Error&&/^(Use a public|This website|Website |Too many)/.test(e.message)?e.message:'Could not import this URL. Check the public HTTPS product link and try again.',422)}
}
