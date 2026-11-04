'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

type LabelOrder={
 order_number:string;
 delivery_name:string|null;
 delivery_phone:string|null;
 delivery_email:string|null;
 delivery_address:string|null;
 product_details:string;
 total_amount:number|null;
 currency:string;
 status:string;
 created_at:string;
};

const field='mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-brand';
const toggle='flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium';

export function OrderLabel({order,businessName}:{order:LabelOrder;businessName:string}){
 const [open,setOpen]=useState(false);
 return <><button onClick={()=>setOpen(true)} className="mt-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold" aria-label={`Customize and print order ${order.order_number}`}>Print / Edit label</button>{open&&createPortal(<LabelDialog order={order} businessName={businessName} close={()=>setOpen(false)}/>,document.body)}</>;
}

function LabelDialog({order,businessName,close}:{order:LabelOrder;businessName:string;close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [sender,setSender]=useState(businessName);
 const [title,setTitle]=useState('ORDER PACKING SLIP');
 const [orderNumber,setOrderNumber]=useState(order.order_number);
 const [name,setName]=useState(order.delivery_name??'');
 const [phone,setPhone]=useState(order.delivery_phone??'');
 const [email,setEmail]=useState(order.delivery_email??'');
 const [address,setAddress]=useState(order.delivery_address??'');
 const [products,setProducts]=useState(order.product_details??'');
 const [amount,setAmount]=useState(order.total_amount===null?'':String(order.total_amount));
 const [currency,setCurrency]=useState(order.currency||'BDT');
 const [footer,setFooter]=useState('Thank you for your order!');
 const [showSender,setShowSender]=useState(true);
 const [showEmail,setShowEmail]=useState(!!order.delivery_email);
 const [showProducts,setShowProducts]=useState(true);
 const [showTotal,setShowTotal]=useState(order.total_amount!==null);
 const [showDate,setShowDate]=useState(true);
 const [showStatus,setShowStatus]=useState(true);

 useEffect(()=>{
  const element=dialog.current;
  element?.showModal();
  document.body.classList.add('label-dialog-open');
  return()=>{document.body.classList.remove('label-dialog-open');};
 },[]);

 const productLines=useMemo(()=>products.split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean),[products]);
 const numericAmount=amount.trim()===''?null:Number(amount);
 const amountValid=numericAmount===null||(Number.isFinite(numericAmount)&&numericAmount>=0);
 const emailValid=!email.trim()||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 const ready=!!name.trim()&&/^\+?[0-9 ()-]{7,25}$/.test(phone.trim())&&address.trim().length>=5&&!!sender.trim()&&!!orderNumber.trim()&&amountValid&&emailValid;
 const dateLabel=useMemo(()=>{
  const value=new Date(order.created_at);
  return Number.isNaN(value.getTime())?'':value.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
 },[order.created_at]);
 const formattedAmount=numericAmount===null?'':new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(numericAmount);

 return <dialog ref={dialog} aria-label="Customize delivery label and packing slip" onCancel={close} className="shipping-dialog w-[calc(100%-1rem)] max-w-3xl rounded-2xl border border-line bg-panel p-3 text-ink shadow-2xl backdrop:bg-black/60 sm:p-5">
  <div className="label-controls">
   <div className="flex items-center justify-between gap-3">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-brand">Print studio</p><h2 className="text-lg font-bold sm:text-xl">Customize order slip</h2></div>
    <button onClick={close} aria-label="Close label editor" className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm">Close</button>
   </div>
   <p className="mt-2 text-xs leading-5 text-subtle">Edit the details and review the live preview before printing. Changes apply to this printout only; your saved order will not be changed. This is not a courier booking.</p>
   {order.status!=='confirmed'&&<p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">Order status is <strong>{order.status}</strong>. Check that it is ready to dispatch.</p>}

   <div className="mt-4 grid gap-3 rounded-xl border border-line bg-canvas/60 p-3 sm:grid-cols-2 sm:p-4">
    <h3 className="text-sm font-bold sm:col-span-2">Business & order</h3>
    <label className="text-xs font-semibold">Business / sender name<input maxLength={120} className={field} value={sender} onChange={e=>setSender(e.target.value)}/></label>
    <label className="text-xs font-semibold">Print title<input maxLength={80} className={field} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="text-xs font-semibold">Order number<input maxLength={40} className={field} value={orderNumber} onChange={e=>setOrderNumber(e.target.value)}/></label>
    <label className="text-xs font-semibold">Currency<input maxLength={3} minLength={3} className={field} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
   </div>

   <div className="mt-3 grid gap-3 rounded-xl border border-line bg-canvas/60 p-3 sm:grid-cols-2 sm:p-4">
    <h3 className="text-sm font-bold sm:col-span-2">Customer & delivery</h3>
    <label className="text-xs font-semibold">Recipient name<input autoFocus maxLength={120} className={field} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="text-xs font-semibold">Phone<input type="tel" maxLength={25} className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Email (optional)<input type="email" maxLength={254} className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="text-xs font-semibold sm:col-span-2">Full delivery address<textarea maxLength={1000} rows={3} className={field} value={address} onChange={e=>setAddress(e.target.value)}/></label>
   </div>

   <div className="mt-3 grid gap-3 rounded-xl border border-line bg-canvas/60 p-3 sm:grid-cols-2 sm:p-4">
    <h3 className="text-sm font-bold sm:col-span-2">Products & payment</h3>
    <label className="text-xs font-semibold sm:col-span-2">Product details<textarea maxLength={3000} rows={4} className={field} placeholder="Product name, quantity, size, colour or other order details" value={products} onChange={e=>setProducts(e.target.value)}/><span className="mt-1 block font-normal text-subtle">Separate multiple details with | to show them as individual lines.</span></label>
    <label className="text-xs font-semibold">Total amount<input type="number" min="0" step="0.01" className={field} placeholder="e.g. 1250" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label className="text-xs font-semibold">Footer note<input maxLength={180} className={field} value={footer} onChange={e=>setFooter(e.target.value)}/></label>
   </div>

   <div className="mt-3 rounded-xl border border-line bg-canvas/60 p-3 sm:p-4">
    <h3 className="text-sm font-bold">Print options</h3>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
     <label className={toggle}><input type="checkbox" checked={showSender} onChange={e=>setShowSender(e.target.checked)}/> Show sender</label>
     <label className={toggle}><input type="checkbox" checked={showEmail} onChange={e=>setShowEmail(e.target.checked)}/> Show email</label>
     <label className={toggle}><input type="checkbox" checked={showProducts} onChange={e=>setShowProducts(e.target.checked)}/> Show products</label>
     <label className={toggle}><input type="checkbox" checked={showTotal} onChange={e=>setShowTotal(e.target.checked)}/> Show total</label>
     <label className={toggle}><input type="checkbox" checked={showDate} onChange={e=>setShowDate(e.target.checked)}/> Show order date</label>
     <label className={toggle}><input type="checkbox" checked={showStatus} onChange={e=>setShowStatus(e.target.checked)}/> Show status</label>
    </div>
   </div>
  </div>

  <article className="shipping-label mx-auto mt-4 w-full max-w-[720px] overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-950 shadow-sm">
   <div className="bg-slate-950 px-5 py-4 text-white sm:px-7">
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0">{showSender&&<p className="break-words text-sm font-bold tracking-wide">{sender||'Business name'}</p>}<p className="mt-1 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-300">Customer copy</p></div>
     <div className="shrink-0 rounded-md border border-white/30 px-3 py-2 text-right"><p className="text-[9px] uppercase tracking-widest text-slate-300">Order</p><p className="text-sm font-extrabold">#{orderNumber||'—'}</p></div>
    </div>
    <h3 className="mt-5 text-lg font-extrabold tracking-wide sm:text-xl">{title||'ORDER PACKING SLIP'}</h3>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-300">{showDate&&dateLabel&&<span>Date: {dateLabel}</span>}{showStatus&&<span>Status: {order.status.toUpperCase()}</span>}</div>
   </div>

   <div className="grid gap-5 p-5 sm:grid-cols-[1fr_1.1fr] sm:p-7">
    <section>
     <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Deliver to</p>
     <p className="mt-2 break-words text-lg font-extrabold leading-tight sm:text-xl">{name||'Recipient name'}</p>
     <p className="mt-2 break-words text-sm font-semibold">{phone||'Phone number'}</p>
     {showEmail&&email&&<p className="mt-1 break-all text-xs text-slate-600">{email}</p>}
     <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{address||'Full delivery address'}</p>
    </section>
    <section className="border-t border-slate-200 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
     <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Order details</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-600">#{orderNumber||'—'}</span></div>
     {showProducts&&<div className="mt-3 space-y-2">{productLines.length?productLines.map((line,index)=><div key={index} className="flex gap-2 border-b border-dashed border-slate-200 pb-2 text-xs leading-5"><span className="font-bold text-slate-400">{String(index+1).padStart(2,'0')}</span><span className="min-w-0 break-words font-medium">{line}</span></div>):<p className="text-xs text-slate-500">Product details not provided</p>}</div>}
     {showTotal&&<div className="mt-4 flex items-center justify-between gap-3 border-t-2 border-slate-900 pt-3"><span className="text-xs font-bold uppercase tracking-wider">Order total</span><span className="text-lg font-extrabold tabular-nums">{currency.trim()||'BDT'} {formattedAmount||'Not set'}</span></div>}
    </section>
   </div>
   <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
    <div className="flex items-end justify-between gap-3"><p className="max-w-[75%] whitespace-pre-wrap break-words text-xs font-medium text-slate-600">{footer||'Thank you for your order!'}</p><p className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-400">SupportFlow AI</p></div>
    <p className="mt-3 border-t border-slate-200 pt-2 text-[9px] text-slate-500">Delivery address label · No courier booking or tracking number assigned</p>
   </div>
  </article>

  <div className="label-controls mt-4">
   {!ready&&<p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">Check recipient name, phone, address, sender and order number. Also correct any invalid email or amount before printing.</p>}
   <div className="flex flex-col gap-2 sm:flex-row">
    <button disabled={!ready} onClick={()=>window.print()} className="w-full rounded-xl bg-brand p-3 font-semibold text-white disabled:opacity-50 sm:flex-1">Print / Save as PDF</button>
    <button onClick={close} className="rounded-xl border border-line px-5 py-3 text-sm font-semibold">Close</button>
   </div>
   <p className="mt-2 text-xs text-subtle">The print layout is designed for A5 paper. In the print dialog, disable browser headers and footers for a clean copy.</p>
  </div>
 </dialog>;
}
