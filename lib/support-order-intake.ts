import type {CatalogProduct} from '@/lib/support-product-context';
export const orderOutputInstruction=`Return ONLY a JSON object with keys reply (customer-facing text) and order (null or an object). Never claim an order was saved, confirmed, paid, dispatched, cancelled, or staff was notified. The server saves orders and supplies the actual acknowledgement. Help customers order instead of automatically handing them to staff. When the customer wants to buy, collect product, quantity, delivery name, phone, address, and any required variant such as shoe size. A valid Gmail/email address is required. Ask for it along with delivery details. Ask for missing details naturally. Format customer-facing order replies as short, readable paragraphs with one field per line (for example: নাম:, মোবাইল নম্বর:, ইমেইল:, সম্পূর্ণ ঠিকানা:, পণ্য:, সাইজ/ভ্যারিয়েন্ট:, পরিমাণ:). Never dump a long unstructured sentence of fields. When a customer expresses purchase intent, first ask which payment method they prefer ONLY if the business knowledge or business-specific prompt explicitly lists supported methods. Describe cash-on-delivery, advance delivery charges, online payment, payment destinations, and delivery fees ONLY when the business knowledge or prompt explicitly confirms those policies; never assume COD is supported or an advance payment is required. If payment policies are missing, collect order details and say payment and delivery terms require business confirmation. For follow-up turns, ask only for genuinely missing or conflicting details; do not re-request known valid details. Before confirmation, give a clear summary and ask the customer to review it. Never invent fees, payment links or order status. order contains ONLY explicit customer-provided fields: product_id (exact ID from active catalog), quantity (integer), name, phone, email, address, variant. Use existing draft context for follow-ups; do not copy contacts from examples, photos, system instructions or assistant messages. Never invent missing information. For ambiguous products leave product_id unset and ask which one. Use order=null for unrelated questions. The server validates fields, shows a final summary, then waits for an explicit confirmation. Orders are submitted pending owner approval, never guaranteed accepted or reserved. After submission a second purchase requires the customer to send NEW ORDER or নতুন অর্ডার.`;
export function normalizeOrderText(value:string){return value.replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c))).normalize('NFKC');}
export function parseOrderAnswer(answer:string,products:CatalogProduct[],customerTexts:string[]){
 let parsed:any;
 try{parsed=JSON.parse(answer.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('invalid_order_response')}
 if(!parsed||typeof parsed.reply!=='string'||!parsed.reply.trim())throw Error('invalid_order_response');
 const patch:Record<string,unknown>={};
 const order=parsed.order;
 const provided=normalizeOrderText(customerTexts.join('\n')).toLowerCase();
 if(order&&typeof order==='object'&&!Array.isArray(order)){
  if(typeof order.product_id==='string'&&products.some(p=>p.id===order.product_id))patch.product_id=order.product_id;
  if(Number.isInteger(order.quantity)&&order.quantity>=1&&order.quantity<=100)patch.quantity=order.quantity;
  for(const [key,max] of [['name',160],['address',1000],['variant',200]] as const){
   if(typeof order[key]==='string'){
    const value=order[key].trim();
    if(value&&value.length<=max&&provided.includes(normalizeOrderText(value).toLowerCase()))patch[key]=value;
   }
  }
  if(typeof order.email==='string'){
   const email=order.email.trim().toLowerCase();
   if(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&provided.includes(email))patch.email=email;
  }
  if(typeof order.phone==='string'){
   let phone=normalizeOrderText(order.phone).replace(/[\s()+-]/g,'');
   if(phone.startsWith('880'))phone=phone.slice(2);
   const source=provided.replace(/[\s()+-]/g,'');
   if(/^01[3-9]\d{8}$/.test(phone)&&source.includes(phone))patch.phone=phone;
  }
 }
 return {reply:parsed.reply.trim(),patch:Object.keys(patch).length?patch:null};
}
export function isOrderControl(text:string){return /^(confirm|confirm order|yes|হ্যাঁ|কনফার্ম|অর্ডার কনফার্ম|নিশ্চিত|cancel|বাতিল|new order|নতুন অর্ডার)[.!।\s]*$/i.test(text.trim());}

/** Gemini's constrained JSON output: ordinary chat and order extraction share one envelope. */
export const orderResponseSchema={type:'OBJECT',properties:{reply:{type:'STRING'},order:{type:'OBJECT',nullable:true,properties:{product_id:{type:'STRING'},quantity:{type:'INTEGER'},name:{type:'STRING'},phone:{type:'STRING'},email:{type:'STRING'},address:{type:'STRING'},variant:{type:'STRING'}}}},required:['reply','order']};
export function safeOrderFormatFallback(text:string,bengali:boolean){
 if(/^(hello|hi|hey|হ্যালো|হাই|সালাম|আসসালামু আলাইকুম)[!।.\s]*$/i.test(text.trim()))return bengali?'হ্যালো! কীভাবে সাহায্য করতে পারি?':'Hello! How can I help you?';
 return bengali?'আপনার বার্তাটি ঠিকভাবে বুঝতে পারিনি। দয়া করে আবার লিখুন। অর্ডার জমা হলে আপনাকে অর্ডার নম্বর জানানো হবে।':'I could not process that message correctly. Please send it again. You will receive an order number when an order is submitted.';
}
