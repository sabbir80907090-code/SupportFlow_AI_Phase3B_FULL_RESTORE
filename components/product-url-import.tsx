'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {parseProductPage,type ImportedProduct} from '@/lib/product-url-import';
import {importPayload,productIssue,runImportBatch,type ImportRow} from '@/lib/product-batch-import';
const field='w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-2 text-sm';
export function ProductUrlImport({businessId,onSaved}:{businessId:string;onSaved:()=>Promise<void>}){
 const mounted=useRef(true),locked=useRef(false),stop=useRef(false),allRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop.current=true;}},[]);
 const [url,setUrl]=useState(''),[rows,setRows]=useState<ImportRow[]>([]),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [stock,setStock]=useState(''),[currency,setCurrency]=useState('BDT'),[active,setActive]=useState(true),[copyImages,setCopyImages]=useState(true);
 const pending=rows.filter(r=>!r.saved),selected=pending.filter(r=>r.selected),allSelected=pending.length>0&&selected.length===pending.length;
 useEffect(()=>{if(allRef.current)allRef.current.indeterminate=selected.length>0&&!allSelected;},[selected.length,allSelected]);
 async function request(body:object){
  const session=await getSupabase()?.auth.getSession();const token=session?.data.session?.access_token;if(!token)throw Error('Sign in again');
  const result=await fetch('/api/products/import',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(!result.ok){const failure=await result.json().catch(()=>null);throw Error(failure?.error??'Import failed')};return result;
 }
 function showProducts(products:ImportedProduct[]){
   setRows(old=>products.map(product=>{
    // Keep saved IDs when the same page is fetched again during this session.
    const previous=old.find(r=>r.product.sourceUrl===product.sourceUrl&&r.product.name===product.name&&r.product.sku===product.sku);
    return previous??{id:crypto.randomUUID(),product,selected:false,saved:false,error:'',warning:''};
   }));setLoaded(true);
 }
 async function loadFile(file:File){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');
  try{
   const source=new URL(url.trim());
   if(source.protocol!=='https:'||source.username||source.password)throw Error('Enter the original public HTTPS page URL above first.');
   if(file.size>2097152)throw Error('Saved page must be no larger than 2 MB.');
   if(!/\.html?$/i.test(file.name))throw Error('Choose a saved HTML page (.html or .htm).');
   const products=parseProductPage(await file.text(),source.href);
   if(!mounted.current)return;
   if(!products.length)throw Error('No readable products in this saved page. Open the product list fully before saving it.');
   showProducts(products);setNotice('Loaded from a saved page. Review prices before adding; the saved copy may be outdated.');
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not read the saved page.');}
  finally{locked.current=false;if(mounted.current)setBusy(false);}
 }
 async function load(){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');
  try{
   const response=await request({url:url.trim()});const data=await response.json();if(!mounted.current)return;
   const products:ImportedProduct[]=data.products??[];
   showProducts(products);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Import failed');}
  finally{locked.current=false;if(mounted.current)setBusy(false);}
 }
 function update(id:string,change:Partial<ImportedProduct>){setRows(old=>old.map(r=>r.id===id?{...r,product:{...r.product,...change},error:''}:r));}
 async function addSelected(){
  if(locked.current||!selected.length)return;
  if(selected.some(r=>productIssue(r.product))){setRows(old=>old.map(r=>r.selected&&!r.saved?{...r,error:productIssue(r.product)}:r));setError('Complete the highlighted product details, then add selected products.');return;}
  const db=getSupabase();if(!db){setError('Sign in again.');return;}
  locked.current=true;stop.current=false;setBusy(true);setSaving(true);setError('');setNotice('');let saved=0,failed=0;
  try{
   await runImportBatch(selected,async row=>{
    // Reconcile a previous request whose response was lost before inserting again.
    const existing=await db.from('business_products').select('id').eq('business_id',businessId).eq('id',row.id).maybeSingle();
    if(existing.error)throw Error(existing.error.message);
    if(existing.data)return;
    if(copyImages&&row.product.imageUrl&&!row.imagePath){
     try{
      const response=await request({url:row.product.imageUrl,action:'image'});const blob=await response.blob();
      const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
      const path=businessId+'/'+row.id+'.'+ext;
      const upload=await db.storage.from('business-product-images').upload(path,blob,{contentType:blob.type,upsert:true});
      if(upload.error)throw Error(upload.error.message);row.imagePath=path;row.warning='';
     }catch{row.warning='Added without a photo. You can upload one later.';}
    }
    const result=await db.from('business_products').insert(importPayload(row,businessId,active));
    if(result.error)throw Error(result.error.message);
   },row=>{if(row.saved)saved++;else failed++;if(mounted.current)setRows(old=>old.map(r=>r.id===row.id?row:r));},()=>stop.current);
   if(mounted.current){setNotice(`${saved} added · ${failed} failed${stop.current?' · stopped; remaining products are still selected':''}. Successful products will not be added again from this list.`);await onSaved();}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not refresh the catalogue.');}
  finally{locked.current=false;if(mounted.current){setBusy(false);setSaving(false);}}
 }
 return <section className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-label="Import products from website">
  <div><h5 className="font-bold">Import products from website</h5><p className="mt-1 text-sm text-subtle">Paste a product or supported category page → select products → review details → add selected.</p><p className="mt-1 text-xs text-subtle">Up to 100 readable products per page. Other pages, pagination and JavaScript-only products are not automatically included. This is a one-time copy.</p></div>
  <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Product website URL" type="url" maxLength={2048} disabled={busy} className={field+' flex-1'} placeholder="https://your-store.com/products" value={url} onChange={e=>setUrl(e.target.value)}/><button disabled={busy||!url.trim()} onClick={()=>void load()} className="rounded-xl bg-brand px-4 py-3 text-sm text-white">{busy&&!saving?'Loading…':'Fetch products'}</button></div>
  <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm">Website blocked the request? Import a saved page</summary><p className="mt-2 text-xs text-subtle">Open the product list in your browser, wait for it to load, then use Save page as → HTML. Keep the original page URL above and choose the .html file below. Up to 2 MB; only readable products in that copy are included.</p><label className="mt-3 block text-sm">Saved HTML page<input className={field+' mt-1'} type="file" accept=".html,.htm,text/html" disabled={busy||!url.trim()} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void loadFile(file);}}/></label></details>
  {loaded&&rows.length===0&&<p role="status" className="text-sm text-subtle">No supported products found. Try a direct product page.</p>}
  {rows.length>0&&<>
   <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-11 items-center gap-2 font-semibold"><input ref={allRef} type="checkbox" checked={allSelected} disabled={busy||!pending.length} onChange={e=>{const checked=e.target.checked;setRows(old=>old.map(r=>r.saved?r:{...r,selected:checked}));}}/>Select all</label><span aria-live="polite" className="text-sm text-subtle">{selected.length} selected · {rows.length} found · {rows.filter(r=>r.saved).length} added</span><button disabled={busy||!selected.length} className="min-h-11 text-sm text-brand underline" onClick={()=>setRows(old=>old.map(r=>({...r,selected:false})))}>Clear selection</button></div>
   <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Set stock or currency for selected products</summary><p className="mt-2 text-xs text-subtle">Only apply quantities and currency you have verified. Leave stock blank if unknown. No quantity is assumed.</p><div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Stock<input className={field} type="number" min="0" step="1" value={stock} disabled={busy} onChange={e=>setStock(e.target.value)}/></label><button disabled={busy||!selected.length||!/^\d+$/.test(stock)||Number(stock)>2147483647} className="rounded-xl border border-line p-3 text-sm" onClick={()=>setRows(old=>old.map(r=>r.selected&&!r.saved?{...r,product:{...r.product,stock_quantity:stock},error:''}:r))}>Apply stock</button><label className="text-sm">Currency<input className={field} maxLength={3} value={currency} disabled={busy} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label><button disabled={busy||!selected.length||!/^[A-Z]{3}$/.test(currency)} className="rounded-xl border border-line p-3 text-sm" onClick={()=>setRows(old=>old.map(r=>r.selected&&!r.saved?{...r,product:{...r.product,currency},error:''}:r))}>Apply currency</button></div></details>
   <ul className="grid max-h-[65vh] gap-3 overflow-y-auto p-1 sm:grid-cols-2" aria-label="Products found on page">{rows.map(row=><li key={row.id} className={`min-w-0 rounded-xl border p-4 ${row.selected?'border-brand':'border-line'}`}>
    <label className="flex min-h-11 items-start gap-3 font-semibold"><input type="checkbox" className="mt-1 shrink-0" checked={row.selected} disabled={busy||row.saved} onChange={e=>{const checked=e.target.checked;setRows(old=>old.map(r=>r.id===row.id?{...r,selected:checked}:r));}}/><span className="break-words">{row.product.name}{row.saved&&<span className="ml-2 text-xs text-emerald-600">Added ✓</span>}</span></label>
    <fieldset disabled={busy||row.saved} className="mt-3 grid grid-cols-2 gap-2"><legend className="sr-only">Details for {row.product.name}</legend><label className="text-xs">Price<input aria-label={`Price for ${row.product.name}`} className={field} type="number" min="0" step="0.01" placeholder="Required" value={row.product.price} onChange={e=>update(row.id,{price:e.target.value})}/></label><label className="text-xs">Currency<input aria-label={`Currency for ${row.product.name}`} className={field} maxLength={3} placeholder="BDT" value={row.product.currency} onChange={e=>update(row.id,{currency:e.target.value.toUpperCase()})}/></label><label className="col-span-2 text-xs">Stock quantity (optional)<input aria-label={`Stock for ${row.product.name}`} className={field} type="number" min="0" step="1" placeholder="Blank = unknown" value={row.product.stock_quantity} onChange={e=>update(row.id,{stock_quantity:e.target.value})}/></label><details className="col-span-2"><summary className="cursor-pointer py-2 text-xs text-brand">More details</summary><label className="block text-xs">Name<input className={field} maxLength={160} value={row.product.name} onChange={e=>update(row.id,{name:e.target.value})}/></label><label className="block text-xs">SKU<input className={field} maxLength={80} value={row.product.sku} onChange={e=>update(row.id,{sku:e.target.value})}/></label><label className="block text-xs">Category<input className={field} maxLength={100} value={row.product.category} onChange={e=>update(row.id,{category:e.target.value})}/></label><label className="block text-xs">Description<textarea className={field} maxLength={5000} value={row.product.description} onChange={e=>update(row.id,{description:e.target.value})}/></label><p className="mt-2 break-all text-xs text-subtle">Source: {row.product.sourceUrl}</p></details></fieldset>
    {row.error&&<p role="alert" className="mt-2 text-xs text-rose-600">{row.error}</p>}{row.warning&&row.saved&&<p className="mt-2 text-xs text-amber-600">{row.warning}</p>}
   </li>)}</ul>
   <div className="space-y-3 rounded-xl border border-line bg-canvas p-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={copyImages} onChange={e=>setCopyImages(e.target.checked)}/>Copy product photos when available</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={active} onChange={e=>setActive(e.target.checked)}/>Make added products active and available to AI</label><button disabled={busy||!selected.length} onClick={()=>void addSelected()} className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white">{saving?'Adding products…':`Add selected (${selected.length})`}</button>{saving&&<button className="min-h-11 text-sm underline" onClick={()=>{stop.current=true;setNotice('Stopping after the current product…');}}>Stop after current product</button>}<p className="text-xs text-subtle">Products are added to the current workspace. Keep this page open until complete. Failed items stay selected for correction and retry.</p></div>
  </>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
 </section>;
}
