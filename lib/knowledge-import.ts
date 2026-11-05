export type KnowledgeDraft={title:string;content:string;source_filename:string;category:string};
export const MAX_KNOWLEDGE_TEXT=120000;
export function splitKnowledge(text:string,title:string,source:string):KnowledgeDraft[]{
 const clean=text.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim();
 if(!clean)throw Error('No readable text found.');
 if(clean.length>MAX_KNOWLEDGE_TEXT)throw Error('Import is too large. Use a document with at most 120,000 characters.');
 const parts:string[]=[];let rest=clean;
 while(rest.length){let end=Math.min(2500,rest.length);if(end<rest.length){const split=rest.lastIndexOf('\n',end);if(split>1500)end=split;}parts.push(rest.slice(0,end));rest=rest.slice(end);}
 return parts.map((content,i)=>({title:title.slice(0,130)+(parts.length>1?` (${i+1}/${parts.length})`:''),content,source_filename:source,category:'General'}));
}
function decode(s:string){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v:string)=>{if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[v.toLowerCase()]??'';});}
export function parseKnowledgePage(html:string,url:string){
 const base=new URL(url);
 const stripped=html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 const title=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??base.hostname).replace(/<[^>]+>/g,'')).trim();
 const body=stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??stripped.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]??stripped;
 const text=decode(body.replace(/<\/(?:p|div|li|h[1-6]|tr|section)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[\t ]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
 const links=new Set<string>();
 for(const m of stripped.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)){
  try{const u=new URL(decode(m[1]),base);u.hash='';if(u.origin!==base.origin||u.username||u.password||u.search||/\.(?:jpg|jpeg|png|webp|gif|pdf|zip|css|js)$/i.test(u.pathname)||/\/(?:cart|checkout|login|logout|account|admin)(?:\/|$)/i.test(u.pathname))continue;links.add(u.href);}catch{}
 }
 return {title,text,links:[...links].slice(0,100),source:url};
}
export function knowledgeContext(articles:{title:string;content:string;category:string}[],query:string){
 const tokens=[...new Set(query.toLowerCase().normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu)??[])].filter(t=>t.length>1).slice(0,40);
 const chunks=articles.flatMap(a=>splitKnowledge(a.content,a.title,'').map(c=>({...c,category:a.category})));
 const ranked=chunks.map((a,i)=>({a,i,score:tokens.reduce((n,t)=>n+(a.title.toLowerCase().includes(t)?4:0)+(a.content.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 let result='';for(const {a} of ranked){const s=JSON.stringify({title:a.title,category:a.category,content:a.content})+'\n';if(result.length+s.length>9000)continue;result+=s;if(result.length>8000)break;}return result;
}
