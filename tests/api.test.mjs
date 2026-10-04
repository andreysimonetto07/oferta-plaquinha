import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import checkout from '../api/checkout.js';import status from '../api/status/[pedido_id].js';import webhook from '../api/webhook.js';import config from '../api/config.js';
import {readToken,signToken} from '../lib/security.js';
import {readiness,gatewayBase} from '../lib/config.js';
import {paymentPath} from '../lib/mangofy.js';
const customer={name:'Maria Silva',email:'maria@example.com',phone:'45999999999',document:'52998224725',address:{street:'Rua Teste',number:'123',neighborhood:'Centro',city:'Cascavel',state:'PR',zipcode:'85810000'}};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const env={SHOP_READY:'true',APP_URL:'https://shop.example.com',SELLER_DETAILS:'TEST ONLY',ORDER_SECRET:'a'.repeat(64),MANGOFY_API_KEY:'TEST_KEY',MANGOFY_STORE_CODE:'TEST_STORE'};
function enable(){Object.assign(process.env,env);delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;}
function disable(){for(const k of Object.keys(env))delete process.env[k];}
let requestNumber=1;
function request(body={}){return {method:'POST',headers:{origin:env.APP_URL,'idempotency-key':randomUUID(),'x-forwarded-for':'2001:db8::'+(requestNumber++).toString(16)},body:{items:[{id:'google-azul',variant:'Azul',quantity:25}],shipping_method:'standard',customer,payment_method:'pix',...body}};}
async function prepare(req){const r=response();await checkout({...req,body:{...req.body,action:'prepare'}},r);assert.equal(r.code,200);return {...req,body:{...req.body,action:'create',checkout_token:r.data.checkout_token}};}
test('unconfigured store refuses creation',async()=>{delete process.env.SHOP_READY;const r=response();await checkout({method:'POST',headers:{}},r);assert.equal(r.code,503);});
test('ready config needs no database variables',()=>{enable();try{const r=response();config({method:'GET'},r);assert.equal(r.data.ready,true);assert.equal(r.data.order_storage,'provider');assert.equal(r.data.payment_method,'pix');}finally{disable();}});
test('V1 Pix uses the documented unified endpoint even with an old environment flag',()=>{process.env.MANGOFY_API_STYLE='method';try{assert.equal(paymentPath('pix'),'/api/v1/payment');assert.throws(()=>paymentPath('credit_card'));}finally{delete process.env.MANGOFY_API_STYLE;}});
test('documentation placeholder and malformed origins cannot enable live payments',()=>{enable();try{for(const url of ['https://whitelabel-checkout.test','https://checkout.mangofy.com.br/api/v1/payment','https://key@example.com','http://checkout.mangofy.com.br']){process.env.MANGOFY_BASE_URL=url;assert.equal(readiness(),false);assert.throws(()=>gatewayBase());}process.env.MANGOFY_BASE_URL='https://checkout.mangofy.com.br';assert.equal(readiness(),true);process.env.APP_URL='https://shop.example.com?secret=value';assert.equal(readiness(),false);}finally{delete process.env.MANGOFY_BASE_URL;disable();}});
test('invalid origin, card, minimum and altered ticket never reach provider',async()=>{enable();const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('should not call');};try{for(const req of [request({payment_method:'credit_card'}),request({items:[{id:'google-azul',variant:'Azul',quantity:4}]}),{...request(),headers:{origin:'https://evil.example.com','idempotency-key':randomUUID()}}]){const r=response();await checkout(req,r);assert.ok([400,403].includes(r.code));}const good=await prepare(request());const altered=response();await checkout({...good,body:{...good.body,shipping_method:'full'}},altered);assert.equal(altered.code,409);assert.equal(calls,0);}finally{global.fetch=original;disable();}});
test('prepare and create refuse over-limit totals and never trust a client amount',async()=>{enable();const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('should not call');};try{for(const action of ['prepare','create'])for(const [quantity,shipping_method] of [[121,'standard'],[118,'full']]){const req=request({action,items:[{id:'google-azul',variant:'Azul',quantity}],shipping_method,total_cents:1,checkout_token:'forged'});const r=response();await checkout(req,r);assert.equal(r.code,400);assert.match(r.data.error,/limite por pagamento/);}const allowed=request({items:[{id:'google-azul',variant:'Azul',quantity:100}]});const ready=await prepare(allowed);assert.equal(readToken(ready.body.checkout_token,'prepare').total_cents,74900);const altered=response();await checkout({...ready,body:{...ready.body,items:[{id:'google-azul',variant:'Azul',quantity:121}],total_cents:74900}},altered);assert.equal(altered.code,400);assert.equal(calls,0);}finally{global.fetch=original;disable();}});
test('stateless receipt confirms directly from Mangofy, callbacks ignore posted approvals',async()=>{enable();const original=global.fetch;let creates=0,payment,postback;global.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://checkout.mangofy.com.br/'));assert.equal(options.headers.Authorization,'TEST_KEY');assert.equal(options.headers['Store-Code'],'TEST_STORE');assert.equal(options.redirect,'error');if(options.method==='POST'){assert.equal(String(url),'https://checkout.mangofy.com.br/api/v1/payment');creates++;const body=JSON.parse(options.body);assert.equal(body.payment_method,'pix');assert.equal(body.payment_format,'regular');assert.equal(body.pix.expires_in_days,1);assert.equal(body.customer.phone,'5545999999999');assert.equal(body.customer.zip_code,'85810000');assert.equal(body.shipping.street_number,'123');assert.deepEqual(body.items[0],{code:'google-azul',name:'Google Azul · Azul',quantity:25,price:999,description:'Azul',digital_flag:false});postback=body.postback_url;assert.equal(body.payment_amount,26665);assert.equal(body.shipping_amount,1690);payment={external_code:body.external_code,payment_code:'pay_test_1',payment_method:'pix',payment_amount:26665,shipping_amount:1690,payment_status:'pending',pix:{pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE',pix_qrcode_image:'data:image/png;base64,AA==',pix_expires_at:'2099-01-01'}};}return Response.json(payment);};try{const req=await prepare(request({shipping_method:'full',total_cents:1}));const a=response();await checkout(req,a);assert.equal(a.code,201);assert.equal(a.data.status,'pending');const b=response();await checkout(req,b);assert.equal(creates,1);assert.equal(a.data.order_id,b.data.order_id);const receipt=readToken(a.data.access_token,'receipt');assert.equal(receipt.customer,undefined);assert.equal(receipt.total_cents,26665);const noAuth=response();await status({method:'GET',headers:{},query:{pedido_id:a.data.order_id}},noAuth);assert.equal(noAuth.code,403);const forged=response();await status({method:'GET',headers:{authorization:`Bearer ${a.data.access_token.slice(0,-1)}x`},query:{pedido_id:a.data.order_id}},forged);assert.equal(forged.code,403);const url=new URL(postback),w=response();await webhook({method:'POST',headers:{},query:Object.fromEntries(url.searchParams),body:{...payment,payment_status:'approved'}},w);assert.equal(w.code,200);const pending=response();await status({method:'GET',headers:{authorization:`Bearer ${a.data.access_token}`},query:{pedido_id:a.data.order_id}},pending);assert.equal(pending.data.status,'pending');payment.payment_status='approved';const s=response();await status({method:'GET',headers:{authorization:`Bearer ${a.data.access_token}`},query:{pedido_id:a.data.order_id}},s);assert.equal(s.data.status,'approved');assert.equal(s.data.customer,undefined);payment.payment_amount=1;const mismatch=response();await webhook({method:'POST',headers:{},query:Object.fromEntries(url.searchParams),body:payment},mismatch);assert.equal(mismatch.code,502);}finally{global.fetch=original;disable();}});
test('provider timeout is uncertain, one warm instance does not create again',async()=>{enable();const original=global.fetch;let creates=0;global.fetch=async()=>{creates++;throw Error('timeout');};try{const req=await prepare(request());const a=response();await checkout(req,a);assert.equal(a.code,202);assert.equal(a.data.status,'verification_required');const b=response();await checkout(req,b);assert.equal(b.code,202);assert.equal(creates,1);const r=response();await status({method:'GET',headers:{authorization:`Bearer ${a.data.access_token}`},query:{pedido_id:a.data.order_id}},r);assert.equal(r.data.status,'verification_required');assert.equal(creates,1);}finally{global.fetch=original;disable();}});
test('signed sessions expire and signatures cannot change their purpose',()=>{enable();try{const t=signToken('receipt',{id:'test'},-1);assert.throws(()=>readToken(t,'receipt'),/expirada/);const valid=signToken('prepare',{id:'test'});assert.throws(()=>readToken(valid,'receipt'));}finally{disable();}});

test('provider failures retain safe HTTP diagnostics without leaking credentials or response bodies',async()=>{
 enable();const original=global.fetch,oldInfo=console.info,oldError=console.error,logs=[];
 console.info=console.error=value=>logs.push(value);
 const privateText='PRIVATE_TEST_CUSTOMER TEST_KEY TEST_STORE';
 const cases=[
  [()=>Response.json({message:privateText},{status:401}),'AUTHORIZATION',401],
  [()=>new Response('<html>'+privateText+'</html>',{status:403,headers:{'content-type':'text/html'}}),'ACCESS_DENIED',403],
  [()=>Response.json({message:privateText,errors:{'customer.email':[privateText],[privateText]:[privateText]}},{status:422}),'VALIDATION',422],
  [()=>Response.json({message:privateText},{status:503}),'PROVIDER_UNAVAILABLE',503],
  [()=>new Response('<html>'+privateText+'</html>',{headers:{'content-type':'text/html'}}),'INVALID_RESPONSE',200],
  [()=>Response.json(null),'INVALID_RESPONSE',200],
  [()=>{throw new DOMException(privateText,'TimeoutError');},'TIMEOUT',undefined],
  [()=>{throw new TypeError(privateText);},'NETWORK_ERROR',undefined]
 ];
 try{
  for(const [reply,kind,httpStatus] of cases){
   let calls=0;global.fetch=async()=>{calls++;return reply();};
   const req=await prepare(request()),a=response();await checkout(req,a);
   assert.equal(a.code,202);assert.equal(a.data.status,'verification_required');
   assert.equal(a.data.failure.kind,kind);assert.equal(a.data.failure.http_status,httpStatus);
   const claims=readToken(a.data.access_token,'receipt');assert.equal(claims.failure.kind,kind);
   if(kind==='VALIDATION')assert.deepEqual(a.data.failure.fields,['customer.email']);
   const b=response();await checkout(req,b);assert.equal(calls,1);
   const s=response();await status({method:'GET',headers:{authorization:'Bearer '+a.data.access_token},query:{pedido_id:a.data.order_id}},s);
   assert.equal(s.data.failure.kind,kind);assert.equal(calls,1);
   const published=JSON.stringify([a.data,s.data,claims,logs]);
   for(const secret of ['PRIVATE_TEST_CUSTOMER','TEST_KEY','TEST_STORE'])assert.equal(published.includes(secret),false);
  }
 }finally{global.fetch=original;console.info=oldInfo;console.error=oldError;disable();}
});

test('missing QR and amount mismatch preserve the matching payment code for read-only follow-up',async()=>{
 enable();const original=global.fetch,oldInfo=console.info,oldError=console.error;
 console.info=console.error=()=>{};
 try{
  for(const mismatch of [false,true]){
   let payment,posts=0,gets=0;
   global.fetch=async(_url,options)=>{
    if(options.method==='POST'){
     posts++;const body=JSON.parse(options.body);
     payment={payment_code:'pay_recovery_'+randomUUID(),external_code:body.external_code,payment_method:'pix',payment_status:'pending',payment_amount:body.payment_amount+(mismatch?1690:0),shipping_amount:body.shipping_amount};
    }else{gets++;if(!mismatch)payment.pix={pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE'};}
    return Response.json(payment);
   };
   const req=await prepare(request({shipping_method:'full'})),r=response();await checkout(req,r);
   assert.equal(r.code,202);assert.equal(r.data.failure.kind,mismatch?'PAYMENT_MISMATCH':'MISSING_PIX');
   assert.equal(readToken(r.data.access_token,'receipt').payment_code,payment.payment_code);
   const s=response();await status({method:'GET',headers:{authorization:'Bearer '+r.data.access_token},query:{pedido_id:r.data.order_id}},s);
   assert.equal(posts,1);assert.equal(gets,1);
   if(mismatch){assert.equal(s.code,502);assert.equal(s.data.pix,undefined);}
   else{assert.equal(s.code,200);assert.equal(s.data.pix.text,'TEST_ONLY_NOT_PAYABLE');}
  }
 }finally{global.fetch=original;console.info=oldInfo;console.error=oldError;disable();}
});

test('a legacy uncertain receipt can recover only its own existing payment without a new POST',async()=>{
 enable();const original=global.fetch,oldInfo=console.info,oldError=console.error;
 console.info=console.error=()=>{};let posts=0,gets=0;
 try{
  global.fetch=async()=>{posts++;throw new DOMException('TEST_ONLY_TIMEOUT','TimeoutError');};
  const req=await prepare(request({shipping_method:'full'})),r=response();await checkout(req,r);
  assert.equal(r.code,202);
  // Receipts issued before diagnostics were added have no failure or code.
  const current=readToken(r.data.access_token,'receipt');
  const legacy=signToken('receipt',{id:current.id,total_cents:current.total_cents,shipping_cents:current.shipping_cents});
  const payment={payment_code:'pay_legacy_existing',external_code:'TS-another-customer',payment_method:'pix',payment_status:'pending',payment_amount:current.total_cents,shipping_amount:current.shipping_cents,pix:{pix_qrcode_text:'TEST_ONLY_NOT_PAYABLE'},customer:{email:'PRIVATE_TEST_CUSTOMER'}};
  global.fetch=async(url,options)=>{assert.equal(options.method,'GET');assert.ok(String(url).endsWith('/pay_legacy_existing'));gets++;return Response.json(payment);};
  const call=async(code,token=legacy)=>{const out=response();await status({method:'GET',headers:{authorization:'Bearer '+token},query:{pedido_id:current.id,...(code===undefined?{}:{payment_code:code})}},out);return out;};
  assert.equal((await call()).data.status,'verification_required');assert.equal(gets,0);
  for(const code of ['../invalid',['pay_legacy_existing']])assert.equal((await call(code)).code,400);
  assert.equal((await call('pay_legacy_existing',legacy+'tampered')).code,403);assert.equal(gets,0);
  const wrong=await call('pay_legacy_existing');assert.equal(wrong.code,502);assert.equal(wrong.data.pix,undefined);assert.equal(wrong.data.access_token,undefined);
  payment.external_code=current.id;
  const good=await call('pay_legacy_existing');assert.equal(good.code,200);assert.equal(good.data.pix.text,'TEST_ONLY_NOT_PAYABLE');
  assert.equal(readToken(good.data.access_token,'receipt').payment_code,'pay_legacy_existing');assert.equal(good.data.customer,undefined);
  assert.equal(posts,1);assert.equal(gets,2);
 }finally{global.fetch=original;console.info=oldInfo;console.error=oldError;disable();}
});
