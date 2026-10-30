export const couriers = {
  pathao: {name:'Pathao',fields:[['client_id','Client ID'],['client_secret','Client secret'],['username','Merchant login email'],['password','Merchant login password']],portal:'https://merchant.pathao.com/'},
  steadfast: {name:'Steadfast',fields:[['api_key','API key'],['secret_key','Secret key']],portal:'https://portal.steadfast.com.bd/'},
  redx: {name:'REDX',fields:[['access_token','API access token']],portal:'https://redx.com.bd/developer-api/'},
} as const;
export type CourierProvider=keyof typeof couriers;
export function isCourier(value:unknown):value is CourierProvider {return typeof value==='string'&&Object.prototype.hasOwnProperty.call(couriers,value);}
export function validateCourierInput(value:unknown){
 if(!value||typeof value!=='object')throw Error('Invalid setup');
 const body=value as Record<string,unknown>;
 if(!isCourier(body.provider))throw Error('Choose a supported courier');
 const provider=body.provider;
 const pickupName=typeof body.pickupName==='string'?body.pickupName.trim():'';
 const pickupPhone=typeof body.pickupPhone==='string'?body.pickupPhone.trim():'';
 const pickupAddress=typeof body.pickupAddress==='string'?body.pickupAddress.trim():'';
 if(!pickupName||pickupName.length>120||!/^\+?[0-9 ()-]{7,25}$/.test(pickupPhone)||pickupAddress.length<5||pickupAddress.length>1000)throw Error('Enter a pickup contact, valid phone and full address');
 const raw=body.credentials;
 if(!raw||typeof raw!=='object')throw Error('Enter all credential fields');
 const credentials:Record<string,string>={};
 for(const [key,label] of couriers[provider].fields){const entry=(raw as Record<string,unknown>)[key];if(typeof entry!=='string'||!entry.trim()||entry.length>4096)throw Error(`Enter ${label}`);credentials[key]=entry;}
 return {provider,pickupName,pickupPhone,pickupAddress,credentials};
}
