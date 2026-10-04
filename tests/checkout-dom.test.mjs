import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import QRCode from 'qrcode';

// These tests use the real handlers and client modules in an isolated DOM.
// Every fetch is intercepted below; no real credentials or charges are used.
const root=fileURLToPath(new URL('../',import.meta.url));
const base='https://shop.example.com';
Object.assign(process.env,{SHOP_READY:'true',APP_URL:base,SELLER_DETAILS:'TEST ONLY',ORDER_SECRET:'test-only-'.repeat(8),MANGOFY_API_KEY:'TEST_ONLY_KEY',MANGOFY_STORE_CODE:'TEST_ONLY_STORE',MANGOFY_BASE_URL:'https://checkout.mangofy.com.br'});
const checkoutApi=(await import(pathToFileURL(root+'api/checkout.js'))).default;
const configApi=(await import(pathToFileURL(root+'api/config.js'))).default;
const statusApi=(await import(pathToFileURL(root+'api/status/[pedido_id].js'))).default;
const pixText='SIMULACAO TAPSTAR - NAO E UM PIX - NAO PAGAR';
const pixImage=await QRCode.toDataURL(pixText,{width:240,margin:2});
let scenario,payments,providerCreates,statusCalls,copied,currentDom;

globalThis.fetch=async(url,options={})=>{
 const target=String(url);
 if(target.startsWith('https://checkout.mangofy.com.br/api/v1/payment')){
  if(options.method==='POST'){
   providerCreates++;
   if(scenario==='timeout')throw new Error('TEST_ONLY_TIMEOUT');
   if(scenario==='unauthorized')return Response.json({message:'TEST_ONLY_PRIVATE_KEY_AND_CUSTOMER'},{status:401});
   const body=JSON.parse(options.body);
   assert.equal(options.headers.Authorization,'TEST_ONLY_KEY');
   assert.equal(options.headers['Store-Code'],'TEST_ONLY_STORE');
   const payment={external_code:body.external_code,payment_code:'TEST-'+randomUUID(),payment_method:'pix',payment_status:'pending',payment_amount:body.payment_amount,shipping_amount:body.shipping_amount,pix:{pix_qrcode_text:pixText,pix_qrcode_image:pixImage,pix_expires_at:'2099-01-01 23:59:59'}};
   payments.set(payment.payment_code,payment);
   if(scenario==='lost-response')throw new DOMException('TEST_ONLY_TIMEOUT_AFTER_CREATION','TimeoutError');
   if(scenario==='missing-pix'){delete payment.pix;return Response.json(payment);}
   return Response.json(payment);
  }
  statusCalls++;
  const payment=payments.get(target.split('/').pop());
  if(payment&&scenario==='missing-pix')payment.pix={pix_qrcode_text:pixText,pix_qrcode_image:pixImage};
  return Response.json(payment||{message:'TEST ONLY not found'},{status:payment?200:404});
 }
 const response={code:200,setHeader(){},status(n){this.code=n;return this;},json(value){this.data=value;return this;}};
 const request={method:options.method||'GET',headers:{origin:base},query:{}};
 for(const [key,value] of Object.entries(options.headers||{}))request.headers[key.toLowerCase()]=value;
 if(options.body)request.body=JSON.parse(options.body);
 if(target==='/api/config')await configApi(request,response);
 else if(target==='/api/checkout'){
  await checkoutApi(request,response);
  if(scenario==='changed-price'&&request.body.action==='prepare'&&response.code===200)response.data.total_cents+=100;
 }else if(target.startsWith('/api/status/')){
  const parsed=new URL(target,base);
  request.query={...Object.fromEntries(parsed.searchParams),pedido_id:decodeURIComponent(parsed.pathname.split('/').pop())};
  await statusApi(request,response);
 }else throw new Error('Unexpected test URL: '+target);
 return Response.json(response.data,{status:response.code});
};

