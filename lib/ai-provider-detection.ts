/**
 * Recognizes only known provider-specific API key formats.
 * A prefix is a hint, never proof that the key is valid.
 * Unknown formats require explicit provider selection and server verification.
 * Never log or persist plaintext keys in client state beyond form lifetime.
 */
export type AiProvider='gemini'|'openai'|'anthropic';
export const aiProviderNames:Record<AiProvider,string>={
 gemini:'Google Gemini',openai:'OpenAI',anthropic:'Anthropic Claude'
};
export function detectAiProvider(apiKey:string):AiProvider|null{
 const key=apiKey.trim();
 if(key.startsWith('sk-ant-'))return 'anthropic';
 if(key.startsWith('AIza'))return 'gemini';
 if(key.startsWith('sk-'))return 'openai';
 return null;
}
