import type {ImportedProduct} from './product-url-import';
export class ProductReadError extends Error {
 constructor(message:string,public status:number){super(message);}
}
type Result={products:ImportedProduct[];mode?:string;notice?:string};
export async function readProductsAutomatically(
 read:(browser:boolean)=>Promise<Result>,
 browserAvailable:()=>Promise<boolean>,
 progress:(message:string)=>void,
):Promise<Result>{
 progress('Reading products from the page…');
 try{
  const result=await read(false);
  if(result.products?.length)return result;
 }catch(error){
  // Authentication, permissions and quota errors must not trigger a paid retry.
  if(error instanceof ProductReadError&&error.status!==422&&error.status<500)throw error;
 }
 if(!await browserAvailable())throw new Error('Could not read products with standard import. Browser reading is not connected. Try a saved HTML page below.');
 progress('Opening the page with Browser + AI… This may take up to a minute.');
 const result=await read(true);
 if(!result.products?.length)throw new Error('No products found after browser reading. Try a product detail page or import a saved HTML page.');
 return {...result,mode:'browser_ai'};
}
