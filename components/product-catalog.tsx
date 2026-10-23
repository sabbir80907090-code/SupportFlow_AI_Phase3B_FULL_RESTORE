'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,Pencil,Trash2,RefreshCcw,X} from 'lucide-react';
import {getSupabase} from '@/lib/supabase';

type Product={id:string;business_id:string;name:string;sku:string|null;description:string|null;category:string|null;price:number;currency:string;stock_quantity:number;is_active:boolean;created_at:string};
type Form={name:string;sku:string;description:string;category:string;price:string;currency:string;stock_quantity:string;is_active:boolean};
const blank:Form={name:'',sku:'',description:'',category:'',price:'0',currency:'BDT',stock_quantity:'0',is_active:true};
const input='w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink outline-none focus:border-brand';
const panel='rounded-2xl border border-line bg-panel p-6 shadow-soft';
const button='rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50';
export function ProductCatalog({businessId,role}:{businessId:string;role:'owner'|'admin'|'agent'}){
 const sb=getSupabase();
 const canWrite=role==='owner'||role==='admin';
 const [products,setProducts]=useState<Product[]>([]);
 const [search,setSearch]=useState('');
 const [form,setForm]=useState<Form>(blank);
 const [editing,setEditing]=useState<string|null>(null);
 const [showForm,setShowForm]=useState(false);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!sb||!businessId)return;
  setLoading(true);setError('');
  try{
   const {data,error}=await sb.from('products').select('id,business_id,name,sku,description,category,price,currency,stock_quantity,is_active,created_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(500);
   if(error)throw error;
   setProducts((data??[]) as Product[]);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}
 },[sb,businessId]);
 useEffect(()=>{setProducts([]);setShowForm(false);setEditing(null);setNotice('');void load();},[load]);
 const filtered=useMemo(()=>products.filter(p=>(p.name+' '+(p.sku??'')+' '+(p.category??'')).toLowerCase().includes(search.toLowerCase())),[products,search]);
 const edit=(p:Product)=>{if(!canWrite)return;setEditing(p.id);setForm({name:p.name,sku:p.sku??'',description:p.description??'',category:p.category??'',price:String(p.price),currency:p.currency,stock_quantity:String(p.stock_quantity),is_active:p.is_active});setShowForm(true);setError('');};
 const start=()=>{setEditing(null);setForm({...blank});setShowForm(true);setError('');};
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(!sb||!canWrite||!businessId)return;
  setError('');setNotice('');
  const price=Number(form.price),stock=Number(form.stock_quantity);
  if(!form.name.trim()||form.name.trim().length>160||!Number.isFinite(price)||price<0||!Number.isSafeInteger(stock)||stock<0||!/^[A-Z]{3}$/.test(form.currency.toUpperCase())){setError('Please enter a valid name, non-negative price, whole-number stock and 3-letter currency.');return;}
  setSaving(true);
  try{
   const payload={business_id:businessId,name:form.name.trim(),sku:form.sku.trim()||null,description:form.description.trim()||null,category:form.category.trim()||null,price,currency:form.currency.toUpperCase(),stock_quantity:stock,is_active:form.is_active};
   const result=editing?await sb.from('products').update(payload).eq('id',editing).eq('business_id',businessId).select('id').single():await sb.from('products').insert(payload).select('id').single();
   if(result.error)throw result.error;
   setShowForm(false);setEditing(null);setForm({...blank});await load();setNotice(editing?'Product updated.':'Product added.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}
 };
 const remove=async(p:Product)=>{
  if(!sb||!canWrite||!window.confirm('Delete product "'+p.name+'"?'))return;
  setSaving(true);setError('');setNotice('');
  try{const {data,error}=await sb.from('products').delete().eq('id',p.id).eq('business_id',businessId).select('id');if(error)throw error;if(!data?.length)throw new Error('Product not found or permission denied.');await load();setNotice('Product deleted.');}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}
 };
 return <div className={panel}>
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-bold">Product catalog</h4><p className="mt-1 text-xs text-subtle">Manage products for this business only.</p></div><div className="flex gap-2"><button className="rounded-xl border border-line p-3" onClick={()=>void load()} title="Refresh products" disabled={loading}><RefreshCcw size={16}/></button>{canWrite&&<button className={button} onClick={start}><Plus size={15} className="mr-1 inline"/> Add product</button>}</div></div>
  {error&&<p role="alert" className="mb-4 rounded-xl border border-rose-400 p-3 text-sm text-rose-500">{error}</p>}
  {notice&&<p role="status" className="mb-4 text-sm text-emerald-600">{notice}</p>}
  {showForm&&canWrite&&<form onSubmit={save} className="mb-6 space-y-4 rounded-xl bg-canvas p-4">
    <div className="flex items-center justify-between"><h5 className="font-bold">{editing?'Edit product':'Add a new product'}</h5><button type="button" onClick={()=>setShowForm(false)} aria-label="Close"><X size={18}/></button></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Product name *<input required maxLength={160} className={input} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="text-sm">SKU (optional)<input maxLength={100} className={input} value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label>
      <label className="text-sm">Category<input maxLength={100} className={input} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>
      <label className="text-sm">Price *<input type="number" min="0" step="0.01" required className={input} value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>
      <label className="text-sm">Currency *<input required maxLength={3} minLength={3} className={input} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>
      <label className="text-sm">Stock quantity *<input type="number" step="1" min="0" required className={input} value={form.stock_quantity} onChange={e=>setForm({...form,stock_quantity:e.target.value})}/></label>
      <label className="text-sm md:col-span-2">Description<textarea maxLength={4000} rows={3} className={input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    </div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active (available to customers)</label>
    <button disabled={saving} className={button}>{saving?'Saving…':editing?'Save changes':'Add product'}</button>
  </form>}
  <input aria-label="Search products" className={input+' mb-4 max-w-md'} placeholder="Search by name, SKU or category..." value={search} onChange={e=>setSearch(e.target.value)}/>
  <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase text-subtle">{['Product','SKU','Category','Price','Stock','Status','Actions'].map(t=><th key={t} className="px-3 py-3">{t}</th>)}</tr></thead><tbody>{filtered.map(p=><tr className="border-b border-line" key={p.id}><td className="px-3 py-4 font-semibold">{p.name}</td><td className="px-3 py-4">{p.sku??'—'}</td><td className="px-3 py-4">{p.category??'—'}</td><td className="px-3 py-4">{p.currency} {Number(p.price).toFixed(2)}</td><td className="px-3 py-4">{p.stock_quantity}</td><td className="px-3 py-4">{p.is_active?'Active':'Inactive'}</td><td className="px-3 py-4">{canWrite?<div className="flex gap-2"><button aria-label={'Edit '+p.name} disabled={saving} className="rounded-lg border border-line p-2" onClick={()=>edit(p)}><Pencil size={15}/></button><button aria-label={'Delete '+p.name} disabled={saving} className="rounded-lg border border-rose-400 p-2 text-rose-500" onClick={()=>void remove(p)}><Trash2 size={15}/></button></div>:'—'}</td></tr>)}{filtered.length===0&&<tr><td colSpan={7} className="p-8 text-center text-subtle">{loading?'Loading products…':'No products found.'}</td></tr>}</tbody></table></div>
  <p className="mt-4 text-xs text-subtle">Showing up to 500 latest products per business. Owners and admins can make changes.</p>
 </div>;
}