import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {HttpError} from './validation.js';
export const tokenFor=id=>createHmac('sha256',process.env.ORDER_SECRET).update(`customer:${id}`).digest('hex');
export const webhookToken=id=>createHmac('sha256',process.env.ORDER_SECRET).update(`webhook:${id}`).digest('hex');
export function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function assertOrigin(req){const allowed=new URL(process.env.APP_URL).origin;if(req.headers.origin!==allowed)throw new HttpError(403,'Origem inválida. Reabra a loja para continuar.');}
export const ipKey=req=>createHash('sha256').update(String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]).digest('hex').slice(0,24);
export function begin(req,res,method){res.setHeader('Cache-Control','no-store');if(req.method!==method){res.setHeader('Allow',method);res.status(405).json({error:'Método não permitido.'});return false;}return true;}
export function bodyOf(req){const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>30000)throw new HttpError(400,'Pedido inválido.');return body;}
export const fail=(res,e)=>res.status(e.status||503).json({error:e.status?e.message:'Serviço temporariamente indisponível. Seu pagamento não foi confirmado.'});
