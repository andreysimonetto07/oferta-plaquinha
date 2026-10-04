import {gatewayBase} from './config.js';
import {HttpError} from './validation.js';
const FIELD_NAMES=new Set(['external_code','payment_method','payment_format','installments','payment_amount','shipping_amount','postback_url','items','customer','customer.name','customer.email','customer.document','customer.phone','customer.ip','shipping','pix','pix.expires_in_days']);
const FAILURE_KINDS=new Set(['AUTHORIZATION','ACCESS_DENIED','VALIDATION','RATE_LIMIT','PROVIDER_UNAVAILABLE','PROVIDER_ERROR','INVALID_RESPONSE','NETWORK_ERROR','TIMEOUT','PAYMENT_MISMATCH','MISSING_PIX']);
export const validPaymentCode=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
class GatewayError extends HttpError {
 constructor(kind,details={}){
  super(502,'Não foi possível consultar o resultado na Mangofy. Consulte o atendimento antes de tentar novamente.');
  this.kind=kind;Object.assign(this,details);
 }
}
// Only predefined diagnostics leave the server. Never return or log provider
// messages, response bodies, request headers, credentials or customer details.
export function paymentFailure(error){
 const failure={kind:FAILURE_KINDS.has(error?.kind)?error.kind:'PROVIDER_ERROR'};
 if(Number.isInteger(error?.upstream_status)&&error.upstream_status>=100&&error.upstream_status<=599)failure.http_status=error.upstream_status;
 if(['json','html','text','empty'].includes(error?.response_format))failure.response_format=error.response_format;
 if(Array.isArray(error?.fields)){
  const fields=error.fields.filter(field=>FIELD_NAMES.has(field));
  if(fields.length)failure.fields=fields;
 }
 return failure;
}
export function logPayment(event,id,details={}){
 const entry={event,order_id:id,...details};
 (event.endsWith('.failed')?console.error:console.info)(JSON.stringify(entry));
}
// Credentials are sent only by the server, to the configured HTTPS origin.
// Redirects are refused so Store-Code cannot follow a redirect to another host.
export async function gateway(path,body){
 let response;
 try{
  response=await fetch(gatewayBase()+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:process.env.MANGOFY_API_KEY?.trim(),'Store-Code':process.env.MANGOFY_STORE_CODE?.trim(),'Content-Type':'application/json',Accept:'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 }catch(error){throw new GatewayError(['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':'NETWORK_ERROR');}
 const upstream_status=response.status,type=response.headers.get('content-type')||'';
 const response_format=type.includes('json')?'json':type.includes('html')?'html':type?'text':'empty';
 const details={upstream_status,response_format};let data;
 try{data=await response.json();}catch(error){
  const kind=['TimeoutError','AbortError'].includes(error?.name)?'TIMEOUT':upstream_status===401?'AUTHORIZATION':upstream_status===403?'ACCESS_DENIED':upstream_status>=500?'PROVIDER_UNAVAILABLE':'INVALID_RESPONSE';
  throw new GatewayError(kind,details);
 }
 if(!data||typeof data!=='object'||Array.isArray(data))throw new GatewayError('INVALID_RESPONSE',details);
 if(!response.ok&&!validPaymentCode(data.payment_code)){
  const kind=upstream_status===401?'AUTHORIZATION':upstream_status===403?'ACCESS_DENIED':[400,422].includes(upstream_status)?'VALIDATION':upstream_status===429?'RATE_LIMIT':upstream_status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR';
  details.fields=data.errors&&typeof data.errors==='object'?Object.keys(data.errors):[];
  throw new GatewayError(kind,details);
 }
 return data;
}
// The supplied V1 collection uses this single endpoint for every method.
// TapStar exposes only Pix; no fallback POST can create a second charge.
export function paymentPath(method){if(method!=='pix')throw new HttpError(400,'A TapStar aceita somente Pix.');return '/api/v1/payment';}
export function payloadFor(order,ip){const a=order.customer.address;const address={street:a.street,street_number:a.number,complement:a.complement,neighborhood:a.neighborhood,city:a.city,state:a.state,zip_code:a.zipcode,country:'BR'};return {external_code:order.id,payment_method:order.method,payment_format:'regular',installments:1,payment_amount:order.quote.total_cents,shipping_amount:order.quote.shipping_cents,postback_url:order.postback,items:order.quote.items.map(l=>({code:l.id,name:`${l.name} · ${l.variant}`,quantity:l.quantity,price:l.unit_cents,description:l.text||l.variant,digital_flag:false})),customer:{name:order.customer.name,email:order.customer.email,document:order.customer.document,phone:order.customer.phone,ip,...address},shipping:address,pix:{expires_in_days:1},extra:{metadata:{order_id:order.id,pedido_origem:'tapstar',shipping_method:order.quote.shipping_method,delivery:order.quote.delivery}}};}
export function paymentReference(order,payment){return payment?.external_code===order.id&&payment?.payment_method===order.method&&validPaymentCode(payment?.payment_code)?payment.payment_code:null;}
export function verifyPayment(order,payment){if(payment?.external_code!==order.id||payment?.payment_method!==order.method||Number(payment?.payment_amount)!==order.quote.total_cents||Number(payment?.shipping_amount)!==order.quote.shipping_cents||!validPaymentCode(payment?.payment_code)||(order.payment_code&&payment.payment_code!==order.payment_code))throw new GatewayError('PAYMENT_MISMATCH');}
export function publicPayment(order,payment){const pix=payment?.pix;return {order_id:order.id,status:payment?.payment_status||order.status||'pending',total_cents:order.quote.total_cents,...(pix?{pix:{text:pix.pix_qrcode_text,image:/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(pix.pix_qrcode_image||'')?pix.pix_qrcode_image:null,expires_at:pix.pix_expires_at}}:{})};}
