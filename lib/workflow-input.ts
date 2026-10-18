export const workflowChannels=['telegram','messenger','whatsapp','website'];
export function validIdentity(input:Record<string,unknown>){
 return typeof input.channel==='string'&&workflowChannels.includes(input.channel)&&typeof input.senderId==='string'&&input.senderId.length>0&&input.senderId.length<=200;
}
export function validateWorkflowOrder(input:Record<string,unknown>):string|null {
 if(!validIdentity(input))return 'Valid channel and senderId are required';
 for(const [key,min,max] of [['name',2,160],['address',8,1000],['product',1,4000],['idempotencyKey',8,200]] as const){
  if(typeof input[key]!=='string'||input[key].trim().length<min||input[key].length>max)return `Invalid ${key}`;
 }
 if(typeof input.phone!=='string'||!/^\d{11}$/.test(input.phone.replace(/[ -]/g,'')))return 'Phone must have 11 digits';
 if(typeof input.email!=='string'||input.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))return 'Invalid email';
 return null;
}
