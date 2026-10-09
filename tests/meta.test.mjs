import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {metaContextFor,purchasePayload,sendMetaEvent,syncMeta} from '../lib/meta.js';
import {META_PIXEL_ID,purchaseEventId} from '../public/js/marketing-data.js';
import checkout from '../api/checkout.js';
import webhook from '../api/webhook.js';
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const customer={name:'Cliente Teste',email:' TESTE@example.com ',phone:'5511999999999',document:'52998224725',address:{street:'Rua Teste',number:'123',neighborhood:'Centro',city:'São Paulo',state:'SP',zipcode:'01001000'}};
const context={fbp:'fb.1.1791374400000.123456789',fbc:'fb.1.1791374400000.CLICK_TEST',ip:'192.0.2.1',ua:'TEST_BROWSER'};
const sample=()=>({external_code:`TS-${randomUUID()}`,payment_code:'pay_test_meta',payment_method:'pix',payment_status:'approved',payment_amount:4995,shipping_amount:0,approved_at:'2026-10-07T15:00:00Z',customer,items:[{code:'google-azul',name:'Google Azul',quantity:5,price:999}],metadata:{tapstar_meta:context,tapstar_utmify_created_at:'2026-10-07T14:00:00Z'}});
async function isolated(run){
 const env={SHOP_READY:'true',APP_URL:'https://www.tapstarnfc.online',SELLER_DETAILS:'TEST ONLY',ORDER_SECRET:'d'.repeat(64),MANGOFY_API_KEY:'TEST_PROVIDER_KEY',MANGOFY_STORE_CODE:'TEST_STORE',MANGOFY_BASE_URL:'https://checkout.mangofy.com.br',UTMIFY_API_TOKEN:'TEST_PRIVATE_UTM_TOKEN',META_PIXEL_ID,META_ACCESS_TOKEN:'TEST_PRIVATE_META_TOKEN',META_TEST_EVENT_CODE:''};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),original=global.fetch,info=console.info,error=console.error,logs=[];
 Object.assign(process.env,env);console.info=console.error=line=>logs.push(line);
 try{await run(logs);}finally{global.fetch=original;console.info=info;console.error=error;for(const [k,v] of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
test('browser installs one Meta pixel, preserves both UTMify tags and sends Purchase only once after approval',async()=>{
 const dom=new JSDOM('',{url:'https://www.tapstarnfc.online/?fbclid=CLICK_TEST',runScripts:'outside-only'});
 const source=(await readFile(new URL('../public/js/meta.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'').replaceAll('export ','');
 dom.window.eval(`const META_PIXEL_ID='${META_PIXEL_ID}';const purchaseEventId=id=>'tapstar:'+id+':purchase';`+source+';window.purchaseConfirmed=purchaseConfirmed;window.metaContext=metaContext;window.initMeta=initMeta;');
 dom.window.initMeta();dom.window.fbq('init',META_PIXEL_ID);dom.window.fbq('track','PageView');
 // A stale external loader must not activate a different Meta pixel.
 dom.window.fbq('init','9999999999999999');dom.window.fbq('trackSingle','9999999999999999','Purchase',{value:49.95,currency:'BRL'});
 assert.equal(dom.window.document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]').length,1);
 assert.equal(dom.window.fbq.queue.filter(a=>a[0]==='init').length,1);
 assert.equal(dom.window.fbq.queue.filter(a=>a.includes('PageView')).length,1);
 assert.equal(dom.window.fbq.queue.some(a=>a.includes('9999999999999999')),false);
 assert.match(dom.window.metaContext().fbc,/^fb\.1\.\d+\.CLICK_TEST$/);
 const order={order_id:'TS-browser-test',total_cents:4995};
 dom.window.purchaseConfirmed({...order,status:'pending'});assert.equal(dom.window.fbq.queue.filter(a=>a.includes('Purchase')).length,0);
 dom.window.purchaseConfirmed({...order,status:'approved'});dom.window.purchaseConfirmed({...order,status:'approved'});
 const events=dom.window.fbq.queue.filter(a=>a.includes('Purchase'));assert.equal(events.length,1);assert.equal(events[0][3].value,49.95);assert.equal(events[0][4].eventID,purchaseEventId(order.order_id));
 const utm=(await readFile(new URL('../public/js/utmify.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('captureTracking();','');
 dom.window.eval(utm);dom.window.eval(utm);
 assert.equal(dom.window.pixelId,'6997c4440a47f2ab82f43662');
 assert.equal(dom.window.document.querySelectorAll('script[src="https://cdn.utmify.com.br/scripts/pixel/pixel.js"]').length,1);
 const utms=dom.window.document.querySelector('script[src="https://cdn.utmify.com.br/scripts/utms/latest.js"]');assert.ok(utms.hasAttribute('data-utmify-prevent-xcod-sck'));assert.ok(utms.hasAttribute('data-utmify-prevent-subids'));
 dom.window.close();
});
test('server keeps validated click cookies and hashes normalized personal identifiers for an approved purchase',()=>isolated(async()=>{
 assert.equal(metaContextFor({headers:{'x-forwarded-for':'INVALID','user-agent':'TEST'}},null).ip,null);
 assert.equal(metaContextFor({headers:{}},{fbc:'INJECTED'}).fbc,null);
 const p=sample(),event=purchasePayload(p),hash=v=>createHash('sha256').update(v).digest('hex');
 assert.equal(event.event_id,purchaseEventId(p.external_code));assert.equal(event.event_time,1791385200);assert.equal(event.custom_data.value,49.95);assert.equal(event.custom_data.currency,'BRL');
 assert.equal(event.user_data.em[0],hash('teste@example.com'));assert.equal(event.user_data.ph[0],hash(customer.phone));assert.equal(event.user_data.fbc,context.fbc);assert.equal(event.user_data.client_ip_address,context.ip);
 assert.equal(JSON.stringify(event).includes(customer.email),false);assert.equal(JSON.stringify(event).includes(customer.document),false);
 assert.equal(purchasePayload({...p,payment_status:'pending'}),null);assert.equal(purchasePayload({...p,metadata:{}}),null);
 assert.throws(()=>purchasePayload({...p,payment_amount:0}));
}));
test('a previous CAPI pixel configuration cannot use its token for the new pixel or interrupt a verified webhook',()=>isolated(async()=>{
 const p=sample();let metaCalls=0,utmCalls=0;
 process.env.META_PIXEL_ID='9999999999999999';
 global.fetch=async(url,opts)=>{
  if(url.startsWith('https://graph.facebook.com')){metaCalls++;throw Error('An unconfigured pixel must not receive a server event');}
  if(url.startsWith('https://api.utmify.com.br')){utmCalls++;assert.equal(JSON.parse(opts.body).status,'paid');return Response.json({OK:true});}
  assert.equal(opts.method,'GET');return Response.json(p);
 };
 assert.deepEqual(await syncMeta(p,{strict:true}),{skipped:true,reason:'PIXEL_NOT_CONFIGURED'});
 const out=response();await webhook({method:'POST',headers:{},body:p},out);
 assert.equal(out.code,200);assert.equal(out.data.received,true);assert.equal(metaCalls,0);assert.equal(utmCalls,1);
}));
test('CAPI requires events_received, retries rejections and keeps the token private with stable deduplication',()=>isolated(async logs=>{
 const p=sample();let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(url,`https://graph.facebook.com/v26.0/${META_PIXEL_ID}/events`);assert.equal(options.redirect,'error');const b=JSON.parse(options.body);assert.equal(b.access_token,'TEST_PRIVATE_META_TOKEN');assert.equal(b.test_event_code,undefined);return Response.json({events_received:0,error:{code:190,error_subcode:463,message:'PRIVATE_ERROR'}});};
 await assert.rejects(()=>syncMeta(p,{strict:true}));
 global.fetch=async()=>{calls++;return Response.json({events_received:1,fbtrace_id:'test-ack'});};
 await Promise.all([syncMeta(p,{strict:true}),syncMeta(p,{strict:true})]);assert.equal(calls,2);
 await syncMeta(p);assert.equal(calls,2);assert.equal((await syncMeta({...p,payment_status:'pending'})).skipped,true);
 assert.ok(logs.some(s=>s.includes('190')));assert.ok(logs.every(s=>!s.includes('PRIVATE_META_TOKEN')&&!s.includes('PRIVATE_ERROR')&&!s.includes(customer.email)));
 global.fetch=async()=>Response.json({events_received:0});await assert.rejects(()=>sendMetaEvent(purchasePayload(sample())));
}));
test('checkout preserves attribution and only authenticated payment approval sends Meta and UTMify with retry',()=>isolated(async()=>{
 let payment,postback,charges=0,metaCalls=0,utm=[],rejectMeta=true;
 global.fetch=async(url,opts)=>{
  if(url.startsWith('https://graph.facebook.com')){metaCalls++;return Response.json(rejectMeta?{error:{code:100}}:{events_received:1});}
  if(url.startsWith('https://api.utmify.com.br')){utm.push(JSON.parse(opts.body));return Response.json({OK:true});}
  if(opts.method==='POST'){charges++;const body=JSON.parse(opts.body);postback=body.postback_url;payment={...sample(),external_code:body.external_code,payment_status:'pending',customer:body.customer,items:body.items,metadata:body.extra.metadata,pix:{pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE'}};return Response.json(payment);}
  return Response.json(payment);
 };
 const req={method:'POST',headers:{origin:'https://www.tapstarnfc.online','idempotency-key':randomUUID(),'x-forwarded-for':'192.0.2.2','user-agent':'TEST_BROWSER'},body:{action:'prepare',items:[{id:'google-azul',variant:'Azul',quantity:5}],customer,payment_method:'pix',tracking:{utm_source:'FB',utm_campaign:'campaign|123'},meta:context}};
 const prep=response();await checkout(req,prep);assert.equal(prep.code,200);assert.equal(metaCalls,0);
 const pix=response();await checkout({...req,body:{...req.body,action:'create',checkout_token:prep.data.checkout_token}},pix);assert.equal(pix.code,201);assert.equal(metaCalls,0);assert.equal(utm.at(-1).status,'waiting_payment');assert.equal(payment.metadata.tapstar_meta.fbc,context.fbc);
 const notification={...payment,payment_status:'approved'};
 const callback=()=>({method:'POST',headers:{},body:notification,query:Object.fromEntries(new URL(postback).searchParams)});
 let out=response();await webhook(callback(),out);assert.equal(out.code,200);assert.equal(metaCalls,0);
 payment.payment_status='approved';out=response();await webhook(callback(),out);assert.equal(out.code,503);assert.equal(metaCalls,1);assert.equal(utm.at(-1).status,'paid');
 rejectMeta=false;out=response();await webhook(callback(),out);assert.equal(out.code,200);assert.equal(metaCalls,2);assert.equal(charges,1);
 out=response();await webhook(callback(),out);assert.equal(out.code,200);assert.equal(metaCalls,2);
}));
