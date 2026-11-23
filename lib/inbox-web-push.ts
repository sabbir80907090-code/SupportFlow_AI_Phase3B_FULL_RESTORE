import {createPrivateKey, sign} from 'node:crypto';

export function trustedPushEndpoint(raw: string) {
  const url = new URL(raw);
  const providers = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  const trusted = providers.includes(url.hostname) || url.hostname.endsWith('.notify.windows.com');
  if (!trusted || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname === '/') {
    throw new Error('Unsupported push endpoint');
  }
  return url;
}

export function pushAuthorization(origin: string, publicKey: string, privateKey: string, subject: string) {
  const bytes = Buffer.from(publicKey, 'base64url');
  if (bytes.length !== 65 || bytes[0] !== 4 || !/^(mailto:|https:\/\/)/.test(subject)) throw new Error('Invalid push configuration');
  const key = createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',
    x:bytes.subarray(1,33).toString('base64url'), y:bytes.subarray(33).toString('base64url'),d:privateKey}});
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({typ:'JWT',alg:'ES256'})+'.'+encode({aud:origin,exp:Math.floor(Date.now()/1000)+3600,sub:subject});
  const signature = sign('sha256', Buffer.from(token), {key,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `vapid t=${token}.${signature}, k=${publicKey}`;
}
