import type {ImportedProduct} from './product-url-import';
export type ImportRow={id:string;product:ImportedProduct;selected:boolean;saved:boolean;error:string;warning:string;imagePath?:string};
export function productIssue(p:ImportedProduct):string{
 if(!p.name.trim()||p.name.trim().length>160)return 'Enter a product name (up to 160 characters).';
 if(!/^\d+(?:\.\d{1,2})?$/.test(p.price.trim())||Number(p.price)>=1e12)return 'Enter a valid price, including 0 for a free product.';
 if(!/^[A-Z]{3}$/.test(p.currency.trim().toUpperCase()))return 'Enter a three-letter currency, e.g. BDT.';
 if(!/^\d+$/.test(p.stock_quantity.trim())||Number(p.stock_quantity)>2147483647)return 'Enter the stock quantity (0 or more).';
 return '';
}
export function importPayload(row:ImportRow,businessId:string,active:boolean){
 const issue=productIssue(row.product);if(issue)throw Error(issue);
 const p=row.product;
 return {id:row.id,business_id:businessId,name:p.name.trim(),description:p.description.trim()||null,sku:p.sku.trim()||null,category:p.category.trim()||null,price:Number(p.price),currency:p.currency.trim().toUpperCase(),stock_quantity:Number(p.stock_quantity),is_active:active,image_path:row.imagePath??null};
}
export async function runImportBatch(rows:ImportRow[],save:(row:ImportRow)=>Promise<void>,report:(row:ImportRow)=>void,shouldStop:()=>boolean=()=>false){
 for(const original of rows){
  if(shouldStop())break;
  if(!original.selected||original.saved)continue;
  const row={...original,product:{...original.product},error:''};
  const issue=productIssue(row.product);
  if(issue){row.error=issue;report(row);continue;}
  try{await save(row);row.saved=true;row.selected=false;}catch(e){row.error=e instanceof Error?e.message:'Could not save this product. Please retry.';}
  report(row);
 }
}
