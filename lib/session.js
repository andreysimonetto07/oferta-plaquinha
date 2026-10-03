import {HttpError} from './validation.js';
// Best-effort protection per warm function instance. This is not a database,
// distributed lock or durable idempotency guarantee. The UI never retries a POST
// whose result is uncertain; resolution is through the provider, not a new charge.
const attempts=new Map(),rates=new Map();
const TTL=24*60*60*1000,MAX=1000;
function sweep(map){const now=Date.now();for(const [k,v] of map)if(v.expires<=now)map.delete(k);}
export function rateLimit(key,limit=12,seconds=300){sweep(rates);const now=Date.now(),previous=rates.get(key);if(previous){if(++previous.count>limit)throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');}else{if(rates.size>=MAX)throw new HttpError(429,'Aguarde alguns instantes.');rates.set(key,{count:1,expires:now+seconds*1000});}}
export async function oncePerInstance(key,fingerprint,create){
 sweep(attempts);const previous=attempts.get(key);
 if(previous){if(previous.fingerprint!==fingerprint)throw new HttpError(409,'Os dados desta tentativa foram alterados.');return previous.promise;}
 if(attempts.size>=MAX)throw new HttpError(429,'Aguarde antes de iniciar um pagamento.');
 const entry={fingerprint,expires:Date.now()+TTL};attempts.set(key,entry);
 entry.promise=Promise.resolve().then(create);return entry.promise;
}
