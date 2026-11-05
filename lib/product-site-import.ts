import {fetchPublicUrl,publicUrl} from '@/lib/public-url-fetch';
import {parseProductPage,type ImportedProduct} from '@/lib/product-url-import';

const MAX_PAGES=12;
const MAX_PAGE_BYTES=2_097_152;
const PAGE_TIMEOUT_MS=9_000;
type Candidate={url:string;kind:'product'|'category'|'pagination'|'other';score:number};

function decode(value:string){
 return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(match,decimal,hex)=>{
  const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};
  if(decimal||hex){const code=parseInt(decimal||hex,decimal?10:16);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}
  return named[match.toLowerCase()]??match;
 });
}
function plain(value:string){return decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,180);}
function safeSameOrigin(raw:string,base:string,origin:string){
 try{
  const url=publicUrl(new URL(decode(raw.trim()),base).href);
  if(url.origin!==origin)return null;
  url.hash='';
  if(url.pathname.length>500||url.href.length>2048)return null;
  return url.href;
 }catch{return null;}
}
function excludedPath(path:string){
 return /\/(?:cart|checkout|account|login|logout|register|wishlist|compare|contact|about|privacy|terms|returns?|shipping|blog|news|article|author|tag|wp-admin|wp-login)(?:\/|$)/i.test(path);
}
function productPath(path:string){
 return /\/(?:products?|items?|p|dp|listing|listings|product-detail|product-details|catalog\/product|gp\/product)(?:\/|$)/i.test(path)||
  /\/(?:product|item)-[a-z0-9-]+(?:\/|$)/i.test(path);
}
function categoryPath(path:string){
 return /\/(?:collections?|categories?|category|shop|store|catalog|catalogue|products|search|c)(?:\/|$)/i.test(path)||
  /\/(?:page|page-number)\/\d+(?:\/|$)/i.test(path);
}
function paginationUrl(url:URL,rel:string){
 return /\bnext\b/i.test(rel)||/\/(?:page|page-number)\/\d+\/?$/i.test(url.pathname)||/[?&](?:page|paged|p)=\d+/i.test(url.search);
}
export function extractSiteCandidates(html:string,baseUrl:string):Candidate[]{
 const base=new URL(baseUrl),origin=base.origin,markup=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const found=new Map<string,Candidate>();
 for(const match of markup.matchAll(/<a\b[^>]*>/gi)){
  const attrs:Record<string,string>={};
  for(const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[attr[1].toLowerCase()]=decode(attr[2]??attr[3]??attr[4]??'');
  if(!attrs.href)continue;
  const href=safeSameOrigin(attrs.href,baseUrl,origin);if(!href||href===baseUrl)continue;
  const url=new URL(href);if(excludedPath(url.pathname))continue;
  const rel=attrs.rel??'',title=plain(match[0])||plain(attrs.title??attrs['aria-label']??'');
  let kind:Candidate['kind']='other',score=0;
  if(paginationUrl(url,rel)){kind='pagination';score=120;}
  else if(productPath(url.pathname)){kind='product';score=100;}
  else if(categoryPath(url.pathname)){kind='category';score=80;}
  else if(url.pathname.split('/').filter(Boolean).length>=1&&title.length>2){kind='other';score=25;}
  if(score){const previous=found.get(href);if(!previous||score>previous.score)found.set(href,{url:href,kind,score});}
 }
 return [...found.values()].sort((a,b)=>b.score-a.score);
}
export function parseSitemapLocations(xml:string,baseUrl:string){
 const base=new URL(baseUrl),origin=base.origin;
 const urls=[...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)].map(m=>safeSameOrigin(m[1].replace(/<!\[CDATA\[|\]\]>/g,''),baseUrl,origin)).filter((v):v is string=>!!v);
 return [...new Set(urls)].slice(0,500);
}
export function rankSitemapCandidates(urls:string[]):Candidate[]{
 return urls.filter(value=>{try{return !excludedPath(new URL(value).pathname)}catch{return false;}})
  .map(url=>{const path=new URL(url).pathname;const kind:Candidate['kind']=productPath(path)?'product':categoryPath(path)?'category':'other';return {url,kind,score:kind==='product'?100:kind==='category'?70:15};})
  .filter(item=>item.score>=15).sort((a,b)=>b.score-a.score);
}
async function safeFetch(url:string,kind:'page'|'sitemap'='page'){
 return fetchPublicUrl(url,MAX_PAGE_BYTES,kind,0,AbortSignal.timeout(PAGE_TIMEOUT_MS));
}
async function sitemapDiscovery(origin:string,startHtml:string){
 const sitemapUrls=new Set<string>();
 const robotsUrl=origin+'/robots.txt',defaultMap=origin+'/sitemap.xml';
 const [robots,map]=await Promise.allSettled([safeFetch(robotsUrl,'sitemap'),safeFetch(defaultMap,'sitemap')]);
 if(robots.status==='fulfilled'){
  for(const line of robots.value.body.toString('utf8').split(/\r?\n/)){
   const match=line.match(/^\s*sitemap\s*:\s*(\S+)/i);if(match){const safe=safeSameOrigin(match[1],robotsUrl,origin);if(safe)sitemapUrls.add(safe);}
  }
 }
 if(map.status==='fulfilled')sitemapUrls.add(defaultMap);
 for(const match of startHtml.matchAll(/<link\b[^>]*>/gi)){
  const tag=match[0];if(!/sitemap/i.test(tag))continue;
  const href=tag.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if(href){const safe=safeSameOrigin(href[1]??href[2],origin+'/',origin);if(safe)sitemapUrls.add(safe);}
 }
 const discovered:string[]=[];
 for(const sitemap of [...sitemapUrls].slice(0,4)){
  try{
   const result=await safeFetch(sitemap,'sitemap'),xml=result.body.toString('utf8');
   const locs=parseSitemapLocations(xml,sitemap);
   if(/<sitemapindex\b/i.test(xml)){
    for(const child of locs.slice(0,3)){
     try{const nested=await safeFetch(child,'sitemap');discovered.push(...parseSitemapLocations(nested.body.toString('utf8'),child));}catch{/* Ignore an unavailable nested sitemap. */}
    }
   }else discovered.push(...locs);
  }catch{/* Sitemaps are optional; continue with discovered page links. */}
 }
 return [...new Set(discovered)].slice(0,500);
}
async function mapLimit<T,R>(items:T[],limit:number,work:(item:T)=>Promise<R>){
 const output:R[]=[];let cursor=0;
 const workers=Array.from({length:Math.min(limit,items.length)},async()=>{
  while(cursor<items.length){const index=cursor++;output[index]=await work(items[index]);}
 });
 await Promise.all(workers);return output;
}
function dedupeProducts(products:ImportedProduct[]){
 const seen=new Set<string>(),result:ImportedProduct[]=[];
 for(const p of products){
  const key=p.sku.trim()?'sku:'+p.sku.trim().toLowerCase():p.sourceUrl?'url:'+p.sourceUrl.replace(/\/$/,'').toLowerCase():'name:'+p.name.trim().toLowerCase()+'|'+p.price+'|'+p.currency;
  if(!p.name.trim()||seen.has(key))continue;seen.add(key);result.push(p);
  if(result.length>=100)break;
 }
 return result;
}

