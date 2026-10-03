import {begin,fail,readToken,ipKey} from '../../lib/security.js';
import {HttpError} from '../../lib/validation.js';
import {rateLimit} from '../../lib/session.js';
import {gateway,verifyPayment,publicPayment} from '../../lib/mangofy.js';
export default async function handler(req,res){
 if(!begin(req,res,'GET'))return;
 try{
  const id=req.query.pedido_id,claims=readToken(req.headers.authorization?.replace(/^Bearer /,''),'receipt');
  if(typeof id!=='string'||claims.id!==id)throw new HttpError(403,'Sessão de pagamento inválida.');
  rateLimit(`status:${ipKey(req)}`,100,300);
  if(!claims.payment_code)return res.status(200).json({order_id:id,status:'verification_required',total_cents:claims.total_cents});
  const order={id,method:'pix',payment_code:claims.payment_code,quote:{total_cents:claims.total_cents,shipping_cents:claims.shipping_cents}};
  const payment=await gateway(`/api/v1/payment/${encodeURIComponent(claims.payment_code)}`);verifyPayment(order,payment);
  return res.status(200).json(publicPayment(order,payment));
 }catch(e){return fail(res,e);}
}
