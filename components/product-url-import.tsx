'use client';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import type {ImportedProduct} from '@/lib/product-url-import';
export function ProductUrlImport({onImport}:{onImport:(product:ImportedProduct,photo:File|null,preview:string)=>void}){
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const [url,setUrl]=useState(''),[products,setProducts]=useState<ImportedProduct[]>([]),[selected,setSelected]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function request(body:object){
  const session=await getSupabase()?.auth.getSession();const token=session?.data.session?.access_token;if(!token)throw Error('Sign in again');
  const result=await fetch('/api/products/import',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
  if(!result.ok){const failure=await result.json();throw Error(failure.error??'Import failed')};return result;
 }
 async function load(){if(busy)return;setBusy(true);setProducts([]);setError('');try{const response=await request({url});setProducts((await response.json()).products);setSelected(0)}catch(e){setError(e instanceof Error?e.message:'Import failed')}finally{setBusy(false)}}
 async function useProduct(){const product=products[selected];if(!product||busy)return;setBusy(true);setError('');let photo:File|null=null,preview='';
  try{if(product.imageUrl){const image=await request({url:product.imageUrl,action:'image'});const blob=await image.blob();photo=new File([blob],'imported-product.'+(blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'),{type:blob.type});preview=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Image preview unavailable'));reader.readAsDataURL(blob)});}}
  catch{setError('Product details loaded. The website image could not be imported; upload a photo manually.');}
  if(!mounted.current)return;onImport(product,photo,preview);setBusy(false);
 }
 return <section className="space-y-3 rounded-2xl border border-line bg-panel p-5"><h5 className="font-bold">Import from website</h5><p className="text-sm text-subtle">Paste a public HTTPS product details URL. Review the imported details, currency and stock before saving. This is a one-time copy.</p><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Product website URL" type="url" maxLength={2048} disabled={busy} className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-4 py-3 text-sm" placeholder="https://your-store.com/products/item" value={url} onChange={e=>{setUrl(e.target.value);setProducts([]);setError('')}}/><button disabled={busy||!url.trim()} onClick={()=>void load()} className="rounded-xl bg-brand px-4 py-3 text-sm text-white disabled:opacity-50">{busy?'Loading...':'Fetch product'}</button></div>{products.length>0&&<div className="flex flex-wrap items-center gap-3"><select aria-label="Choose website product" disabled={busy} className="max-w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{products.map((p,i)=><option value={i} key={i}>{p.name}{p.price?' · '+p.currency+' '+p.price:''}</option>)}</select><button disabled={busy} onClick={()=>void useProduct()} className="rounded-xl border border-line px-4 py-2 text-sm disabled:opacity-50">Review in product form</button></div>}{error&&<p role="alert" className="text-sm text-rose-500">{error}</p>}</section>;
}
