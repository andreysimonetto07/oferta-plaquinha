import {bodyOf,fail,readToken,ipKey,fingerprintFor} from '../lib/security.js';
import {HttpError} from '../lib/validation.js';
import {gateway,verifyPayment,validPaymentCode,paymentFailure,logPayment} from '../lib/mangofy.js';
import {readiness} from '../lib/config.js';
import {rateLimit} from '../lib/session.js';
import {MAX_TOTAL_CENTS} from '../public/js/catalog.js';
import {syncUtmify,trackingFor} from '../lib/utmify.js';

const orderReference=/^TS-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const validAmounts=claims=>Number.isSafeInteger(claims.total_cents)&&claims.total_cents>0&&claims.total_cents<=MAX_TOTAL_CENTS&&Number.isSafeInteger(claims.shipping_cents)&&claims.shipping_cents>=0&&claims.shipping_cents<=claims.total_cents;

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 // URL checks do not query a payment or confirm that any Pix was paid.
 if(req.method==='GET')return res.status(200).json({ready:readiness(),method:'POST',payment_method:'pix'});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido.'});}
 let id;
 try{
  const body=bodyOf(req);
  if(typeof body.external_code!=='string'||!orderReference.test(body.external_code)||!validPaymentCode(body.payment_code)||(body.payment_method!==undefined&&body.payment_method!=='pix'))throw new HttpError(400,'Notificação inválida.');
  id=body.external_code;
  // Existing charges still use their signed callback. A fixed panel URL uses
  // the documented amounts, but these are only claims until verified by GET.
  // An invalid legacy signature must never fall back to the unsigned route.
  const claims=req.query?.token!==undefined?readToken(req.query.token,'webhook'):{id,total_cents:body.payment_amount,shipping_cents:body.shipping_amount};
  if(claims.id!==id||!validAmounts(claims))throw new HttpError(400,'Notificação inválida.');
  rateLimit(`webhook:${ipKey(req)}`,120,60);
  const payment=await gateway(`/api/v1/payment/${encodeURIComponent(body.payment_code)}`);
  verifyPayment({id,method:'pix',payment_code:body.payment_code,quote:{total_cents:claims.total_cents,shipping_cents:claims.shipping_cents}},payment);
  if(typeof payment.payment_status!=='string'||!/^[a-z_]{1,40}$/.test(payment.payment_status)||(payment.currency!==undefined&&payment.currency!=='BRL'))throw new HttpError(502,'Não foi possível validar a notificação.');
  // Log only the status fetched through the authenticated provider API. Never
  // log the posted approval, body, signature, credentials, customer or QR code.
  logPayment('tapstar.webhook.verified',id,{status:payment.payment_status});
  // Only authenticated provider data is forwarded. A delivery failure returns
  // 503 so the payment provider retries its callback, without another charge.
  const callbackTracking=trackingFor((body.metadata||body.extra?.metadata)?.tapstar_tracking);
  // Some provider GET responses omit metadata. A signed timestamp and hash
  // authenticate the callback's attribution without storing customer data.
  const fallback=claims.createdAt?{createdAt:claims.createdAt,...(claims.tracking_hash===fingerprintFor(callbackTracking)?{tracking:callbackTracking}:{})}:undefined;
  await syncUtmify(payment,{strict:true,fallback});
  // No local order history or automatic fulfillment. The provider is the source
  // of truth, and the customer status page independently checks its receipt.
  // Repeated callbacks are safe: no new charge or delivery action is created.
  return res.status(200).json({received:true});
 }catch(e){
  if(id)logPayment('tapstar.webhook.failed',id,[400,403].includes(e.status)?{kind:'INVALID_NOTIFICATION'}:e.status===429?{kind:'RATE_LIMIT'}:paymentFailure(e));
  return fail(res,e);
 }
}
