import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import webhook from '../api/webhook.js';
import {signToken} from '../lib/security.js';

const env={SHOP_READY:'true',APP_URL:'https://shop.example.com',SELLER_DETAILS:'TEST ONLY',ORDER_SECRET:'b'.repeat(64),MANGOFY_API_KEY:'TEST_WEBHOOK_KEY',MANGOFY_STORE_CODE:'TEST_WEBHOOK_STORE'};
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
let sequence=1;
function notification(overrides={}){
 return {external_code:`TS-${randomUUID()}`,payment_code:`pay_webhook_test_${sequence++}`,payment_method:'pix',payment_status:'approved',payment_amount:4995,shipping_amount:0,...overrides};
}
async function call(body,query={},method='POST'){
 const out=response();
 await webhook({method,headers:{'x-forwarded-for':`2001:db8:1::${(sequence++).toString(16)}`},query,body},out);
 return out;
}
async function isolated(run){
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 const originalFetch=global.fetch,originalInfo=console.info,originalError=console.error;
 const logs=[];Object.assign(process.env,env);
 console.info=console.error=line=>logs.push(JSON.parse(line));
 try{await run(logs);}finally{
  global.fetch=originalFetch;console.info=originalInfo;console.error=originalError;
  for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
}

test('webhook URL check reports configuration without querying the provider or exposing secrets',async()=>isolated(async()=>{
 let calls=0;global.fetch=async()=>{calls++;throw Error('must not query');};
 const ready=await call(undefined,{},'GET');
 assert.equal(ready.code,200);assert.equal(ready.headers['Cache-Control'],'no-store');
 assert.deepEqual(ready.data,{ready:true,method:'POST',payment_method:'pix'});
 process.env.SHOP_READY='false';const paused=await call(undefined,{},'GET');assert.equal(paused.data.ready,false);
 const other=await call(undefined,{},'PUT');assert.equal(other.code,405);assert.equal(other.headers.Allow,'GET, POST');
 assert.equal(calls,0);
 for(const key of ['ORDER_SECRET','MANGOFY_API_KEY','MANGOFY_STORE_CODE'])assert.equal(JSON.stringify(ready.data).includes(env[key]),false);
}));

test('fixed URL verifies real API status, ignores a posted approval and safely accepts duplicate callbacks',async()=>isolated(async logs=>{
 const body=notification({customer:{email:'PRIVATE_CUSTOMER'},pix:{pix_qrcode_text:'PRIVATE_PIX'}});
 let gets=0;global.fetch=async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(url,`https://checkout.mangofy.com.br/api/v1/payment/${body.payment_code}`);
  assert.equal(options.headers.Authorization,'TEST_WEBHOOK_KEY');assert.equal(options.headers['Store-Code'],'TEST_WEBHOOK_STORE');
  gets++;return Response.json({...body,payment_status:'pending'});
 };
 for(let i=0;i<2;i++){const result=await call(body);assert.equal(result.code,200);assert.deepEqual(result.data,{received:true});}
 assert.equal(gets,2);assert.deepEqual(logs.map(log=>log.status),['pending','pending']);
 assert.ok(logs.every(log=>log.event==='tapstar.webhook.verified'));
 const publicData=JSON.stringify(logs);
 for(const secret of ['PRIVATE_CUSTOMER','PRIVATE_PIX','TEST_WEBHOOK_KEY','TEST_WEBHOOK_STORE'])assert.equal(publicData.includes(secret),false);
}));

test('fixed URL accepts an approved Pix with Full shipping and the same centavo totals',async()=>isolated(async logs=>{
 const body=notification({payment_amount:6685,shipping_amount:1690,currency:'BRL'});
 global.fetch=async(_url,options)=>{assert.equal(options.method,'GET');return Response.json(body);};
 const out=await call(JSON.stringify(body));assert.equal(out.code,200);assert.deepEqual(out.data,{received:true});
 assert.equal(logs[0].status,'approved');
}));