/**
 * Crawl only the submitted public origin. It follows product/category/pagination
 * links and same-origin sitemap entries, with strict page, byte and time limits.
 */
export async function crawlPublicStore(value:string){
 const start=publicUrl(value).href,origin=new URL(start).origin;
 const warnings:string[]=[];
 const first=await safeFetch(start,'page'),startHtml=first.body.toString('utf8');
 const firstProducts=parseProductPage(startHtml,first.url);
 const links=extractSiteCandidates(startHtml,first.url);
 let sitemap:string[]=[];
 if(firstProducts.length<100||links.length<3)sitemap=await sitemapDiscovery(origin,startHtml);
 const discovered=[...links,...rankSitemapCandidates(sitemap)];
 const unique=new Map<string,Candidate>();
 for(const candidate of discovered){
  if(candidate.url===start)continue;
  const previous=unique.get(candidate.url);if(!previous||candidate.score>previous.score)unique.set(candidate.url,candidate);
 }
 let candidates=[...unique.values()];
 if(firstProducts.length){
  const hasPagination=candidates.some(c=>c.kind==='pagination');
  candidates=candidates.filter(c=>hasPagination?c.kind==='pagination':c.kind==='category');
 }else{
  candidates=candidates.filter(c=>c.kind==='product'||c.kind==='category'||c.kind==='other');
 }
 candidates=candidates.sort((a,b)=>b.score-a.score).slice(0,MAX_PAGES-1);
 const fetched=await mapLimit(candidates,4,async candidate=>{
  try{const page=await safeFetch(candidate.url,'page');return {url:page.url,products:parseProductPage(page.body.toString('utf8'),page.url),error:''};}
  catch{return {url:candidate.url,products:[] as ImportedProduct[],error:candidate.url};}
 });
 for(const page of fetched)if(page.error)warnings.push('Some pages could not be read.');
 const products=dedupeProducts([...firstProducts,...fetched.flatMap(page=>page.products)]);
 return {products,pagesScanned:1+fetched.length,pagesDiscovered:1+unique.size,warnings:[...new Set(warnings)]};
}
