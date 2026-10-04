import {quote} from '../public/js/catalog.js';
import {HttpError,validateCustomer} from '../lib/validation.js';
import {readiness} from '../lib/config.js';
import {rateLimit,oncePerInstance} from '../lib/session.js';
import {assertOrigin,begin,bodyOf,fail,signToken,readToken,fingerprintFor,ipKey} from '../lib/security.js';
import {gateway,payloadFor,verifyPayment,publicPayment,paymentPath} from '../lib/mangofy.js';
export default async function handler(req,res){
 if(!begin(req,res,'POST'))return;
 try{
  if(!readiness())throw new HttpError(503,'O Pix está em configuração. Nenhuma cobrança foi criada.');
  assertOrigin(req);rateLimit(`checkout:${ipKey(req)}`,30);
  const body=bodyOf(req);if(body.payment_method!=='pix')throw new HttpError(400,'A TapStar aceita somente Pix.');
  let q;try{q=quote(body.items,body.shipping_method||'standard');}catch(e){throw new HttpError(400,e.message);}
  const customer=validateCustomer(body.customer),key=req.headers['idempotency-key'];
  if(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key))throw new HttpError(400,'Reabra o checkout para continuar.');
  const id=`TS-${key.toLowerCase()}`,fingerprint=fingerprintFor({q,customer,method:'pix'});
  const claims={id,total_cents:q.total_cents,shipping_cents:q.shipping_cents};
  if(body.action==='prepare')return res.status(200).json({order_id:id,total_cents:q.total_cents,shipping_cents:q.shipping_cents,checkout_token:signToken('prepare',{...claims,fingerprint},1200)});
  if(body.action!=='create')throw new HttpError(400,'Etapa de pagamento inválida.');
  const ticket=readToken(body.checkout_token,'prepare');
  if(ticket.id!==id||ticket.fingerprint!==fingerprint||ticket.total_cents!==q.total_cents||ticket.shipping_cents!==q.shipping_cents)throw new HttpError(409,'O pedido mudou. Confira o carrinho antes de pagar.');
  const result=await oncePerInstance(id,fingerprint,async()=>{
   const order={id,customer,quote:q,method:'pix',status:'creating'};
   order.postback=`${new URL(process.env.APP_URL).origin}/api/webhook?token=${encodeURIComponent(signToken('webhook',claims))}`;
   const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
   try{
    const payment=await gateway(paymentPath('pix'),payloadFor(order,ip));verifyPayment(order,payment);
    return {code:201,data:{...publicPayment(order,payment),access_token:signToken('receipt',{...claims,payment_code:payment.payment_code})}};
   }catch{
    // A timeout may occur after the provider has created a charge. Do not resend.
    return {code:202,data:{order_id:id,status:'verification_required',total_cents:q.total_cents,access_token:signToken('receipt',claims),message:'Não gere outro Pix. O resultado desta tentativa precisa ser conferido na Mangofy.'}};
   }
  });
  return res.status(result.code).json(result.data);
 }catch(e){return fail(res,e);}
}