test('malformed callbacks and non-TapStar references are rejected before any API call',async()=>isolated(async()=>{
 let calls=0;global.fetch=async()=>{calls++;throw Error('must not query');};
 const valid=notification();
 for(const body of [undefined,[], 'not json',{},
  {...valid,payment_code:'../other'}, {...valid,payment_code:['pay_test']},
  {...valid,external_code:'another-store-order'}, {...valid,payment_method:'credit_card'},
  {...valid,payment_amount:90001}, {...valid,payment_amount:49.95},
  {...valid,shipping_amount:-1}, {...valid,shipping_amount:valid.payment_amount+1},
  {...valid,payment_amount:'4995'}, {...valid,shipping_amount:undefined}]){
  const out=await call(body);assert.equal(out.code,400);assert.equal(out.data.received,undefined);
 }
 assert.equal(calls,0);
}));

test('API references, methods, code, totals and currency must match before acknowledging',async()=>isolated(async()=>{
 const body=notification();
 for(const changes of [
  {external_code:`TS-${randomUUID()}`},{payment_method:'credit_card'},
  {payment_code:'pay_different'},{payment_amount:body.payment_amount+1},
  {shipping_amount:1690},{currency:'USD'},{payment_status:undefined}
 ]){
  global.fetch=async()=>Response.json({...body,...changes});
  const out=await call(body);assert.equal(out.code,502);assert.equal(out.data.received,undefined);
 }
}));

test('signed callbacks for existing charges still check the original receipt amounts',async()=>isolated(async()=>{
 const body=notification({payment_code:'p'.repeat(128)});
 const token=signToken('webhook',{id:body.external_code,total_cents:body.payment_amount,shipping_cents:body.shipping_amount});
 global.fetch=async(_url,options)=>{assert.equal(options.method,'GET');return Response.json(body);};
 const good=await call(body,{token});assert.equal(good.code,200);
 global.fetch=async()=>Response.json({...body,payment_amount:body.payment_amount+1});
 const changed=await call(body,{token});assert.equal(changed.code,502);assert.equal(changed.data.received,undefined);
}));

test('an invalid or expired signature never falls back to unsigned verification',async()=>isolated(async()=>{
 const body=notification();let calls=0;global.fetch=async()=>{calls++;throw Error('must not query');};
 const claims={id:body.external_code,total_cents:body.payment_amount,shipping_cents:body.shipping_amount};
 for(const token of ['invalid', ['invalid'],signToken('webhook',claims,-1),signToken('receipt',claims)]){
  const out=await call(body,{token});assert.equal(out.code,403);assert.equal(out.data.received,undefined);
 }
 assert.equal(calls,0);
}));

test('provider errors and timeout are not acknowledged and retries never create a payment',async()=>isolated(async logs=>{
 const body=notification();let calls=0;
 for(const reply of [
  ()=>Response.json({message:'PRIVATE_PROVIDER_ERROR TEST_WEBHOOK_KEY'},{status:401}),
  ()=>{throw new DOMException('PRIVATE_PROVIDER_TIMEOUT','TimeoutError');},
  ()=>new Response('PRIVATE_PROVIDER_HTML',{status:503,headers:{'content-type':'text/html'}})
 ]){
  global.fetch=async(_url,options)=>{calls++;assert.equal(options.method,'GET');return reply();};
  const out=await call(body);assert.equal(out.code,502);assert.equal(out.data.received,undefined);
  for(const secret of ['PRIVATE_PROVIDER_ERROR','TEST_WEBHOOK_KEY','PRIVATE_PROVIDER_TIMEOUT','PRIVATE_PROVIDER_HTML'])assert.equal(JSON.stringify([out.data,logs]).includes(secret),false);
 }
 global.fetch=async(_url,options)=>{calls++;assert.equal(options.method,'GET');return Response.json(body);};
 const retry=await call(body);assert.equal(retry.code,200);assert.equal(calls,4);
 assert.equal(logs.at(-1).status,'approved');
}));

test('pausing new sales does not block callbacks for existing Pix charges',async()=>isolated(async()=>{
 process.env.SHOP_READY='false';const body=notification();
 global.fetch=async(_url,options)=>{assert.equal(options.method,'GET');return Response.json(body);};
 const out=await call(body);assert.equal(out.code,200);
}));
