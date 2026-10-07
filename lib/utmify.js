import {HttpError} from './validation.js';
const URL='https://api.utmify.com.br/api-credentials/orders';
const KEYS=['src','sck','utm_source','utm_campaign','utm_medium','utm_content','utm_term'];
export const trackingFor=value=>Object.fromEntries(KEYS.map(key=>[key,typeof value?.[key]==='string'?value[key].replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200)||null:null]));
const states={pending:'waiting_payment',approved:'paid',refused:'refused',refunded:'refunded',chargedback:'chargedback',chargeback:'chargedback'};
// In-memory deduplication is best effort. The same orderId is always reused
// across function instances and statuses; no local order database is required.
const delivered=new Map(),inflight=new Map();
function date(value){
 if(typeof value!=='string')return null;
 const input=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value;
 const d=new Date(input);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,19).replace('T',' ');
}
export function utmifyPayload(payment,fallback){
 const status=states[payment.payment_status];if(!status)return null;
 const meta=payment.metadata||payment.extra?.metadata||{};
 const createdAt=date(meta.tapstar_utmify_created_at)||date(fallback?.createdAt);
 // Old charges without an integration timestamp are left untouched.
 if(!createdAt)return null;
 const approvedDate=date(payment.approved_at),refundedAt=date(payment.refunded_at)||(['refunded','chargedback'].includes(status)?date(payment.updated_at):null);
 if(status==='paid'&&!approvedDate)throw new HttpError(503,'Não foi possível sincronizar a confirmação.');
 const customer=payment.customer||fallback?.customer,items=payment.items||fallback?.items;
 if(!customer?.name||!customer?.email||!Array.isArray(items)||!items.length)throw new HttpError(503,'Não foi possível sincronizar o pedido.');
 const total=Number(payment.payment_amount);
 if(!Number.isSafeInteger(total)||total<=0)throw new HttpError(503,'Não foi possível sincronizar o pedido.');
 const products=items.map(item=>({id:String(item.code),name:String(item.name),planId:null,planName:null,quantity:Number(item.quantity),priceInCents:Number(item.price)}));
 if(products.some(p=>!Number.isSafeInteger(p.quantity)||p.quantity<1||!Number.isSafeInteger(p.priceInCents)||p.priceInCents<0))throw new HttpError(503,'Não foi possível sincronizar o pedido.');
 return {orderId:payment.external_code,platform:'TapStar',paymentMethod:'pix',status,createdAt,approvedDate,refundedAt,
  customer:{name:customer.name,email:customer.email,phone:customer.phone||null,document:customer.document||null,country:'BR'},products,
  trackingParameters:trackingFor(meta.tapstar_tracking||fallback?.tracking),
  // The documented gateway response does not expose fees: gross revenue.
  commission:{totalPriceInCents:total,gatewayFeeInCents:0,userCommissionInCents:total,currency:'BRL'},isTest:false};
}
export async function sendUtmifyOrder(payload){
 const response=await fetch(URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-api-token':process.env.UTMIFY_API_TOKEN.trim()},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
 const rejected=kind=>Object.assign(new HttpError(503,'Não foi possível sincronizar o pedido.'),{kind,upstream_status:response.status});
 if(!response.ok)throw rejected('HTTP_ERROR');
 let ack;try{ack=await response.json();}catch{throw rejected('INVALID_RESPONSE');}
 if(!ack||ack.error||ack.OK===false||ack.success===false||ack.ok===false)throw rejected('UTMIFY_REJECTED');
 if(ack.OK!==true&&ack.success!==true&&ack.ok!==true)throw rejected('MISSING_ACKNOWLEDGEMENT');
 return {http_status:response.status,accepted:true};
}
export async function syncUtmify(payment,{fallback,strict=false}={}){
 if(!process.env.UTMIFY_API_TOKEN?.trim())return {skipped:true};
 let payload;
 try{
  payload=utmifyPayload(payment,fallback);if(!payload)return {skipped:true};
  const key=payload.orderId+':'+payload.status;
  const newer=payload.status==='waiting_payment'?['paid','refused','refunded','chargedback']:payload.status==='paid'?['refunded','chargedback']:[];
  if(newer.some(state=>delivered.get(payload.orderId+':'+state)>Date.now()))return {sent:true,cached:true};
  if(delivered.get(key)>Date.now())return {sent:true,cached:true};
  if(!inflight.has(key))inflight.set(key,(async()=>{
   const acknowledgement=await sendUtmifyOrder(payload);
   for(const [k,expires] of delivered)if(expires<=Date.now())delivered.delete(k);
   if(delivered.size>=1000)delivered.delete(delivered.keys().next().value);
   delivered.set(key,Date.now()+3600000);
   console.info(JSON.stringify({event:'tapstar.utmify.sent',order_id:payload.orderId,status:payload.status,http_status:acknowledgement.http_status,accepted:true}));return {sent:true};
  })());
  try{return await inflight.get(key);}finally{inflight.delete(key);}
 }catch(e){
  // Never log customer data, tokens, request/response bodies or raw errors.
  console.error(JSON.stringify({event:'tapstar.utmify.failed',order_id:payment.external_code,status:payload?.status||'unknown',kind:e.kind||'NETWORK_OR_PAYLOAD_ERROR',http_status:e.upstream_status}));
  if(strict)throw new HttpError(503,'Não foi possível sincronizar a notificação. Tente novamente.');
  return {sent:false};
 }
}
