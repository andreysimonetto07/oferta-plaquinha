import {begin,bodyOf,fail,readToken} from '../lib/security.js';
import {HttpError} from '../lib/validation.js';
import {gateway,verifyPayment} from '../lib/mangofy.js';
export default async function handler(req,res){
 if(!begin(req,res,'POST'))return;
 try{
  const claims=readToken(req.query.token,'webhook'),body=bodyOf(req);
  if(body.external_code!==claims.id||typeof body.payment_code!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.payment_code))throw new HttpError(400,'Notificação inválida.');
  const payment=await gateway(`/api/v1/payment/${encodeURIComponent(body.payment_code)}`);
  verifyPayment({id:claims.id,method:'pix',payment_code:body.payment_code,quote:{total_cents:claims.total_cents,shipping_cents:claims.shipping_cents}},payment);
  // No local order history or automatic fulfillment. The provider is the source
  // of truth, and the customer status page queries it directly.
  return res.status(200).json({received:true});
 }catch(e){return fail(res,e);}
}
