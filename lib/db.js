import {HttpError} from './validation.js';
export async function redis(command){const r=await fetch(process.env.UPSTASH_REDIS_REST_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new HttpError(503,'Não foi possível registrar o pedido. Tente novamente em instantes.');const body=await r.json();if(body.error)throw new HttpError(503,'Banco de pedidos indisponível.');return body.result;}
export const getOrder=async id=>{const value=await redis(['GET',`order:${id}`]);return value?JSON.parse(value):null;};
export const saveOrder=order=>redis(['SET',`order:${order.id}`,JSON.stringify(order)]);
// Redis is private; never persist card data, CVV, authorization keys or gateway customer responses.
export async function rateLimit(key,limit=12,seconds=300){const window=Math.floor(Date.now()/(seconds*1000));const name=`rate:${key}:${window}`;const count=await redis(['INCR',name]);if(count===1)await redis(['EXPIRE',name,seconds*2]);if(count>limit)throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');}