async function until(condition){
 for(let i=0;i<100;i++){
  if(condition())return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error('DOM test timed out');
}
const storageSnapshot=()=>Array.from({length:localStorage.length},(_,i)=>{
 const key=localStorage.key(i);return [key,localStorage.getItem(key)];
});
async function page(file='checkout.html',storage=null,search=''){
 currentDom?.window.close();
 currentDom=new JSDOM(await readFile(root+'public/'+file,'utf8'),{url:base+'/'+file+search,pretendToBeVisual:true});
 Object.assign(globalThis,{window:currentDom.window,document:currentDom.window.document,FormData:currentDom.window.FormData,localStorage:currentDom.window.localStorage,sessionStorage:currentDom.window.sessionStorage,location:{href:base+'/'+file+search,search}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async writeText(value){copied=value;}}}});
 if(storage)for(const [key,value] of storage)localStorage.setItem(key,value);
 else localStorage.setItem('tapstar_cart_v3',JSON.stringify([{id:'google-azul',variant:'Azul',quantity:5}]));
 const module=file==='checkout.html'?'checkout.js':'status.js';
 await import(pathToFileURL(root+'public/js/'+module).href+'?test='+randomUUID());
 if(file==='checkout.html'&&!storage)await until(()=>!document.querySelector('#pay-button').disabled);
}
async function setup(mode='pending'){
 scenario=mode;payments=new Map();providerCreates=0;statusCalls=0;copied='';
 await page();
}
function validForm(documentValue='52998224725'){
 const values={name:'Cliente Teste',email:'teste@example.com',phone:'45999999999',document:documentValue,zipcode:'85810000',state:'PR',street:'Rua Teste',number:'123',neighborhood:'Centro',city:'Cascavel'};
 for(const [name,value] of Object.entries(values))document.querySelector('[name="'+name+'"]').value=value;
 // Consent is only on this in-memory fixture, never on the public store.
 document.querySelector('input[type="checkbox"]').checked=true;
 assert.equal(document.querySelector('#checkout-form').checkValidity(),true);
}
function submit(){document.querySelector('#checkout-form').requestSubmit();}
async function generated(){await until(()=>!document.querySelector('#payment-result').hidden&&!!document.querySelector('textarea'));}
function otherTabSelection(quantity,shipping='standard'){
 localStorage.setItem('tapstar_cart_v3',JSON.stringify([{id:'google-azul',variant:'Azul',quantity}]));
 localStorage.setItem('tapstar_shipping_v1',shipping);
 window.dispatchEvent(new window.StorageEvent('storage',{key:'tapstar_cart_v3'}));
 window.dispatchEvent(new window.StorageEvent('storage',{key:'tapstar_shipping_v1'}));
}
after(()=>currentDom?.window.close());

test('checkout renders QR and copy-and-paste, blocks duplicate clicks and saves no customer data',async()=>{
 await setup();validForm();submit();submit();
 assert.ok([...document.querySelectorAll('fieldset')].every(el=>el.disabled));
 await generated();assert.equal(providerCreates,1);
 assert.equal(document.querySelector('#checkout-form').hidden,true);
 assert.equal(document.querySelector('textarea').value,pixText);
 assert.equal(document.querySelector('img[alt="QR Code Pix"]').src,pixImage);
 [...document.querySelectorAll('button')].find(el=>el.textContent==='Copiar código Pix').click();
 await until(()=>copied===pixText);
 const saved=JSON.stringify(storageSnapshot());
 for(const value of ['Cliente Teste','teste@example.com','52998224725','Rua Teste','TEST_ONLY_KEY','TEST_ONLY_STORE'])assert.equal(saved.includes(value),false);
});

test('reload restores a pending Pix without another creating POST',async()=>{
 await setup();validForm();submit();await generated();
 await page('checkout.html',storageSnapshot());await generated();
 assert.equal(providerCreates,1);assert.equal(document.querySelector('textarea').value,pixText);
});

test('pending to approved consults the server and clears only the corresponding attempt and cart',async()=>{
 await setup();validForm();submit();await generated();
 const attempt=JSON.parse(localStorage.getItem('tapstar_pix_attempt_v1'));
 await page('obrigado.html',storageSnapshot(),'?pedido='+encodeURIComponent(attempt.order_id));
 await until(()=>document.querySelector('#status-title').textContent==='Aguardando seu pagamento.');
 for(const payment of payments.values())payment.payment_status='approved';
 document.querySelector('#refresh-status').click();
 await until(()=>document.querySelector('#status-title').textContent==='Pagamento confirmado!');
 assert.equal(localStorage.getItem('tapstar_pix_attempt_v1'),null);
 assert.deepEqual(JSON.parse(localStorage.getItem('tapstar_cart_v3')),[]);
 assert.ok(statusCalls>=2);assert.equal(providerCreates,1);
});

test('timeout and reload preserve uncertainty and prevent automatic creating retries',async()=>{
 await setup('timeout');validForm();submit();submit();
 await until(()=>document.querySelector('#payment-result').textContent.includes('Vamos conferir seu Pix.'));
 assert.equal(providerCreates,1);assert.equal(JSON.parse(localStorage.getItem('tapstar_pix_attempt_v1')).state,'unknown');
 await page('checkout.html',storageSnapshot());
 await until(()=>document.querySelector('#payment-result').textContent.includes('Vamos conferir seu Pix.'));
 assert.equal(providerCreates,1);
});

test('invalid CPF is recoverable and never calls the provider',async()=>{
 await setup();validForm('11111111111');submit();
 await until(()=>!document.querySelector('#checkout-error').hidden);
 assert.match(document.querySelector('#checkout-error').textContent,/CPF ou CNPJ/);
 assert.equal(providerCreates,0);assert.equal(localStorage.getItem('tapstar_pix_attempt_v1'),null);
 assert.equal(document.querySelector('#checkout-form').hidden,false);
 await until(()=>!document.querySelector('#pay-button').disabled);
});

