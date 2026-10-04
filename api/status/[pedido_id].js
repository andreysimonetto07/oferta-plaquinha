import {begin,fail,readToken,signToken,ipKey} from '../../lib/security.js';
import {HttpError} from '../../lib/validation.js';
import {rateLimit} from '../../lib/session.js';
import {gateway,verifyPayment,publicPayment,validPaymentCode,paymentFailure,logPayment} from '../../lib/mangofy.js';
export default async function handler(req,res){
 if(!begin(req,res,'GET'))return;
 try{
  const id=req.query.pedido_id,claims=readToken(req.headers.authorization?.replace(/^Bearer /,''),'receipt');
  if(typeof id!=='string'||claims.id!==id)throw new HttpError(403,'Sessão de pagamento inválida.');
  rateLimit(`status:${ipKey(req)}`,100,300);
  const supplied=req.query.payment_code;
  if(supplied!==undefined&&(!validPaymentCode(supplied)||(claims.payment_code&&supplied!==claims.payment_code)))throw new HttpError(400,'Confira o código da cobrança fornecido pelo atendimento.');
  const payment_code=claims.payment_code||supplied;
  if(!payment_code)return res.status(200).json({order_id:id,status:'verification_required',total_cents:claims.total_cents,...(claims.failure?{failure:claims.failure}:{})});
  if(supplied)rateLimit(`recovery:${ipKey(req)}`,10,300);
  const order={id,method:'pix',payment_code,quote:{total_cents:claims.total_cents,shipping_cents:claims.shipping_cents}};
  try{
   // Recovery only reads an existing charge. Reference, total and freight must
   // match the signed receipt before exposing any Pix or issuing a new receipt.
   const payment=await gateway(`/api/v1/payment/${encodeURIComponent(payment_code)}`);verifyPayment(order,payment);
   const data=publicPayment(order,payment);
   if(supplied)data.access_token=signToken('receipt',{id,total_cents:claims.total_cents,shipping_cents:claims.shipping_cents,payment_code});
   return res.status(200).json(data);
  }catch(error){logPayment('tapstar.pix.status.failed',id,paymentFailure(error));throw error;}
 }catch(e){return fail(res,e);}
}
