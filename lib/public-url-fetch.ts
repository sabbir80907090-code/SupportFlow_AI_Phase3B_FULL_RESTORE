import {resolve4} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
export function publicIPv4(ip:string){
 if(isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function publicUrl(value:string){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.port||u.username||u.password||!u.hostname.includes('.')||isIP(u.hostname)||u.hostname.endsWith('.')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw Error('Use a public HTTPS product URL without credentials or a custom port');
 u.hash='';return u;
}
/** DNS is validated and pinned to the TLS connection on every redirect. No cookies or app secrets leave the server. */
export async function fetchPublicUrl(value:string,maxBytes:number,kind:'page'|'image',redirects=0,signal=AbortSignal.timeout(12000)):Promise<{body:Buffer;type:string;url:string}>{
 const u=publicUrl(value);
 const addresses=await Promise.race([resolve4(u.hostname),new Promise<never>((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('Website timed out')),{once:true});if(signal.aborted)reject(Error('Website timed out'))})]);
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))throw Error('This website address is not allowed');
 const result=await new Promise<{body:Buffer;type:string;location?:string;status:number}>((resolve,reject)=>{
  const req=request(u,{method:'GET',agent:false,family:4,signal,lookup:(_hostname,_options,callback)=>callback(null,addresses[0],4),headers:{'user-agent':'SupportFlow-Product-Import/1.0','accept-encoding':'identity',accept:kind==='page'?'text/html,application/xhtml+xml':'image/jpeg,image/png,image/webp'}},res=>{
   const status=res.statusCode??0;
   if([301,302,303,307,308].includes(status)){res.destroy();resolve({body:Buffer.alloc(0),type:'',status,location:res.headers.location});return;}
   const type=String(res.headers['content-type']??'').split(';')[0].toLowerCase();
   if(status!==200){res.destroy();reject(Error('Website could not be read (HTTP '+status+')'));return;}
   if(kind==='page'&&!['text/html','application/xhtml+xml'].includes(type)||kind==='image'&&!['image/jpeg','image/png','image/webp'].includes(type)){res.destroy();reject(Error('Website returned an unsupported file type'));return;}
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){req.destroy(Error('Website file is too large'));return}chunks.push(chunk)});
   res.on('end',()=>resolve({body:Buffer.concat(chunks),type,status}));res.on('error',reject);
  });req.on('error',reject);req.end();
 });
 if(result.location){if(redirects>=3)throw Error('Too many website redirects');return fetchPublicUrl(new URL(result.location,u).href,maxBytes,kind,redirects+1,signal)}
 return {body:result.body,type:result.type,url:u.href};
}
