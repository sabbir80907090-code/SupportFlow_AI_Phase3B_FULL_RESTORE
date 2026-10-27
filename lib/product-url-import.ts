export type ImportedProduct={name:string;description:string;sku:string;category:string;price:string;currency:string;stock_quantity:string;imageUrl:string;sourceUrl:string};
function decode(text:string){return text.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(match,decimal,hex)=>{const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(decimal||hex){const code=parseInt(decimal||hex,decimal?10:16);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}return named[match.toLowerCase()]??match});}
const text=(v:unknown,max:number)=>decode(typeof v==='string'?v:typeof v==='number'?String(v):'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const amount=(v:unknown)=>{const value=typeof v==='number'?String(v):typeof v==='string'?v.trim():'';return /^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)<1e12?value:''};
function image(value:any,base:string){const raw=typeof value==='string'?value:Array.isArray(value)?value[0]:value?.url??value?.contentUrl;try{const target=typeof raw==='object'?raw?.url:raw;if(typeof target!=='string'||!target.trim())return '';const u=new URL(target,base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
export function parseProductPage(html:string,sourceUrl:string):ImportedProduct[]{
 const products:ImportedProduct[]=[];let visited=0;
 function walk(value:any,depth=0){
  if(!value||typeof value!=='object'||depth>12||visited++>3000||products.length>=20)return;
  const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
  if(types.some((t:unknown)=>typeof t==='string'&&/(?:^|\/)Product$/.test(t))&&typeof value.name==='string'){
   const offers=Array.isArray(value.offers)?value.offers:[value.offers];
   const offer=offers.find((o:any)=>o&&amount(o.price)!=='')??offers[0]??{};
   const qty=offer.inventoryLevel?.value??value.inventoryLevel?.value;
   products.push({name:text(value.name,160),description:text(value.description,5000),sku:text(value.sku,80),category:text(value.category,100),price:amount(offer.price),currency:/^[A-Z]{3}$/.test(offer.priceCurrency)?offer.priceCurrency:'',stock_quantity:Number.isInteger(qty)&&qty>=0?String(qty):offer.availability?.endsWith('/OutOfStock')?'0':'',imageUrl:image(value.image,sourceUrl),sourceUrl});
  }
  if(Array.isArray(value))for(const item of value)walk(item,depth+1);else for(const child of Object.values(value))walk(child,depth+1);
 }
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1]))continue;
  try{walk(JSON.parse(match[2]))}catch{/* Other blocks can still contain valid product data. */}
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
 return products.filter((p,i,list)=>p.name&&list.findIndex(v=>v.name===p.name&&v.sku===p.sku&&v.price===p.price)===i);
}
