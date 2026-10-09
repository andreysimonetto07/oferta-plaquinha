import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {HttpError} from './validation.js';
import {META_PIXEL_ID,purchaseEventId} from '../public/js/marketing-data.js';
const sent=new Map(),pending=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
export function metaContextFor(req,body={}){
 const clean=value=>typeof value==='string'&&/^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,300}$/.test(value)?value:null;
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
 return {fbp:clean(body?.fbp),fbc:clean(body?.fbc),ip:isIP(ip)?ip:null,ua:String(req.headers['user-agent']||'').slice(0,500)};
}
export function purchasePayload(payment,fallback){
 if(payment.payment_status!=='approved')return null;
 if(!Number.isSafeInteger(Number(payment.payment_amount))||Number(payment.payment_amount)<=0||!payment.external_code)throw new HttpError(503,'Não foi possível sincronizar o evento.');
 const meta=payment.metadata||payment.extra?.metadata||{},context=meta.tapstar_meta||fallback?.meta;
 if(!context)return null;
 const customer={...fallback?.customer,...payment.customer},user_data={};
 if(customer.email)user_data.em=[hash(String(customer.email).trim().toLowerCase())];
 if(customer.phone)user_data.ph=[hash(String(customer.phone).replace(/\D/g,''))];
 user_data.external_id=[hash(payment.external_code)];
 if(context.fbp)user_data.fbp=context.fbp;
 if(context.fbc)user_data.fbc=context.fbc;
 if(context.ip&&isIP(context.ip))user_data.client_ip_address=context.ip;
 if(context.ua)user_data.client_user_agent=context.ua;
 let paidAt=payment.approved_at||payment.updated_at;
 if(typeof paidAt==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(paidAt))paidAt=paidAt.replace(' ','T')+'Z';
 const timestamp=new Date(paidAt).getTime();
 const event_time=Number.isFinite(timestamp)?Math.floor(timestamp/1000):Math.floor(Date.now()/1000);
 return {event_name:'Purchase',event_id:purchaseEventId(payment.external_code),event_time,action_source:'website',event_source_url:new URL('/obrigado.html',process.env.APP_URL).href,user_data,custom_data:{currency:'BRL',value:Number(payment.payment_amount)/100,order_id:payment.external_code}};
}
export async function sendMetaEvent(event){
 const pixel=process.env.META_PIXEL_ID?.trim()||META_PIXEL_ID;
 if(pixel!==META_PIXEL_ID)throw new HttpError(503,'Configuração do pixel divergente.');
 const r=await fetch(`https://graph.facebook.com/v26.0/${pixel}/events`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:process.env.META_ACCESS_TOKEN?.trim(),data:[event],...(process.env.META_TEST_EVENT_CODE?{test_event_code:process.env.META_TEST_EVENT_CODE.trim()}:{})}),signal:AbortSignal.timeout(5000)});
 let data;try{data=await r.json();}catch{throw Object.assign(new HttpError(503,'Não foi possível sincronizar o evento.'),{kind:'INVALID_RESPONSE',upstream_status:r.status});}
 if(!r.ok||data.error||data.events_received!==1)throw Object.assign(new HttpError(503,'Não foi possível sincronizar o evento.'),{kind:'META_REJECTED',upstream_status:r.status,code:Number.isInteger(data.error?.code)?data.error.code:undefined,subcode:Number.isInteger(data.error?.error_subcode)?data.error.error_subcode:undefined});
 return {events_received:data.events_received,fbtrace_id:data.fbtrace_id};
}
export async function syncMeta(payment,{fallback,strict=false}={}){
 if(!process.env.META_ACCESS_TOKEN?.trim())return {skipped:true};
 // A pixel change does not authorize reusing the previous pixel's CAPI token.
 // Browser events remain active while the matching server credentials are set.
 if(process.env.META_PIXEL_ID?.trim()!==META_PIXEL_ID)return {skipped:true,reason:'PIXEL_NOT_CONFIGURED'};
 let event;
 try{
  event=purchasePayload(payment,fallback);if(!event)return {skipped:true};
  if(sent.get(event.event_id)>Date.now())return {sent:true,cached:true};
  if(!pending.has(event.event_id))pending.set(event.event_id,(async()=>{
   const result=await sendMetaEvent(event);
   for(const [key,expires] of sent)if(expires<=Date.now())sent.delete(key);
   if(sent.size>=1000)sent.delete(sent.keys().next().value);
   sent.set(event.event_id,Date.now()+86400000);
   console.info(JSON.stringify({event:'tapstar.meta.sent',order_id:payment.external_code,events_received:result.events_received}));return {sent:true};
  })());
  try{return await pending.get(event.event_id);}finally{pending.delete(event.event_id);}
 }catch(e){
  console.error(JSON.stringify({event:'tapstar.meta.failed',order_id:payment.external_code,kind:e.kind||'NETWORK_ERROR',http_status:e.upstream_status,code:e.code,subcode:e.subcode}));
  if(strict)throw new HttpError(503,'Não foi possível sincronizar a notificação.');return {sent:false};
 }
}
