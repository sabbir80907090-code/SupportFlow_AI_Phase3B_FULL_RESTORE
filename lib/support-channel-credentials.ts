import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

// Server-only encryption for per-business channel credentials.
// SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY must be a random 32-byte key, base64 encoded.
// Never use NEXT_PUBLIC_ variables or expose decrypted values to browser clients.
function encryptionKey():Buffer {
  const encoded=process.env.SUPPORTFLOW_CREDENTIAL_ENCRYPTION_KEY;
  if(!encoded)throw new Error('Channel credential encryption is not configured');
  const key=Buffer.from(encoded,'base64');
  if(key.length!==32||key.toString('base64')!==encoded.trim())
    throw new Error('Channel credential encryption key is invalid');
  return key;
}

export function encryptChannelCredential(plaintext:string,connectionId:string):string {
  if(!plaintext||!connectionId)throw new Error('Missing credential or connection ID');
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(),nonce);
  cipher.setAAD(Buffer.from(connectionId,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}

export function decryptChannelCredential(payload:string,connectionId:string):string {
  const [version,nonceEncoded,tagEncoded,ciphertextEncoded,...extra]=payload.split('.');
  if(version!=='v1'||!nonceEncoded||!tagEncoded||!ciphertextEncoded||extra.length)
    throw new Error('Invalid encrypted credential format');
  const nonce=Buffer.from(nonceEncoded,'base64url');
  const tag=Buffer.from(tagEncoded,'base64url');
  if(nonce.length!==12||tag.length!==16)throw new Error('Invalid encrypted credential');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),nonce);
  decipher.setAAD(Buffer.from(connectionId,'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded,'base64url')),decipher.final()]).toString('utf8');
}
