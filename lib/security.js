import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {HttpError} from './validation.js';
export const sameSecret=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
// Signed receipts contain amounts and provider references, never customer data.
export function signToken(purpose,claims,ttl=7*86400){const payload=Buffer.from(JSON.stringify({...claims,purpose,exp:Math.floor(Date.now()/1000)+ttl})).toString('base64url');const signature=createHmac('sha256',process.env.ORDER_SECRET).update(payload).digest('base64url');return `${payload}.${signature}`;}
export function readToken(token,purpose){
 if(typeof token!=='string'||token.length>3000)throw new HttpError(403,'Sessão de pagamento inválida.');
 const [payload,signature,...rest]=token.split('.');const expected=createHmac('sha256',process.env.ORDER_SECRET).update(payload||'').digest('base64url');
 if(rest.length||!sameSecret(signature,expected))throw new HttpError(403,'Sessão de pagamento inválida.');
 let claims;try{claims=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new HttpError(403,'Sessão de pagamento inválida.');}
 if(claims.purpose!==purpose||!Number.isSafeInteger(claims.exp)||claims.exp<=Math.floor(Date.now()/1000))throw new HttpError(403,'Sessão expirada. Consulte o atendimento para acompanhar o Pix.');
 return claims;
}
export const fingerprintFor=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertOrigin(req){
 // Both production addresses belong to this Vercel project. Do not trust
 // Host, forwarded headers, wildcard vercel.app domains or preview URLs.
 const allowed=new Set([new URL(process.env.APP_URL).origin,'https://www.tapstar.site','https://tap-star-two.vercel.app']);
 if(typeof req.headers.origin!=='string'||!allowed.has(req.headers.origin))throw new HttpError(403,'Origem inválida. Reabra a loja para continuar.');
}
export const ipKey=req=>fingerprintFor(String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]).slice(0,24);
export function begin(req,res,method){res.setHeader('Cache-Control','no-store');if(req.method!==method){res.setHeader('Allow',method);res.status(405).json({error:'Método não permitido.'});return false;}return true;}
export function bodyOf(req){let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw new HttpError(400,'Pedido inválido.');}if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>30000)throw new HttpError(400,'Pedido inválido.');return body;}
export const fail=(res,e)=>res.status(e.status||503).json({error:e.status?e.message:'Serviço temporariamente indisponível. Seu pagamento não foi confirmado.'});
