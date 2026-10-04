import {quote} from '../public/js/catalog.js';
import {HttpError,validateCustomer} from '../lib/validation.js';
import {readiness} from '../lib/config.js';
import {rateLimit,oncePerInstance} from '../lib/session.js';
import {assertOrigin,begin,bodyOf,fail,signToken,readToken,fingerprintFor,ipKey} from '../lib/security.js';
import {gateway,payloadFor,verifyPayment,publicPayment,paymentPath,paymentReference,paymentFailure,logPayment} from '../lib/mangofy.js';
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
   let payment;logPayment('tapstar.pix.create.started',id);
   try{
    payment=await gateway(paymentPath('pix'),payloadFor(order,ip));verifyPayment(order,payment);
    if(payment.payment_status!=='approved'&&(typeof payment.pix?.pix_qrcode_text!=='string'||!payment.pix.pix_qrcode_text.trim()))throw {kind:'MISSING_PIX'};
    logPayment('tapstar.pix.create.completed',id,{has_payment_code:true,has_pix:!!payment.pix?.pix_qrcode_text});
    return {code:201,data:{...publicPayment(order,payment),access_token:signToken('receipt',{...claims,payment_code:payment.payment_code})}};
   }catch(error){
    // A timeout can follow a created charge. Diagnostics do not authorize retry.
    // Preserve a matching provider reference even if QR or amounts need review.
    const failure=paymentFailure(error),payment_code=paymentReference(order,payment);
    logPayment('tapstar.pix.create.failed',id,{...failure,has_payment_code:!!payment_code});
    return {code:202,data:{order_id:id,status:'verification_required',total_cents:q.total_cents,failure,access_token:signToken('receipt',{...claims,failure,...(payment_code?{payment_code}:{})}),message:'Não gere outro Pix. O resultado desta tentativa precisa ser conferido pelo atendimento.'}};
   }
  });
  return res.status(result.code).json(result.data);
 }catch(e){return fail(res,e);}
}