test('another tab updates checkout quantity, delivery, total and minimum or maximum eligibility',async()=>{
 await setup();otherTabSelection(6,'full');
 assert.match(document.querySelector('#checkout-summary').textContent,/6× Google Azul/);
 assert.match(document.querySelector('#checkout-summary').textContent,/76,84/);
 assert.equal(document.querySelector('[value="full"]').checked,true);
 otherTabSelection(120,'full');
 assert.equal(document.querySelector('#pay-button').disabled,true);
 assert.match(document.querySelector('#checkout-error').textContent,/900,00/);
 otherTabSelection(4);
 assert.equal(document.querySelector('#checkout-form').hidden,true);
 assert.match(document.querySelector('#payment-result').textContent,/precisa de 5/);
 otherTabSelection(5);
 assert.equal(document.querySelector('#checkout-form').hidden,false);
 assert.equal(document.querySelector('#payment-result').hidden,true);
 assert.equal(document.querySelector('#pay-button').disabled,false);
 assert.equal(providerCreates,0);
});

test('a storage change before its event requires review before creating the new amount',async()=>{
 await setup();validForm();
 localStorage.setItem('tapstar_cart_v3',JSON.stringify([{id:'google-azul',variant:'Azul',quantity:6}]));
 submit();
 assert.equal(providerCreates,0);assert.equal(localStorage.getItem('tapstar_pix_attempt_v1'),null);
 assert.match(document.querySelector('#checkout-error').textContent,/Confira o novo total/);
 assert.match(document.querySelector('#checkout-summary').textContent,/59,94/);
 submit();await generated();assert.equal(providerCreates,1);
 assert.equal([...payments.values()][0].payment_amount,5994);
});

test('an updated server price requires reload and does not create a charge',async()=>{
 await setup('changed-price');validForm();submit();
 await until(()=>!document.querySelector('#checkout-error').hidden);
 assert.match(document.querySelector('#checkout-error').textContent,/Os preços foram atualizados/);
 assert.equal(providerCreates,0);assert.equal(localStorage.getItem('tapstar_pix_attempt_v1'),null);
 await until(()=>!document.querySelector('#pay-button').disabled);
 assert.ok([...document.querySelectorAll('fieldset')].every(el=>!el.disabled));
});

test('authorization diagnostics survive reload without another creating request or private messages',async()=>{
 await setup('unauthorized');validForm();submit();
 await until(()=>document.querySelector('#payment-result').textContent.includes('AUTHORIZATION'));
 assert.match(document.querySelector('#payment-result').textContent,/HTTP 401/);
 assert.equal(document.querySelector('#payment-result').textContent.includes('TEST_ONLY_PRIVATE_KEY_AND_CUSTOMER'),false);
 assert.equal(providerCreates,1);
 await page('checkout.html',storageSnapshot());
 assert.match(document.querySelector('#payment-result').textContent,/AUTHORIZATION/);
 assert.equal(providerCreates,1);
});

test('a lost response is recovered by the supplied existing payment code and restores the same QR',async()=>{
 await setup('lost-response');validForm();submit();
 await until(()=>document.querySelector('#payment-result').textContent.includes('TIMEOUT'));
 const attempt=JSON.parse(localStorage.getItem('tapstar_pix_attempt_v1'));
 await page('obrigado.html',storageSnapshot(),'?pedido='+encodeURIComponent(attempt.order_id));
 await until(()=>!document.querySelector('#recover-payment').hidden);
 document.querySelector('#provider-payment-code').value=[...payments.keys()][0];
 document.querySelector('#recover-payment-form').requestSubmit();
 await until(()=>!document.querySelector('#open-pix').hidden);
 assert.equal(providerCreates,1);assert.equal(statusCalls,1);
 assert.equal(JSON.parse(localStorage.getItem('tapstar_pix_attempt_v1')).state,'complete');
 await page('checkout.html',storageSnapshot());await generated();
 assert.equal(document.querySelector('textarea').value,pixText);assert.equal(providerCreates,1);
});

test('a missing QR keeps its provider code and read-only status retrieval restores the Pix',async()=>{
 await setup('missing-pix');validForm();submit();
 await until(()=>document.querySelector('#payment-result').textContent.includes('MISSING_PIX'));
 const attempt=JSON.parse(localStorage.getItem('tapstar_pix_attempt_v1'));
 await page('obrigado.html',storageSnapshot(),'?pedido='+encodeURIComponent(attempt.order_id));
 await until(()=>!document.querySelector('#open-pix').hidden);
 assert.equal(providerCreates,1);assert.equal(statusCalls,1);
 await page('checkout.html',storageSnapshot());await generated();
 assert.equal(providerCreates,1);assert.equal(document.querySelector('textarea').value,pixText);
});
