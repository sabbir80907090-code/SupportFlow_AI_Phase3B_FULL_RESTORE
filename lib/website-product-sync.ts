import {createHash} from 'node:crypto';
import {adminDb} from '@/lib/telegram-server';
import {discoverPublicStoreUrls,readPublicProductPage} from '@/lib/product-site-import';
import type {ImportedProduct} from '@/lib/product-url-import';

const BATCH=10;
type Db=ReturnType<typeof adminDb>;
type Connection={id:string;business_id:string;website_url:string;frequency_minutes:number;status:string};
function hash(p:ImportedProduct){return createHash('sha256').update(JSON.stringify([p.name,p.description,p.sku,p.category,p.price,p.currency,p.stock_quantity])).digest('hex');}
export async function processWebsiteSync(db:Db,connection:Connection){
 const {data:run,error:runError}=await db.from('website_sync_runs').insert({connection_id:connection.id,status:'running'}).select('id').single();
 if(runError||!run)throw Error('Could not start sync run');
 let discovered=0,processed=0,created=0,updated=0;let fatal='';
 try{
  const discovery=await discoverPublicStoreUrls(connection.website_url);
  discovered=discovery.urls.length;
  const pageRows=discovery.urls.map(page_url=>({connection_id:connection.id,page_url,status:'pending'}));
  for(let i=0;i<pageRows.length;i+=500){
   const {error}=await db.from('website_sync_pages').upsert(pageRows.slice(i,i+500),{onConflict:'connection_id,page_url',ignoreDuplicates:true});
   if(error)throw Error('Could not queue website pages');
  }
  const {data:pages,error:pageError}=await db.from('website_sync_pages').select('id,page_url,attempts').eq('connection_id',connection.id).eq('status','pending').order('created_at').limit(BATCH);
  if(pageError)throw Error('Could not load website page queue');
  for(const page of pages??[]){
   try{
    const result=await readPublicProductPage(page.page_url);
    for(const p of result.products){
     const source=result.url;
     const fingerprint=hash(p);
     const {data:existing,error:lookupError}=await db.from('business_products').select('id,source_hash').eq('business_id',connection.business_id).eq('source_connection_id',connection.id).eq('source_url',source).maybeSingle();
     if(lookupError)throw Error('Product lookup failed');
     const payload={name:p.name,description:p.description||null,sku:p.sku||null,category:p.category||null,price:p.price===''?0:Number(p.price),currency:/^[A-Z]{3}$/.test(p.currency)?p.currency:'BDT',stock_quantity:p.stock_quantity===''?null:Number(p.stock_quantity),source_connection_id:connection.id,source_url:source,source_hash:fingerprint,updated_at:new Date().toISOString()};
     if(existing){
      if(existing.source_hash!==fingerprint){const {error}=await db.from('business_products').update(payload).eq('id',existing.id).eq('business_id',connection.business_id);if(error)throw Error('Product update failed');updated++;}
     }else{
      const {error}=await db.from('business_products').insert({...payload,business_id:connection.business_id,is_active:true});
      if(error)throw Error('Product insert failed');created++;
     }
    }
    await db.from('website_sync_pages').update({status:'done',processed_at:new Date().toISOString(),attempts:(page.attempts??0)+1,last_error:null}).eq('id',page.id).eq('connection_id',connection.id);
    processed++;
   }catch(e){
    const attempts=(page.attempts??0)+1;
    await db.from('website_sync_pages').update({status:attempts>=3?'error':'pending',attempts,last_error:'Page could not be read or synced'}).eq('id',page.id).eq('connection_id',connection.id);
   }
  }
  const {count:remaining}=await db.from('website_sync_pages').select('id',{count:'exact',head:true}).eq('connection_id',connection.id).eq('status','pending');
  const complete=(remaining??0)===0;
  const now=new Date().toISOString();
  await db.from('website_sync_connections').update({
   status:'active',last_sync_at:now,last_status:complete?'completed':'partial',
   last_error:discovery.warnings.join(' ').slice(0,500)||null,
   pages_discovered:discovered,pages_processed:processed,products_synced:created+updated,
   next_sync_at:complete?new Date(Date.now()+connection.frequency_minutes*60000).toISOString():now,
   updated_at:now
  }).eq('id',connection.id).eq('business_id',connection.business_id);
  const status=complete?'completed':'partial';
  await db.from('website_sync_runs').update({status,pages_discovered:discovered,pages_processed:processed,products_created:created,products_updated:updated,finished_at:now,error:discovery.warnings.join(' ').slice(0,500)||null}).eq('id',run.id);
  return {status,discovered,processed,created,updated,remaining:remaining??0};
 }catch(e){
  fatal=e instanceof Error?e.message:'Sync failed';
  const now=new Date().toISOString();
  await db.from('website_sync_connections').update({last_status:'failed',last_error:fatal,next_sync_at:new Date(Date.now()+3600000).toISOString(),updated_at:now}).eq('id',connection.id);
  await db.from('website_sync_runs').update({status:'failed',error:fatal,finished_at:now,pages_discovered:discovered,pages_processed:processed,products_created:created,products_updated:updated}).eq('id',run.id);
  throw e;
 }
}
export async function processDueWebsiteSync(db:Db){
 const {data,error}=await db.from('website_sync_connections').select('id,business_id,website_url,frequency_minutes,status').eq('status','active').lte('next_sync_at',new Date().toISOString()).order('next_sync_at').limit(5);
 if(error)throw Error('Could not load due website syncs');
 const results=[];
 for(const c of (data??[]) as Connection[]){
  try{results.push({connectionId:c.id,...await processWebsiteSync(db,c)});}
  catch{results.push({connectionId:c.id,status:'failed'});}
 }
 return results;
}
