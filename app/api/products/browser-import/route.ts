import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {validateBrowserSource,readBrowserProducts} from '@/lib/browser-product-import';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
export async function GET(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 return NextResponse.json({available:!!process.env.FIRECRAWL_API_KEY||process.env.FIRECRAWL_ALLOW_ANONYMOUS==='true'},{headers});
}
export async function POST(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 const key=process.env.FIRECRAWL_API_KEY;
 if(!key&&process.env.FIRECRAWL_ALLOW_ANONYMOUS!=='true')return failure('Browser + AI import is not configured yet. The app administrator needs to connect the reading service.',503);
 try{
  const raw=await req.text();if(raw.length>6000)return failure('URL is too long');
  let input:any;try{input=JSON.parse(raw);}catch{return failure('Enter a valid product URL');}
  if(typeof input?.url!=='string'||input.url.length>2048)return failure('Enter a valid product URL');
  const url=await validateBrowserSource(input.url);
  const {data:allowed,error}=await auth.database.rpc('consume_browser_import_quota',{p_business_id:auth.businessId});
  if(error)return failure('Browser import usage check is unavailable. Try again later.',503);
  if(allowed!==true)return failure('Browser import limit reached: 2 requests per minute and 20 per day for this workspace.',429);
  const products=await readBrowserProducts(url,key??'');
  return NextResponse.json({products,mode:'browser_ai',notice:'AI extracted these drafts from one page. Check every price and detail before saving. Stock is left blank for review. Other pages and hidden variants are not included.'},{headers});
 }catch(e){return failure(e instanceof Error&&/^(Browser import|Use a public|This website)/.test(e.message)?e.message:'Browser import could not read this URL. Check the public HTTPS link and try again.',422);}
}
