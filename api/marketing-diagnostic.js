// Temporary authenticated verification route. Remove after the runtime check.
// It never creates a charge, sends customer data or reports a real Purchase.
import {randomUUID} from 'node:crypto';
import {sameSecret,ipKey} from '../lib/security.js';
import {rateLimit} from '../lib/session.js';
import {utmifyPayload,sendUtmifyOrder} from '../lib/utmify.js';
import {metaContextFor,sendMetaEvent} from '../lib/meta.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
 if(!process.env.UTMIFY_API_TOKEN||!sameSecret(req.headers.authorization,`Bearer ${process.env.UTMIFY_API_TOKEN.trim()}`))return res.status(404).json({error:'Não encontrado.'});
 try{rateLimit(`marketing-diagnostic:${ipKey(req)}`,4,3600);}catch{return res.status(429).json({error:'Aguarde.'});}
 const now=new Date().toISOString(),id=`TS-INTEGRATION-TEST-${randomUUID()}`;
 const payment={external_code:id,payment_status:'pending',payment_amount:4995,shipping_amount:0,customer:{name:'Teste de integração TapStar',email:'integracao@example.com',phone:null,document:null},items:[{code:'google-azul',name:'Google Azul - TESTE',quantity:5,price:999}],metadata:{tapstar_utmify_created_at:now,tapstar_tracking:{utm_source:'FB',utm_campaign:'Teste de integração|TEST',utm_medium:'Verificação|TEST',utm_content:'Verificação|TEST',utm_term:'TEST'}}};
 const utmify=(async()=>{
  const pending={...utmifyPayload(payment),isTest:true};
  const waiting=await sendUtmifyOrder(pending);
  const paid=await sendUtmifyOrder({...pending,status:'paid',approvedDate:now.slice(0,19).replace('T',' ')});
  return {accepted:waiting.accepted&&paid.accepted,http_status:paid.http_status,statuses:['waiting_payment','paid'],isTest:true};
 })();
 const meta=(async()=>{
  // This PageView describes this actual verification request, never a sale.
  const context=metaContextFor(req),user_data={};
  if(context.ip)user_data.client_ip_address=context.ip;
  if(context.ua)user_data.client_user_agent=context.ua;
  const result=await sendMetaEvent({event_name:'PageView',event_id:`tapstar:${id}:pageview`,event_time:Math.floor(Date.now()/1000),action_source:'website',event_source_url:new URL('/api/marketing-diagnostic',process.env.APP_URL).href,user_data});
  return {accepted:result.events_received===1,events_received:result.events_received};
 })();
 const safe=r=>r.status==='fulfilled'?r.value:{accepted:false,kind:r.reason.kind||'NETWORK_ERROR',http_status:r.reason.upstream_status,code:r.reason.code,subcode:r.reason.subcode};
 const result=await Promise.allSettled([utmify,meta]);
 return res.status(200).json({utmify:safe(result[0]),meta:safe(result[1]),no_charge_created:true});
}
