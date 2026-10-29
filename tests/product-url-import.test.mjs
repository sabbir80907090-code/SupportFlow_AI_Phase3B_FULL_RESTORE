import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIP} from 'node:net';
import ts from 'typescript';
function compile(file,bindings,names){const s=readFileSync(new URL('../lib/'+file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');return new Function(...Object.keys(bindings),ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return '+names)(...Object.values(bindings));}
const {parseProductPage}=compile('product-url-import.ts',{},'{parseProductPage}');
const script=value=>'<script type="application/ld+json">'+JSON.stringify(value)+'</script>';
test('extracts product facts, relative image, zero price and explicit stock from schema data',()=>{
 const [p]=parseProductPage(script({'@graph':[{'@type':'Product',name:'Blue &amp; white shoes',description:'<p>Size 42</p>',sku:'SH42',image:['/shoe.jpg'],offers:{price:0,priceCurrency:'BDT',inventoryLevel:{value:12}}}]}),'https://shop.example/item');
 assert.equal(p.name,'Blue & white shoes');assert.equal(p.price,'0');assert.equal(p.stock_quantity,'12');assert.equal(p.imageUrl,'https://shop.example/shoe.jpg');assert.equal(p.description,'Size 42');
});
test('does not invent stock counts, aggregate prices, currency or missing photos',()=>{
 const [p]=parseProductPage(script({'@type':'Product',name:'Test',offers:{'@type':'AggregateOffer',lowPrice:'12',availability:'https://schema.org/InStock'}}),'https://shop.example/p');
 assert.equal(p.stock_quantity,'');assert.equal(p.price,'');assert.equal(p.currency,'');assert.equal(p.imageUrl,'');
});
test('supports product metadata fallback and ignores a generic page',()=>{
 const html='<meta content="product" property="og:type"><meta property="og:title" content="A &quot;shoe&quot;"><meta property="product:price:amount" content="22.50">';
 assert.equal(parseProductPage(html,'https://shop.example/p')[0].price,'22.50');assert.deepEqual(parseProductPage('<title>Homepage</title>','https://shop.example/'),[]);
});
test('malformed script does not hide a valid subsequent product, duplicates are removed',()=>{
 const p={'@type':'Product',name:'Product',offers:{price:2,priceCurrency:'USD'}};
 assert.equal(parseProductPage('<script type="application/ld+json">bad</script>'+script([p,p]),'https://shop.example/p').length,1);
});
const guard=compile('public-url-fetch.ts',{resolve4:async()=>[],request:()=>{},isIP},'{publicIPv4,publicUrl}');
test('rejects local networks, link-local, IPv6, encoded IP URLs and credential URLs',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','198.18.0.1','0.0.0.0'])assert.equal(guard.publicIPv4(ip),false);
 assert.equal(guard.publicIPv4('8.8.8.8'),true);
 for(const url of ['http://shop.example/','https://127.0.0.1/','https://0x7f000001/','https://localhost/','https://a.local/','https://user:pass@shop.example/','https://shop.example:8443/'])assert.throws(()=>guard.publicUrl(url));
 assert.equal(guard.publicUrl('https://shop.example/product#x').href,'https://shop.example/product');
});
test('rejects a hostname resolving to private IP before opening a socket',async()=>{
 let connected=false;const api=compile('public-url-fetch.ts',{resolve4:async()=>['127.0.0.1'],request:()=>{connected=true},isIP},'{fetchPublicUrl}');
 await assert.rejects(api.fetchPublicUrl('https://shop.example/',1000,'page'),/not allowed/);assert.equal(connected,false);
});
test('pins DNS result to HTTPS lookup and revalidates redirect destinations',async()=>{
 const {EventEmitter}=await import('node:events');let lookups=[];let calls=0;
 const request=(url,options,handler)=>{
  options.lookup(url.hostname,{},(error,address,family)=>{assert.equal(error,null);assert.equal(family,4);lookups.push(address)});
  const req=new EventEmitter();req.end=()=>{const res=new EventEmitter();res.destroy=()=>{};calls++;res.statusCode=302;res.headers={location:'https://internal.example/'};handler(res)};return req;
 };
 const api=compile('public-url-fetch.ts',{resolve4:async(host)=>host==='shop.example'?['8.8.8.8']:['10.1.2.3'],request,isIP},'{fetchPublicUrl}');
 await assert.rejects(api.fetchPublicUrl('https://shop.example/p',1000,'page'),/not allowed/);assert.equal(calls,1);assert.deepEqual(lookups,['8.8.8.8']);
});
test('unauthenticated import is rejected before any URL request or body read',async()=>{
 let fetched=false;
 const source=readFileSync(new URL('../app/api/products/import/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const post=new Function('authorizedBusiness','failure','fetchPublicUrl','parseProductPage','NextResponse',js+';return POST')(
  async()=>null,(message,status=400)=>Response.json({error:message},{status}),async()=>{fetched=true},()=>[],{json:Response.json}
 );
 const response=await post({text:()=>{throw Error('Should not read unauthenticated input')}});assert.equal(response.status,403);assert.equal(fetched,false);
});
test('Techland category uses per-card selling price and never footer stock or savings',()=>{
 const card='<div wire:key="listing-card-123"><div><a href="/ram-8gb"><img src="/ram.webp"></a><a href="/ram-8gb"><h2 class="v2-card-title">Example 8GB RAM</h2></a><ul><li>Capacity: 8GB</li></ul><div>Save: ৳500</div><div class="text-red-600 font-bold">৳7,700</div><div class="line-through">৳8,200</div></div></div>';
 const [p]=parseProductPage(card+'<footer>Out of stock FAQ</footer>','https://www.techlandbd.com/pc-components/shop-desktop-ram');
 assert.equal(p.name,'Example 8GB RAM');assert.equal(p.price,'7700');assert.equal(p.currency,'BDT');assert.equal(p.description,'Capacity: 8GB');assert.equal(p.stock_quantity,'');assert.equal(p.sourceUrl,'https://www.techlandbd.com/ram-8gb');
 assert.deepEqual(parseProductPage(card,'https://other.example/category'),[]);
});

test('category schema can return more than 20 products with an explicit 100-product bound',()=>{
 const products=Array.from({length:120},(_,i)=>({'@type':'Product',name:'Item '+i,offers:{price:i,priceCurrency:'BDT'}}));
 assert.equal(parseProductPage(script(products.slice(0,35)),'https://shop.example/category').length,35);
 assert.equal(parseProductPage(script(products),'https://shop.example/category').length,100);
});

test('HT Bazar collection reads selling prices and sources, leaves unknown stock blank',()=>{
 const card='<article><img src="/photo.jpg?a=1&amp;b=2"><h3><a href="/products/camera">WiFi &amp; HD Camera</a></h3><div class="flex items-baseline">৳ 699<span class="line-through">৳ 1,000</span></div><button>Add to Cart</button></article>';
 const [p]=parseProductPage(card+'<footer>Out of stock</footer>','https://htbazar.com/collections/electronics-and-gadgets');
 assert.equal(p.name,'WiFi & HD Camera');assert.equal(p.price,'699');assert.equal(p.stock_quantity,'');assert.equal(p.sourceUrl,'https://htbazar.com/products/camera');assert.equal(p.imageUrl,'https://htbazar.com/photo.jpg?a=1&b=2');
 assert.deepEqual(parseProductPage(card,'https://other.example/collections/a'),[]);
 assert.deepEqual(parseProductPage('<script>'+card+'</script>','https://htbazar.com/collections/a'),[]);
 assert.deepEqual(parseProductPage(card.replace('/products/camera','https://other.example/products/camera'),'https://htbazar.com/collections/a'),[]);
 assert.equal(parseProductPage(card.replace('Add to Cart','Out of stock'),'https://htbazar.com/collections/a')[0].stock_quantity,'0');
});

test('generic Product microdata works without a domain adapter',()=>{
 const html='<section itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Tea &amp; coffee</h1><meta itemprop="sku" content="T1"><p itemprop="description">Fresh tea</p><a itemprop="url" href="/tea"></a><img itemprop="image" src="/tea.jpg"><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="0"><meta itemprop="priceCurrency" content="BDT"><link itemprop="availability" href="https://schema.org/OutOfStock"></div></section>';
 const [p]=parseProductPage(html,'https://any-store.example/catalogue');
 assert.equal(p.name,'Tea & coffee');assert.equal(p.price,'0');assert.equal(p.stock_quantity,'0');assert.equal(p.currency,'BDT');assert.equal(p.sourceUrl,'https://any-store.example/tea');assert.equal(p.sku,'T1');
});
const genericCard=(price,name='Camera')=>'<li class="product"><a href="/item/'+name+'"><img src="/camera.jpg"><h2>'+name+'</h2></a><span class="price">'+price+'</span></li>';
test('generic cards preserve each product and exclude struck-through prices',()=>{
 const rows=parseProductPage(genericCard('<del>৳ 1,200</del><ins><span>৳ 900</span></ins>')+genericCard('৳ 2,500','Tripod'),'https://another-store.example/shop');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(p=>p.price),['900','2500']);assert.deepEqual(rows.map(p=>p.currency),['BDT','BDT']);assert.ok(rows.every(p=>p.stock_quantity===''));
});
test('generic cards leave ambiguous ranges, decimal conventions and dollar currency for review',()=>{
 const [range]=parseProductPage(genericCard('<span>৳ 10</span> – <span>৳ 20</span>'),'https://shop.example/');assert.equal(range.price,'');
 const [comma]=parseProductPage(genericCard('€ 19,99'),'https://shop.example/');assert.equal(comma.price,'');
 const [dollar]=parseProductPage(genericCard('$ 20'),'https://shop.example/');assert.equal(dollar.price,'20');assert.equal(dollar.currency,'');
});
test('generic fallback ignores scripts, ordinary editorial cards and offsite links',()=>{
 assert.deepEqual(parseProductPage('<script>'+genericCard('৳ 10')+'</script>','https://shop.example/'),[]);
 assert.deepEqual(parseProductPage(genericCard('৳ 10').replace('class="product"','class="blog-card"'),'https://shop.example/'),[]);
 assert.deepEqual(parseProductPage(genericCard('৳ 10').replace('/item/Camera','https://other.example/product'),'https://shop.example/'),[]);
});
test('generic fallback is capped and schema products retain their own source links',()=>{
 assert.equal(parseProductPage(Array.from({length:120},(_,i)=>genericCard('৳ 10','Item'+i)).join(''),'https://shop.example/').length,100);
 const rows=parseProductPage(script([{'@type':'Product',name:'One',url:'/one'},{'@type':'Product',name:'Two',offers:{url:'/two'}}]),'https://shop.example/category');
 assert.deepEqual(rows.map(p=>p.sourceUrl),['https://shop.example/one','https://shop.example/two']);
});
test('generic price matching does not read compare-at prices and main metadata precedes recommendations',()=>{
 const card=genericCard('৳ 800').replace('<span class="price">','<span class="compare-at-price">৳ 1200</span><span class="price">');
 assert.equal(parseProductPage(card,'https://shop.example/')[0].price,'800');
 const meta='<meta property="og:type" content="product"><meta property="og:title" content="Main item"><meta property="product:price:amount" content="25">';
 const rows=parseProductPage(meta+card,'https://shop.example/main');assert.equal(rows.length,1);assert.equal(rows[0].name,'Main item');assert.equal(rows[0].price,'25');
});

