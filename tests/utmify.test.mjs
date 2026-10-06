import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {trackingFor,utmifyPayload,syncUtmify} from '../lib/utmify.js';
import checkout from '../api/checkout.js';
import webhook from '../api/webhook.js';
import status from '../api/status/[pedido_id].js';
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const customer={name:'Cliente Teste',email:'teste@example.com',phone:'45999999999',document:'52998224725',address:{street:'Rua Teste',number:'123',neighborhood:'Centro',city:'Cascavel',state:'PR',zipcode:'85810000'}};
const sample=()=>({external_code:`TS-${randomUUID()}`,payment_code:'pay_test_utm',payment_method:'pix',payment_status:'pending',payment_amount:4995,shipping_amount:0,created_at:'2026-10-06 12:00:00',customer,items:[{code:'google-azul',name:'Google Azul',quantity:5,price:999}],metadata:{tapstar_utmify_created_at:'2026-10-06T15:00:00Z',tapstar_tracking:{utm_source:'facebook',utm_campaign:'campaign-1'}}});
async function isolated(run){
 const env={SHOP_READY:'true',APP_URL:'https://www.tapstarnfc.online',SELLER_DETAILS:'TEST ONLY',ORDER_SECRET:'c'.repeat(64),MANGOFY_API_KEY:'TEST_PROVIDER_KEY',MANGOFY_STORE_CODE:'TEST_STORE',MANGOFY_BASE_URL:'https://checkout.mangofy.com.br',UTMIFY_API_TOKEN:'TEST_PRIVATE_UTM_TOKEN'};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),original=global.fetch,info=console.info,error=console.error,logs=[];
 Object.assign(process.env,env);console.info=console.error=line=>logs.push(line);
 try{await run(logs);}finally{global.fetch=original;console.info=info;console.error=error;for(const [k,v] of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test('attribution survives navigation, expires after 30 days and a new campaign replaces all old parameters',async()=>{
 const dom=new JSDOM('',{url:'https://www.tapstarnfc.online/?utm_source=facebook&utm_campaign=first&sck=click-1',runScripts:'outside-only'});
 const source=(await readFile(new URL('../public/js/tracking.js',import.meta.url),'utf8')).replaceAll('export ','');
 dom.window.eval(source+';window.captureTracking=captureTracking');
 assert.equal(dom.window.captureTracking().utm_campaign,'first');
 dom.reconfigure({url:'https://www.tapstarnfc.online/checkout.html'});assert.equal(dom.window.captureTracking().sck,'click-1');
 dom.reconfigure({url:'https://www.tapstarnfc.online/?utm_source=google'});assert.equal(dom.window.captureTracking().utm_campaign,null);
 dom.reconfigure({url:'https://www.tapstarnfc.online/checkout.html'});
 const old=JSON.parse(dom.window.localStorage.getItem('tapstar_attribution_v1'));old.expires=0;dom.window.localStorage.setItem('tapstar_attribution_v1',JSON.stringify(old));
 assert.equal(dom.window.captureTracking().utm_source,null);dom.window.close();
});
test('untrusted attribution is bounded and only known keys leave the server',()=>{
 const t=trackingFor({utm_source:'a'.repeat(300)+'\n',apiToken:'DO_NOT_FORWARD',sck:[]});
 assert.equal(t.utm_source.length,200);assert.equal(t.sck,null);assert.equal(t.apiToken,undefined);
});
test('status mapping preserves centavos, UTC dates, gross totals and a stable order identifier',()=>{
 const p=sample();for(const [provider,expected] of [['pending','waiting_payment'],['approved','paid'],['refused','refused'],['refunded','refunded'],['chargedback','chargedback']]){
  p.payment_status=provider;p.approved_at='2026-10-06T12:05:00-03:00';p.updated_at='2026-10-06T15:10:00Z';
  const payload=utmifyPayload(p);assert.equal(payload.status,expected);assert.equal(payload.createdAt,'2026-10-06 15:00:00');assert.equal(payload.approvedDate,'2026-10-06 15:05:00');assert.equal(payload.products[0].priceInCents,999);assert.equal(payload.commission.totalPriceInCents,4995);assert.equal(payload.orderId,p.external_code);assert.equal(payload.trackingParameters.utm_source,'facebook');assert.equal(payload.customer.address,undefined);
 }
 assert.equal(utmifyPayload({...p,payment_status:'unknown'}),null);
 assert.equal(utmifyPayload({...p,metadata:{}}),null);
 assert.throws(()=>utmifyPayload({...p,payment_status:'approved',approved_at:null}));
});
test('concurrent updates deduplicate, private token stays in server headers and failed sends retry',()=>isolated(async logs=>{
 const p=sample();let calls=0;
 global.fetch=async(url,opts)=>{assert.equal(url,'https://api.utmify.com.br/api-credentials/orders');assert.equal(opts.redirect,'error');assert.equal(opts.headers['x-api-token'],'TEST_PRIVATE_UTM_TOKEN');calls++;return Response.json({ok:true});};
 await Promise.all([syncUtmify(p),syncUtmify(p)]);assert.equal(calls,1);
 p.payment_status='approved';p.approved_at='2026-10-06T15:05:00Z';
 global.fetch=async()=>{calls++;return Response.json({error:'PRIVATE_RESPONSE'}, {status:500});};
 await assert.rejects(()=>syncUtmify(p,{strict:true}));
 global.fetch=async()=>{calls++;return Response.json({ok:true});};await syncUtmify(p,{strict:true});assert.equal(calls,3);
 p.payment_status='pending';await syncUtmify(p,{strict:true});assert.equal(calls,3);
 assert.ok(logs.every(log=>!log.includes('TEST_PRIVATE_UTM_TOKEN')&&!log.includes('PRIVATE_RESPONSE')&&!log.includes(customer.email)));
}));
test('Pix creation records pending, webhook sends only authenticated status, a failed paid sync retries without a charge',()=>isolated(async()=>{
 let payment,posts=0,utm=[],failPaid=true,postback;
 global.fetch=async(url,opts)=>{
  if(url.startsWith('https://api.utmify.com.br')){const body=JSON.parse(opts.body);utm.push(body);return Response.json({}, {status:body.status==='paid'&&failPaid?503:200});}
  if(opts.method==='POST'){
   posts++;const body=JSON.parse(opts.body);postback=body.postback_url;payment={...sample(),external_code:body.external_code,customer:body.customer,items:body.items,metadata:body.extra.metadata,pix:{pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE'}};
   return Response.json(payment);
  }
  return Response.json(payment);
 };
 const req={method:'POST',headers:{origin:'https://www.tapstarnfc.online','idempotency-key':randomUUID(),'x-forwarded-for':'2001:db8::999'},body:{action:'prepare',items:[{id:'google-azul',variant:'Azul',quantity:5}],customer,payment_method:'pix',shipping_method:'standard',tracking:{utm_source:'test-ad',utm_campaign:'real-attribution'}}};
 const prep=response();await checkout(req,prep);assert.equal(prep.code,200);assert.equal(utm.length,0);
 req.body={...req.body,action:'create',checkout_token:prep.data.checkout_token};const pix=response();await checkout(req,pix);assert.equal(pix.code,201);assert.equal(utm[0].status,'waiting_payment');assert.equal(utm[0].trackingParameters.utm_source,'test-ad');
 const createdAt=utm[0].createdAt;
 // A spoofed body cannot change attribution, status or the sale amount.
 const notification={...payment,payment_status:'approved',metadata:{tapstar_tracking:{utm_source:'forged'}}};
 let out=response();await webhook({method:'POST',headers:{},body:notification,query:{}},out);assert.equal(out.code,200);assert.equal(utm.length,1);
 payment.payment_status='approved';payment.approved_at='2026-10-06T15:05:00Z';
 out=response();await webhook({method:'POST',headers:{},body:notification,query:{}},out);assert.equal(out.code,503);
 failPaid=false;out=response();await webhook({method:'POST',headers:{},body:notification,query:{}},out);assert.equal(out.code,200);assert.equal(utm.at(-1).status,'paid');assert.equal(utm.at(-1).createdAt,createdAt);assert.equal(utm.at(-1).trackingParameters.utm_source,'test-ad');assert.equal(posts,1);
 const page=response();await status({method:'GET',headers:{authorization:`Bearer ${pix.data.access_token}`},query:{pedido_id:payment.external_code}},page);assert.equal(page.data.status,'approved');assert.equal(posts,1);assert.ok(!JSON.stringify(page.data).includes('TEST_PRIVATE_UTM_TOKEN'));
 // A signed callback still tracks a later refund if GET omits metadata.
 const trustedNotification={...payment,payment_status:'refunded',metadata:payment.metadata};
 payment={...payment,payment_status:'refunded',updated_at:'2026-10-06T15:10:00Z',metadata:undefined};
 const refund=response();await webhook({method:'POST',headers:{},body:trustedNotification,query:Object.fromEntries(new URL(postback).searchParams)},refund);
 assert.equal(refund.code,200);assert.equal(utm.at(-1).status,'refunded');assert.equal(utm.at(-1).trackingParameters.utm_source,'test-ad');assert.equal(utm.at(-1).createdAt,createdAt);
}));
test('UTMify outage never hides a generated Pix or allows changed attribution after preparation',()=>isolated(async()=>{
 let creates=0;
 global.fetch=async(url,opts)=>{if(url.startsWith('https://api.utmify.com.br'))throw Error('PRIVATE_TIMEOUT');creates++;const body=JSON.parse(opts.body);return Response.json({...sample(),external_code:body.external_code,metadata:body.extra.metadata,pix:{pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE'}});};
 const req={method:'POST',headers:{origin:'https://www.tapstarnfc.online','idempotency-key':randomUUID(),'x-forwarded-for':'2001:db8::998'},body:{action:'prepare',items:[{id:'google-azul',variant:'Azul',quantity:5}],customer,payment_method:'pix',tracking:{utm_source:'original'}}};
 const prep=response();await checkout(req,prep);
 const altered=response();await checkout({...req,body:{...req.body,action:'create',checkout_token:prep.data.checkout_token,tracking:{utm_source:'changed'}}},altered);assert.equal(altered.code,409);assert.equal(creates,0);
 const result=response();await checkout({...req,body:{...req.body,action:'create',checkout_token:prep.data.checkout_token}},result);assert.equal(result.code,201);assert.ok(result.data.pix.text);assert.equal(creates,1);
}));
test('HTTP 200 with an explicit provider rejection is retried instead of cached as delivered',()=>isolated(async()=>{
 const p=sample();let calls=0;global.fetch=async()=>{calls++;return Response.json({OK:false,result:'REJECTED'});};
 await assert.rejects(()=>syncUtmify(p,{strict:true}));
 global.fetch=async()=>{calls++;return Response.json({OK:true});};await syncUtmify(p,{strict:true});assert.equal(calls,2);
}));
