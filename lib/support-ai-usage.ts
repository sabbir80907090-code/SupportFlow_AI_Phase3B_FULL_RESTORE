/** Extract only provider-reported usage. Missing values remain unknown, never zero. */
export function providerTokenUsage(provider:string,payload:any):{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null}{
 const usage=provider==='gemini'?payload?.usageMetadata:provider==='openai'?payload?.usage:provider==='anthropic'?payload?.usage:null;
 const valid=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
 const input=valid(provider==='gemini'?usage?.promptTokenCount:provider==='openai'?usage?.prompt_tokens:usage?.input_tokens);
 const output=valid(provider==='gemini'?usage?.candidatesTokenCount:provider==='openai'?usage?.completion_tokens:usage?.output_tokens);
 const total=valid(provider==='gemini'?usage?.totalTokenCount:provider==='openai'?usage?.total_tokens:null);
 return {inputTokens:input,outputTokens:output,totalTokens:total??(input!==null&&output!==null?input+output:null)};
}
