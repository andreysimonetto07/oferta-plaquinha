import {begin,bodyOf,fail,sameSecret,webhookToken} from '../lib/security.js';
import {HttpError} from '../lib/validation.js';
import {getOrder,saveOrder} from '../lib/db.js';
import {gateway,verifyPayment} from '../lib/mangofy.js';
export default async function handler(req,res){if(!begin(req,res,'POST'))return;try{const id=req.query.order;if(typeof id!=='string'||!/^OP-[a-f0-9-]{36}$/.test(id)||!sameSecret(req.query.token,webhookToken(id)))throw new HttpError(403,'Notificação inválida.');const body=bodyOf(req);const order=await getOrder(id);if(!order)throw new HttpError(404,'Pedido não encontrado.');if(body.external_code!==id||typeof body.payment_code!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.payment_code))throw new HttpError(400,'Notificação inválida.');if(order.payment_code&&order.payment_code!==body.payment_code)throw new HttpError(400,'Pagamento divergente.');
 // The public documentation specifies no webhook signing header. Never trust posted approval:
 // reconcile by authenticated GET at Mangofy, including amount, shipping, external code and method.
 const payment=await gateway(`/api/v1/payment/${encodeURIComponent(body.payment_code)}`);verifyPayment(order,payment);order.payment_code=payment.payment_code;order.status=payment.payment_status;order.updated_at=new Date().toISOString();await saveOrder(order);res.status(200).json({received:true});}catch(e){fail(res,e);}}
