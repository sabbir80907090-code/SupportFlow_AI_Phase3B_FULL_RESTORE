'use client';

import {useEffect,useId,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

type Props={
 open:boolean;
 title:string;
 description?:string;
 onClose:()=>void;
 busy?:boolean;
 children:ReactNode;
 footer?:ReactNode;
};

/**
 * Reusable, accessible edit/create dialog.
 * On phones a full-height form prevents inline page reflow and keyboard overlap.
 * On larger screens it becomes a centered, scrollable modal.
 */
export function ResponsiveFormDialog({open,title,description,onClose,busy=false,children,footer}:Props){
 const titleId=useId();
 const descriptionId=useId();
 const dialogRef=useRef<HTMLDivElement>(null);
 const closeRef=useRef(onClose);
 const busyRef=useRef(busy);
 closeRef.current=onClose;
 busyRef.current=busy;

 useEffect(()=>{
  if(!open)return;
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const dialog=dialogRef.current;
  const initial=dialog?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])');
  (initial??dialog)?.focus();
  function onKey(event:KeyboardEvent){
   const root=dialogRef.current;
   if(!root)return;
   // A nested picker has its own Escape and Tab handling.
   const nested=event.target instanceof Element?event.target.closest('[role="dialog"]'):null;
   if(nested&&nested!==root)return;
   if(event.key==='Escape'){
    event.preventDefault();
    if(!busyRef.current)closeRef.current();
    return;
   }
   if(event.key!=='Tab')return;
   const focusable=Array.from(root.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
   )).filter(element=>element.getClientRects().length>0);
   if(!focusable.length){event.preventDefault();root.focus();return}
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===root)){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',onKey);
  return()=>{
   document.removeEventListener('keydown',onKey);
   document.body.style.overflow=previousOverflow;
   previousFocus?.focus();
  };
 },[open]);

 if(!open||typeof document==='undefined')return null;
 return createPortal(
  <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-5" role="presentation">
   <div aria-hidden="true" className="absolute inset-0 bg-black/70"/>
   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} tabIndex={-1}
    className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-panel text-ink shadow-2xl outline-none sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-line">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
     <div className="min-w-0"><h2 id={titleId} className="text-lg font-bold sm:text-xl">{title}</h2>
      {description&&<p id={descriptionId} className="mt-1 text-sm text-subtle">{description}</p>}</div>
     <button type="button" aria-label="Close form" disabled={busy} onClick={onClose}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"><X size={20}/></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>
    {footer&&<div className="shrink-0 border-t border-line bg-panel px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">{footer}</div>}
   </div>
  </div>,document.body
 );
}
