import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/browser-product-import.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const publicUrl=v=>{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname==='127.0.0.1')throw Error('Use a public HTTPS URL');return u;};
function api(fetch=()=>{throw Error('unexpected fetch')},resolve4=async()=>['8.8.8.8']){return new Function('fetch','resolve4','publicUrl','publicIPv4','Buffer',js+';return {normalizeBrowserProducts,readBrowserProducts,validateBrowserSource,browserScrapeBody}')(fetch,resolve4,publicUrl,ip=>ip==='8.8.8.8',Buffer);}
const evidence='Camera Pro costs ৳ 1,250.50.';
const product={name:'Camera Pro',evidence,price:'1250.50',currency:'BDT',stock_quantity:'50',sourceUrl:'https://shop.example/camera',imageUrl:'https://cdn.example/camera.jpg',description:'Invented description'};
const page={markdown:evidence+'\n[Product](https://shop.example/camera)\n![Camera](https://cdn.example/camera.jpg)',json:{products:[product]}};
test('only grounded drafts pass; stock remains unknown and unsupported descriptions are removed',()=>{
 const [p]=api().normalizeBrowserProducts(page,'https://shop.example/list');assert.equal(p.name,'Camera Pro');assert.equal(p.price,'1250.50');assert.equal(p.currency,'BDT');assert.equal(p.stock_quantity,'');assert.equal(p.description,'');assert.equal(p.sourceUrl,product.sourceUrl);assert.equal(p.imageUrl,product.imageUrl);
 assert.deepEqual(api().normalizeBrowserProducts({...page,json:{products:[{...product,evidence:'invented',name:'Injected'}]}},'https://shop.example/list'),[]);
});
test('never guesses price/currency or follows an AI-invented link',()=>{
 const [p]=api().normalizeBrowserProducts({...page,json:{products:[{...product,price:'999',currency:'USD',sourceUrl:'https://elsewhere.example/camera',imageUrl:'https://evil.example/x'}]}},'https://shop.example/list');assert.equal(p.price,'');assert.equal(p.currency,'');assert.equal(p.sourceUrl,'https://shop.example/list');assert.equal(p.imageUrl,'');
});
test('duplicate and oversized model arrays are bounded',()=>{
 assert.equal(api().normalizeBrowserProducts({...page,json:{products:Array(150).fill(product)}},'https://shop.example/list').length,1);
 assert.deepEqual(api().normalizeBrowserProducts({json:{products:[product]}},'https://shop.example'),[]);
});
test('source validation rejects private DNS before a provider request',async()=>{
 await assert.rejects(api(undefined,async()=>['10.0.0.1']).validateBrowserSource('https://private.example/'),/not allowed/);
 await assert.rejects(api().validateBrowserSource('http://shop.example/'),/public/);
});
test('provider receives fixed endpoint and extraction only, without target cookies or browser actions',async()=>{
 const client=api(async(url,options)=>{
  assert.equal(url,'https://api.firecrawl.dev/v2/scrape');assert.equal(options.headers.authorization,'Bearer test-key');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);
  assert.equal(body.proxy,'basic');assert.equal(body.maxAge,0);assert.equal(body.storeInCache,false);assert.equal(body.skipTlsVerification,false);assert.equal(body.actions,undefined);assert.equal(body.headers,undefined);assert.equal(body.formats[1].type,'json');
  return Response.json({success:true,data:page});
 });assert.equal((await client.readBrowserProducts('https://shop.example/list','test-key')).length,1);
});
test('provider errors never expose raw response or secrets',async()=>{
 await assert.rejects(api(async()=>new Response('secret',{status:401})).readBrowserProducts('https://shop.example','key'),/credentials need updating/);
 await assert.rejects(api(async()=>Response.json({success:true,data:{...page,metadata:{statusCode:403}}})).readBrowserProducts('https://shop.example','key'),/could not access/);
 await assert.rejects(api(async()=>new Response('x'.repeat(3145729))).readBrowserProducts('https://shop.example','key'),/too large/);
});
const routeSource=readFileSync(new URL('../app/api/products/browser-import/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function route(auth,env,read=()=>{throw Error('must not call provider')}){return new Function('authorizedBusiness','failure','validateBrowserSource','readBrowserProducts','NextResponse','process',ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {POST,GET};')(auth,(error,status=400)=>Response.json({error},{status}),async u=>u,read,{json:Response.json},{env});}
test('owner authentication and configured service are required before reading request body',async()=>{
 const req={text(){throw Error('must not read')}};
 assert.equal((await route(async()=>null,{FIRECRAWL_API_KEY:'key'}).POST(req)).status,403);
 assert.equal((await route(async()=>({businessId:'owner'}),{}).POST(req)).status,503);
});
test('quota binds to authenticated business, blocks provider on limit or DB failure',async()=>{
 for(const result of [{data:false,error:null},{data:null,error:{message:'db error'}}]){
  const auth=async()=>({businessId:'actual-owner',database:{rpc:async(name,args)=>{assert.equal(name,'consume_browser_import_quota');assert.deepEqual(args,{p_business_id:'actual-owner'});return result;}}});
  const res=await route(auth,{FIRECRAWL_API_KEY:'key'}).POST({text:async()=>JSON.stringify({url:'https://shop.example',businessId:'other'})});assert.equal(res.status,result.error?503:429);
 }
});
test('successful browser route returns drafts, never writes product records',async()=>{
 const auth=async()=>({businessId:'owner',database:{rpc:async()=>({data:true,error:null})}});
 const res=await route(auth,{FIRECRAWL_API_KEY:'key'},async()=>[product]).POST({text:async()=>JSON.stringify({url:'https://shop.example'})});const body=await res.json();assert.equal(res.status,200);assert.equal(body.mode,'browser_ai');assert.equal(body.products.length,1);
});
test('price-only evidence must belong to the linked product section',()=>{
 const first={...product,name:'Phone One',sourceUrl:'https://shop.example/one',evidence:'৳ 10',price:'10'},second={...product,name:'Phone Two',sourceUrl:'https://shop.example/two',evidence:'৳ 20',price:'20'};
 const markdown='[Phone One](https://shop.example/one)\n৳ 10\n[Phone Two](https://shop.example/two)\n৳ 20';
 assert.equal(api().normalizeBrowserProducts({markdown,json:{products:[first,second]}},'https://shop.example/list').length,2);
 assert.equal(api().normalizeBrowserProducts({markdown,json:{products:[{...first,evidence:'৳ 20',price:'20'},second]}},'https://shop.example/list').length,1);
});
test('anonymous provider access omits Authorization and needs an explicit server flag',async()=>{
 const client=api(async(_url,options)=>{assert.equal(options.headers.authorization,undefined);return Response.json({success:true,data:page});});
 assert.equal((await client.readBrowserProducts('https://shop.example/list','')).length,1);
 const auth=async()=>({businessId:'owner',database:{rpc:async()=>({data:true,error:null})}});
 const response=await route(auth,{FIRECRAWL_ALLOW_ANONYMOUS:'true'},async()=>[product]).POST({text:async()=>JSON.stringify({url:'https://shop.example'})});assert.equal(response.status,200);
});
test('browser-rendered cards support markdown link titles and price before product name',()=>{
 const one={...product,name:'Laptop One',sourceUrl:'https://shop.example/one',price:'295.99',currency:'USD',evidence:'$295.99'},two={...product,name:'Laptop Two',sourceUrl:'https://shop.example/two',price:'299',currency:'USD',evidence:'$299'};
 const markdown='![item](https://cdn.example/a.jpg)\n#### $295.99\n#### [Laptop One](https://shop.example/one "Full model")\nDescription\n![item](https://cdn.example/a.jpg)\n#### $299\n#### [Laptop Two](https://shop.example/two "Other model")';
 const rows=api().normalizeBrowserProducts({markdown,json:{products:[one,two]}},'https://shop.example/list');assert.equal(rows.length,2);assert.equal(rows[0].price,'295.99');assert.equal(rows[0].currency,'');
 assert.equal(api().normalizeBrowserProducts({markdown,json:{products:[{...one,evidence:'$299',price:'299'},two]}},'https://shop.example/list').length,1);
});
