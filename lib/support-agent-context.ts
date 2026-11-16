/** BartaCare's bounded, business-scoped context. This module never makes provider calls. */
export type KnowledgeArticle={title:string;content:string;category:string|null};
export type ChatMessage={direction:string;text:string|null};

const words=(value:string):string[]=>value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)??[];
const ignored=new Set(words('the a an to of for is are it do does what how please me my your can you i we with in on and or this that tell about have hello hi hey price product products item items order অর্ডার কি কী কিভাবে কেমন আমাকে আমার আপনার এই ওই এটা আছে কত দাম পণ্য প্রোডাক্ট সম্পর্কে বলুন দিন জানতে চাই'));

function queryTerms(query:string):string[]{
 return [...new Set(words(query).filter(w=>w.length>1&&!ignored.has(w)))].slice(0,24);
}

/** Search only articles already fetched for the same business_id. */
export function knowledgeFacts(articles:KnowledgeArticle[],query:string,previousQuery=''):string{
 const terms=queryTerms(query);
 const previous=queryTerms(previousQuery);
 const rank=(article:KnowledgeArticle,search:string[])=>{
  const title=words(article.title),category=words(article.category??''),content=words(article.content.slice(0,3500));
  return search.reduce((score,term)=>score+(title.includes(term)?8:0)+(category.includes(term)?5:0)+(content.includes(term)?1:0),0);
 };
 const ranked=articles.map((article,index)=>({article,index,score:rank(article,terms)}));
 if(!ranked.some(a=>a.score>0)&&terms.length===0&&previous.length){
  for(const item of ranked)item.score=rank(item.article,previous);
 }
 ranked.sort((a,b)=>b.score-a.score||a.index-b.index);
 // A broad question receives at most two recent reference articles, not twelve.
 const matched=ranked.filter(x=>x.score>0);
 const selected=(matched.length?matched.slice(0,4):ranked.slice(0,2));
 const facts:string[]=[];
 let remaining=4200;
 for(const {article} of selected){
  if(remaining<100)break;
  const title=String(article.title??'').slice(0,180);
  const category=String(article.category??'').slice(0,80);
  const header='['+category+'] '+title+': ';
  const content=String(article.content??'').slice(0,Math.min(1400,Math.max(0,remaining-header.length)));
  const fact=header+content;
  facts.push(fact);remaining-=fact.length+1;
 }
 return facts.join('\n');
}

/** Retain recent turns, preserving the newest customer request and order details. */
export function compactAgentHistory(messages:ChatMessage[]):{role:'user'|'assistant';text:string}[]{
 return messages.slice(-8).map((message,index,array)=>({
  role:message.direction==='inbound'?'user' as const:'assistant' as const,
  text:String(message.text??'').slice(0,index===array.length-1?3000:1100)
 }));
}
