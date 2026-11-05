import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {crawlPublicStore} from '@/lib/product-site-import';
import {publicUrl} from '@/lib/public-url-fetch';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 try{
  const raw=await req.text();if(raw.length>6000)return failure('URL is too long');
  let input:any;try{input=JSON.parse(raw)}catch{return failure('Enter a valid website URL')}
  if(typeof input?.url!=='string'||input.url.length>2048)return failure('Enter a valid public HTTPS website URL');
  const url=publicUrl(input.url).href;
  const {data:allowed,error}=await auth.database.rpc('consume_browser_import_quota',{p_business_id:auth.businessId});
  if(error)return failure('Website import usage check is unavailable. Try again later.',503);
  if(allowed!==true)return failure('Website import limit reached: 2 scans per minute and 20 per day for this workspace.',429);
  const result=await crawlPublicStore(url);
  if(!result.products.length)return NextResponse.json({...result,notice:'No products could be verified. Try a category page, sitemap URL, or a saved HTML page.'},{headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({...result,mode:'site_crawl',notice:'Products were collected from a limited scan of this public website. Review every detail before importing; unavailable pages may be skipped.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  const message=e instanceof Error?e.message:'Website scan failed.';
  return failure(/^(Use a public|This website|Website |Too many)/.test(message)?message:'Could not scan this website. Check the public HTTPS URL or try a category page.',422);
 }
}
