// Temporary authenticated deployment diagnostic, removed after verification.
import {sameSecret,begin,ipKey} from '../lib/security.js';
import {rateLimit} from '../lib/session.js';
import {randomUUID} from 'node:crypto';
export default async function handler(req,res){
 if(!begin(req,res,'POST'))return;
 const key=process.env.UTMIFY_API_TOKEN?.trim();
 if(!key||!sameSecret(req.headers.authorization,`Bearer ${key}`))return res.status(403).json({error:'Acesso restrito.'});
 try{
  rateLimit(`utm-diagnostic:${ipKey(req)}`,3,3600);
  const createdAt=new Date().toISOString().slice(0,19).replace('T',' ');
  const body={orderId:`TapStar-integration-test-${randomUUID()}`,platform:'TapStar',paymentMethod:'pix',status:'waiting_payment',createdAt,approvedDate:null,refundedAt:null,customer:{name:'Teste de Integracao',email:'teste@example.com',phone:null,document:null,country:'BR'},products:[{id:'google-azul',name:'Google Azul',planId:null,planName:null,quantity:5,priceInCents:999}],trackingParameters:{src:null,sck:null,utm_source:'integration-test',utm_campaign:null,utm_medium:null,utm_content:null,utm_term:null},commission:{totalPriceInCents:4995,gatewayFeeInCents:0,userCommissionInCents:4995,currency:'BRL'},isTest:true};
  const r=await fetch('https://api.utmify.com.br/api-credentials/orders',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-api-token':key},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  let data;try{data=await r.json();}catch{}
  return res.status(200).json({isTest:true,http_status:r.status,accepted:r.ok,response_keys:data&&typeof data==='object'?Object.keys(data):[]});
 }catch{return res.status(503).json({isTest:true,accepted:false});}
}
