'use client';
import {useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

type Props={open:boolean;title:string;description?:string;onClose:()=>void;children:React.ReactNode;busy?:boolean;};
export function FormDialog({open,title,description,onClose,children,busy=false}:Props){
 const id=useId(),descriptionId=useId();
 const panel=useRef<HTMLDivElement>(null),previous=useRef<HTMLElement|null>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const onCloseRef=useRef(onClose),busyRef=useRef(busy);
 onCloseRef.current=onClose;
 busyRef.current=busy;
 useEffect(()=>{
  if(!open)return;
  previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const priorOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{
   // Nested model picker handles its own keyboard events.
   if(document.querySelector('[aria-label^="Choose "][role="dialog"]'))return;
   if(event.key==='Escape'){event.preventDefault();if(!busyRef.current)onCloseRef.current();return;}
   if(event.key!=='Tab'||!panel.current)return;
   const focusables=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0);
   if(!focusables.length)return;
   const first=focusables[0],last=focusables[focusables.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=priorOverflow;document.removeEventListener('keydown',onKey);previous.current?.focus();};
 },[open]);
 if(!open||typeof document==='undefined')return null;
 return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-5" role="presentation">
  <button type="button" tabIndex={-1} aria-label="Close form" onClick={()=>{if(!busy)onClose()}} className="absolute inset-0 bg-black/65"/>
  <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={description?descriptionId:undefined} className="relative z-10 flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-2xl sm:border sm:border-line sm:pb-0">
   <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden="true"><span className="h-1 w-10 rounded-full bg-line"/></div>
   <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
    <div className="min-w-0"><h3 id={id} className="text-lg font-bold text-ink">{title}</h3>{description&&<p id={descriptionId} className="mt-1 text-sm text-subtle">{description}</p>}</div>
    <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="Close form" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-subtle disabled:opacity-50"><X size={20}/></button>
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>
  </div>
 </div>,document.body);
}