test('Star Tech ListItem cards use current price, never savings or old price',()=>{
 const card=(name,price)=>`<div class="p-item" itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem"><meta itemprop="name" content="${name}"><meta itemprop="url" content="https://www.startech.com.bd/${name}"><div class="p-item-inner"><div class="marks"><span class="mark">Save: 1,499৳</span></div><div class="p-item-img"><a href="/${name}"><img itemprop="image" src="/phone.webp"></a></div><div class="p-item-details"><h4 class="p-item-name"><a href="/${name}">${name}</a></h4><div class="p-item-price">${price}</div><div class="actions">Buy Now</div></div></div></div>`;
 const rows=parseProductPage(card('phone-one','<span class="price-new">25,500৳</span><span class="price-old">26,999৳</span>')+card('phone-two','<span>32,999৳</span>'),'https://www.startech.com.bd/mobile-phone?page=2');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(p=>p.price),['25500','32999']);assert.ok(rows.every(p=>p.currency==='BDT'&&p.stock_quantity===''));assert.equal(rows[0].sourceUrl,'https://www.startech.com.bd/phone-one');assert.equal(rows[0].imageUrl,'https://www.startech.com.bd/phone.webp');
 assert.equal(parseProductPage(card('coming-soon','<span>Coming Soon</span>'),'https://www.startech.com.bd/mobile-phone')[0].price,'');
});
