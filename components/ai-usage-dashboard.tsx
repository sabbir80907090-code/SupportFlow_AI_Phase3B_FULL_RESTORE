'use client';
import {useCallback,useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
import {BarChart3,RefreshCw,Wallet,Coins,Activity,AlertCircle} from 'lucide-react';
type Totals={calls:number;input_tokens:number;output_tokens:number;total_tokens:number;missing_token_calls:number;unpriced_calls:number;estimated_usd:number};
type Model={provider:string;model:string;calls:number;input_tokens:number;output_tokens:number;total_tokens:number;unpriced_calls:number;estimated_usd:number};
type Day={day:string;calls:number;estimated_usd:number};
type Rate={provider:string;model:string;input_usd_per_million:number;output_usd_per_million:number};
type Data={month:string;summary:{totals:Totals;models:Model[];daily:Day[]};rates:Rate[];budget:{monthly_budget_usd:number|null;monthly_token_budget:number|null}|null;providerBalance:null;providerBalanceStatus:string};
const money=(n:number)=>'$'+n.toFixed(n<0.01&&n>0?5:2);
const count=(n:number)=>Number(n||0).toLocaleString('en-US');
export function AiUsageDashboard({businessId,view='overview'}:{businessId:string;view?:'overview'|'budget'|'pricing'}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [budget,setBudget]=useState(''),[tokenBudget,setTokenBudget]=useState('');
 const [provider,setProvider]=useState('gemini'),[model,setModel]=useState(''),[inputRate,setInputRate]=useState(''),[outputRate,setOutputRate]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const db=getSupabase();if(!db)throw Error('Sign in required');
   const {data:auth}=await db.auth.getSession();if(!auth.session)throw Error('Sign in required');
   const res=await fetch('/api/ai/usage',{headers:{authorization:'Bearer '+auth.session.access_token,'x-business-id':businessId},cache:'no-store'});
   const json=await res.json();if(!res.ok)throw Error(json.error||'Unable to load usage');
   const next=json as Data;setData(next);setBudget(next.budget?.monthly_budget_usd==null?'':String(next.budget.monthly_budget_usd));
   setTokenBudget(next.budget?.monthly_token_budget==null?'':String(next.budget.monthly_token_budget));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load usage')}finally{setLoading(false)}
 },[businessId]);
 useEffect(()=>{setData(null);void load()},[load]);
 async function save(body:object){
  setSaving(true);setError('');setNotice('');
  try{
   const db=getSupabase();const {data:auth}=await db!.auth.getSession();if(!auth.session)throw Error('Sign in required');
   const res=await fetch('/api/ai/usage',{method:'POST',headers:{authorization:'Bearer '+auth.session.access_token,'x-business-id':businessId,'content-type':'application/json'},body:JSON.stringify(body)});
   const json=await res.json();if(!res.ok)throw Error(json.error||'Could not save settings');
   await load();setNotice('Settings saved for this workspace.');
  }catch(e){setError(e instanceof Error?e.message:'Save failed')}finally{setSaving(false)}
 }
 const totals=data?.summary?.totals;
 const priced=totals?.unpriced_calls===0;
 const estimated=Number(totals?.estimated_usd??0);
 const remaining=data?.budget?.monthly_budget_usd==null?null:Math.max(0,Number(data.budget.monthly_budget_usd)-estimated);
 const tokenRemaining=data?.budget?.monthly_token_budget==null?null:Math.max(0,Number(data.budget.monthly_token_budget)-Number(totals?.total_tokens??0));
 const box='rounded-2xl border border-line bg-panel p-4 shadow-soft sm:p-5';
 const field='w-full rounded-xl border border-line bg-canvas p-3 text-sm';
 const stat=(label:string,value:string,detail:string,Icon:typeof Activity)=><div className={box}><div className="flex items-center justify-between text-sm text-subtle"><span>{label}</span><Icon size={18}/></div><p className="mt-3 break-all text-2xl font-extrabold text-ink">{value}</p><p className="mt-2 text-xs text-subtle">{detail}</p></div>;
 return <div className="space-y-5">
  {view==='overview'&&<div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold">AI Usage & Cost</h3><p className="mt-1 text-sm text-subtle">Only this business workspace · Current UTC month · USD estimates</p></div><button type="button" onClick={()=>void load()} disabled={loading||saving} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm"><RefreshCw size={16}/> Refresh</button></div>}
  {error&&<p role="alert" className="rounded-xl border border-rose-500/40 p-3 text-sm text-rose-500">{error}</p>}
  {notice&&<p role="status" className="text-sm text-emerald-600">{notice}</p>}
  {loading&&!data?<p className="text-sm text-subtle">Loading usage data…</p>:data&&<>
   {view==='overview'&&<>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {stat('Provider account balance','Unavailable','Your provider does not expose a common balance API.',Wallet)}
    {stat('Estimated spend',priced?money(estimated):money(estimated)+'+',
      priced?'Based on reviewed model rates or workspace overrides.':'Partial estimate: some calls have no rates or token data.',BarChart3)}
    {stat('Budget remaining',remaining===null?'Not set':priced?money(remaining):'Unknown',
      'Monthly workspace budget; not provider wallet balance.',Coins)}
    {stat('Tokens used',count(Number(totals?.total_tokens??0)),count(Number(totals?.calls??0))+' provider calls · '+count(Number(totals?.missing_token_calls??0))+' missing usage',Activity)}
   </div>
   <div className="grid grid-cols-1 gap-4">
    <section className={box}><h4 className="font-bold">Token breakdown</h4><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-subtle">Input tokens</p><p className="text-xl font-bold">{count(Number(totals?.input_tokens??0))}</p></div><div><p className="text-xs text-subtle">Output tokens</p><p className="text-xl font-bold">{count(Number(totals?.output_tokens??0))}</p></div></div><p className="mt-4 text-xs text-subtle">Unreported tokens are not included. Historical calls before tracking are unavailable.</p>{tokenRemaining!==null&&<p className="mt-3 text-sm font-semibold">Token budget remaining: {count(tokenRemaining)}</p>}</section>

   </div>
   <section className={box}><h4 className="font-bold">Usage by model</h4><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-line text-subtle"><th className="p-2">Provider / Model</th><th className="p-2">Calls</th><th className="p-2">Tokens</th><th className="p-2">Estimated USD</th></tr></thead><tbody>{(data.summary.models??[]).map(row=><tr className="border-b border-line" key={row.provider+row.model}><td className="p-2"><p className="font-semibold">{row.model}</p><p className="text-xs text-subtle">{row.provider}</p></td><td className="p-2">{count(Number(row.calls))}</td><td className="p-2">{count(Number(row.total_tokens))}</td><td className="p-2">{Number(row.unpriced_calls)>0?'Partial / unavailable':money(Number(row.estimated_usd))}</td></tr>)}</tbody></table>{!data.summary.models?.length&&<p className="p-3 text-sm text-subtle">No recorded AI calls this month.</p>}</div></section>
   </>}
   {view==='budget'&&<div className="max-w-2xl"><section className={box}><h4 className="font-bold">Monthly budget</h4><p className="mt-1 text-xs text-subtle">Tracking targets only. This release does not stop API calls when a limit is reached.</p><form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void save({action:'budget',monthlyBudgetUsd:budget===''?null:Number(budget),monthlyTokenBudget:tokenBudget===''?null:Number(tokenBudget)})}}><label className="text-sm">Budget (USD)<input type="number" min="0" max="10000000" step="0.0001" className={field+' mt-1'} value={budget} onChange={e=>setBudget(e.target.value)} placeholder="Optional"/></label><label className="text-sm">Token budget<input type="number" min="0" max="1000000000000" step="1" className={field+' mt-1'} value={tokenBudget} onChange={e=>setTokenBudget(e.target.value)} placeholder="Optional"/></label><button disabled={saving} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50 sm:col-span-2">Save monthly targets</button></form></section></div>}
   {view==='pricing'&&<section className={box}><h4 className="font-bold">Advanced AI Pricing · Model rates (USD per 1 million tokens)</h4><p className="mt-1 text-xs text-subtle">Known models use reviewed automatic pricing. Only enter a manual override when the provider price is missing or different. Updating a rate recalculates historical estimates for this month.</p><div className="mt-3 flex flex-wrap gap-2">{data.rates.map(r=><span key={r.provider+r.model} className="rounded-lg border border-line px-3 py-2 text-xs">{r.provider} / {r.model}: {money(Number(r.input_usd_per_million))} in · {money(Number(r.output_usd_per_million))} out</span>)}</div><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();void save({action:'rate',provider,model: model.trim(),inputRate:Number(inputRate),outputRate:Number(outputRate)})}}><label className="text-sm">Provider<select className={field+' mt-1'} value={provider} onChange={e=>setProvider(e.target.value)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label><label className="text-sm">Model ID<input required className={field+' mt-1'} value={model} onChange={e=>setModel(e.target.value)} placeholder="e.g. model ID"/></label><label className="text-sm">Input rate<input required type="number" min="0" max="10000" step="any" className={field+' mt-1'} value={inputRate} onChange={e=>setInputRate(e.target.value)}/></label><label className="text-sm">Output rate<input required type="number" min="0" max="10000" step="any" className={field+' mt-1'} value={outputRate} onChange={e=>setOutputRate(e.target.value)}/></label><button disabled={saving} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-4">Save model rate</button></form></section>}
   {view==='overview'&&<p className="flex gap-2 text-xs text-subtle"><AlertCircle size={16} className="shrink-0"/> Provider balance and token quota are not the same as the monthly targets here. Pricing, cached tokens, provider discounts, taxes and untracked calls may differ from actual billing.</p>}
  </>}
 </div>;
}
