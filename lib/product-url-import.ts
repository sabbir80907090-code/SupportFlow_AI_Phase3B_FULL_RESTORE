export type ImportedProduct={name:string;description:string;sku:string;category:string;price:string;currency:string;stock_quantity:string;imageUrl:string;sourceUrl:string};
function decode(text:string){return text.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(match,decimal,hex)=>{const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(decimal||hex){const code=parseInt(decimal||hex,decimal?10:16);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}return named[match.toLowerCase()]??match});}
const text=(v:unknown,max:number)=>decode(typeof v==='string'?v:typeof v==='number'?String(v):'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const amount=(v:unknown)=>{const value=typeof v==='number'?String(v):typeof v==='string'?v.trim():'';return /^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)<1e12?value:''};
function image(value:any,base:string){const raw=typeof value==='string'?value:Array.isArray(value)?value[0]:value?.url??value?.contentUrl;try{const target=typeof raw==='object'?raw?.url:raw;if(typeof target!=='string'||!target.trim())return '';const u=new URL(target,base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
// Domain-independent fallback for explicit Product microdata and common product cards.
// Values remain untrusted plain text; missing or ambiguous facts require review.
function productCards(html:string,sourceUrl:string):ImportedProduct[]{
 const markup=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const attrs=(tag:string)=>{const out:Record<string,string>={};for(const a of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[a[1].toLowerCase()]=decode(a[2]??a[3]);return out;};
 const inner=(tail:string,tagName:string)=>{let depth=1;for(const tag of tail.matchAll(new RegExp('<\\/?'+tagName+'\\b[^>]*>','gi'))){depth+=/^<\//.test(tag[0])?-1:1;if(depth===0)return tail.slice(0,tag.index!);}return '';};
 const result:ImportedProduct[]=[];let examined=0;
 for(const start of markup.matchAll(/<(div|li|article|section)\b[^>]*>/gi)){
  const a=attrs(start[0]),schema=/(?:https?:\/\/)?schema\.org\/Product\b/i.test(a.itemtype??'');
  if(!schema&&!(a.class??'').split(/\s+/).some(c=>['product','product-card','product-item','card-product'].includes(c)))continue;
  if(examined++>=300||result.length>=100)break;
  const tail=markup.slice(start.index!+start[0].length,start.index!+100000),tagName=start[1];let depth=1,end=-1;
  for(const tag of tail.matchAll(new RegExp('<\\/?'+tagName+'\\b[^>]*>','gi'))){depth+=/^<\//.test(tag[0])?-1:1;if(depth===0){end=tag.index!;break;}}
  if(end<0)continue;
  const card=tail.slice(0,end);
  const prop=(name:string)=>{
   for(const tag of card.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)){
    const values=attrs(tag[0]);if(!(values.itemprop??'').split(/\s+/).includes(name))continue;
    if(values.content!==undefined)return values.content;
    if(values.href!==undefined)return values.href;
    if(values.src!==undefined)return values.src;
    return text(inner(card.slice(tag.index!+tag[0].length),tag[1]),5000);
   }return '';
  };
  const heading=card.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1]??'';
  const name=text(prop('name')||heading,160);if(!name)continue;
  const anchor=heading.match(/<a\b[^>]*>/i)?.[0]??card.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/i)?.[0]??'';
  const link=image(prop('url')||attrs(anchor).href,sourceUrl);
  if(!schema&&(!link||new URL(link).origin!==new URL(sourceUrl).origin))continue;
  // Exclude deleted prices; accept only one unambiguous amount from a marked price block.
  const selling=card.replace(/<(del|s)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const priceTag=[...selling.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)].find(tag=>{const classes=(attrs(tag[0]).class??'').split(/\s+/);return !classes.includes('line-through')&&classes.some(c=>['price','product-price','price-item--sale'].includes(c));});
  let priceText='';
  if(priceTag)priceText=text(inner(selling.slice(priceTag.index!+priceTag[0].length),priceTag[1]),200);
  const explicit=prop('price');
  const raw=priceText.replace(/\b(?:BDT|USD|EUR|GBP|INR)\b/gi,'').replace(/[৳$€£₹]/g,'').trim();
  // Do not assume a decimal convention for comma-only prices, or accept price ranges.
  const normalized=/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw)?raw.replace(/,/g,''):raw;
  const price=amount(explicit)||amount(normalized);
  const currencyProp=prop('priceCurrency');
  const currency=/^[A-Z]{3}$/.test(currencyProp)?currencyProp:priceText.match(/\b(BDT|USD|EUR|GBP|INR)\b/i)?.[1].toUpperCase()??(priceText.includes('৳')?'BDT':priceText.includes('€')?'EUR':priceText.includes('£')?'GBP':priceText.includes('₹')?'INR':'');
  const img=card.match(/<img\b[^>]*>/i)?.[0]??'';
  result.push({name,description:text(prop('description'),5000),sku:text(prop('sku'),80),category:text(prop('category'),100),price,currency,stock_quantity:/\/OutOfStock$/.test(prop('availability'))?'0':'',imageUrl:image(prop('image')||attrs(img).src||attrs(img)['data-src'],sourceUrl),sourceUrl:link||sourceUrl});
 }
 return result;
}
export function parseProductPage(html:string,sourceUrl:string):ImportedProduct[]{
 const products:ImportedProduct[]=[];let visited=0;
 function walk(value:any,depth=0){
  if(!value||typeof value!=='object'||depth>12||visited++>3000||products.length>=100)return;
  const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
  if(types.some((t:unknown)=>typeof t==='string'&&/(?:^|\/)Product$/.test(t))&&typeof value.name==='string'){
   const offers=Array.isArray(value.offers)?value.offers:[value.offers];
   const offer=offers.find((o:any)=>o&&amount(o.price)!=='')??offers[0]??{};
   const qty=offer.inventoryLevel?.value??value.inventoryLevel?.value;
   products.push({name:text(value.name,160),description:text(value.description,5000),sku:text(value.sku,80),category:text(value.category,100),price:amount(offer.price),currency:/^[A-Z]{3}$/.test(offer.priceCurrency)?offer.priceCurrency:'',stock_quantity:Number.isInteger(qty)&&qty>=0?String(qty):offer.availability?.endsWith('/OutOfStock')?'0':'',imageUrl:image(value.image,sourceUrl),sourceUrl:image(value.url??offer.url,sourceUrl)||sourceUrl});
  }
  if(Array.isArray(value))for(const item of value)walk(item,depth+1);else for(const child of Object.values(value))walk(child,depth+1);
 }
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1]))continue;
  try{walk(JSON.parse(match[2]))}catch{/* Other blocks can still contain valid product data. */}
 }
 // HT Bazar renders collection cards in streamed HTML, without Product JSON-LD.
 if(!products.length&&['htbazar.com','www.htbazar.com'].includes(new URL(sourceUrl).hostname)&&new URL(sourceUrl).pathname.startsWith('/collections/')){
  // Never inspect script strings as rendered cards or execute saved-page JavaScript.
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
  for(const match of markup.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/gi)){
   if(products.length>=100)break;
   const card=match[1],title=card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
   const anchor=title?.[1].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
   const productUrl=image(anchor?decode(anchor[1]):'',sourceUrl);
   if(!anchor||!productUrl||new URL(productUrl).origin!==new URL(sourceUrl).origin||!new URL(productUrl).pathname.startsWith('/products/'))continue;
   // The first price text is the selling price; the nested struck price is excluded.
   const price=card.match(/<div\b[^>]*class=["'][^"']*items-baseline[^"']*["'][^>]*>\s*৳\s*([\d,.]+)/i);
   const value=amount(price?.[1].replace(/,/g,''));
   if(!value)continue;
   const photo=card.match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i);
   products.push({name:text(anchor[2],160),description:'',sku:'',category:'',price:value,currency:'BDT',stock_quantity:/\bout of stock\b/i.test(text(card,12000))?'0':'',imageUrl:image(photo?decode(photo[1]):'',sourceUrl),sourceUrl:productUrl});
  }
 }
 // Techland category cards expose their facts in HTML rather than Product JSON-LD.
 if(!products.length&&['techlandbd.com','www.techlandbd.com'].includes(new URL(sourceUrl).hostname)){
  const cards=[...html.matchAll(/<div\b[^>]*\bwire:key=["']listing-card-\d+["'][^>]*>/gi)];
  for(let i=0;i<Math.min(cards.length,100);i++){
   const remaining=html.slice(cards[i].index);let depth=0,end=remaining.length;
   for(const tag of remaining.matchAll(/<\/?div\b[^>]*>/gi)){depth+=/^<\//.test(tag[0])?-1:1;if(depth===0){end=tag.index!+tag[0].length;break}}
   const card=remaining.slice(0,end);
   const title=card.match(/<h2\b[^>]*class=["'][^"']*v2-card-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
   if(!title)continue;
   const anchor=[...card.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find(a=>a[2].includes('v2-card-title'));
   const imageTag=card.match(/<img\b[^>]*src=["']([^"']+)["']/i);
   const priceTag=card.match(/<div\b[^>]*class=["'][^"']*\btext-red-600\b[^"']*["'][^>]*>([^<]*)<\/div>/i);
   const rawPrice=text(priceTag?.[1],50).replace(/^৳\s*/,'').replace(/,/g,'');
   const description=[...card.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].slice(0,8).map(m=>text(m[1],500)).join(' | ');
   const productUrl=image(anchor?.[1],sourceUrl);
   if(!productUrl||new URL(productUrl).origin!==new URL(sourceUrl).origin)continue;
   products.push({name:text(title[1],160),description,sku:'',category:'',price:amount(rawPrice),currency:amount(rawPrice)!==''?'BDT':'',stock_quantity:/out of stock/i.test(text(card,12000))?'0':'',imageUrl:image(imageTag?.[1],sourceUrl),sourceUrl:productUrl});
  }
 }
 if(!products.length){
  const meta:Record<string,string>={};
  for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){
   const attrs:Record<string,string>={};for(const a of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1].toLowerCase()]=a[2]??a[3];
   if(attrs.property||attrs.name)meta[(attrs.property??attrs.name).toLowerCase()]=decode(attrs.content??'');
  }
  if(meta['og:type']?.includes('product')||meta['product:price:amount']){
   const name=text(meta['og:title'],160);
   if(name)products.push({name,description:text(meta['og:description']??meta.description,5000),sku:'',category:'',price:amount(meta['product:price:amount']),currency:/^[A-Z]{3}$/.test(meta['product:price:currency'])?meta['product:price:currency']:'',stock_quantity:'',imageUrl:image(meta['og:image'],sourceUrl),sourceUrl});
  }
 }
 if(!products.length)products.push(...productCards(html,sourceUrl));
 return products.filter((p,i,list)=>p.name&&list.findIndex(v=>v.name===p.name&&v.sku===p.sku&&v.price===p.price)===i);
}
