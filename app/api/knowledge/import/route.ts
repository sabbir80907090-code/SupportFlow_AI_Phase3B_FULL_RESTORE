import {NextRequest,NextResponse} from 'next/server';
import {authorizedBusiness,failure} from '@/lib/support-telegram-connect';
import {fetchPublicUrl} from '@/lib/public-url-fetch';
import {parseKnowledgePage} from '@/lib/knowledge-import';
export const runtime='nodejs';
export const maxDuration=20;
export async function POST(req:NextRequest){
 const auth=await authorizedBusiness(req);if(!auth)return failure('Sign in as the business owner',403);
 try{
  const raw=await req.text();if(raw.length>3000)return failure('URL is too long');
  const {url}=JSON.parse(raw);if(typeof url!=='string'||url.length>2048)return failure('Enter a public HTTPS URL');
  const page=await fetchPublicUrl(url,2097152,'page');
  const result=parseKnowledgePage(page.body.toString('utf8'),page.url);
  if(result.text.length<30)return failure('No readable text found. Try uploading a text document.',422);
  if(result.text.length>120000)return failure('Page is too large. Import a smaller page or text document.',422);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return failure('Could not read this public page. It may block imports or require JavaScript. Upload a TXT, Markdown or CSV copy instead.',422);}
}
