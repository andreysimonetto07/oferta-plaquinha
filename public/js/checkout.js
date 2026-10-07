import {quote,money,MIN_QUANTITY,MAX_TOTAL_CENTS} from './catalog.js';
import {getCart,saveCart,getShipping,saveShipping,escapeHTML,shopConfig,toast,CART_KEY,SHIPPING_KEY} from './common.js';
import {summary,shippingOptions} from './cart.js';
import {appendPaymentDiagnostic} from './payment-diagnostics.js';
import {pixImageSource,pixExpiryText} from './pix-display.js';
import {captureTracking} from './tracking.js';
import {metaContext,metaEvent,purchaseConfirmed} from './meta.js';
const form=document.querySelector('#checkout-form'),error=document.querySelector('#checkout-error'),button=document.querySelector('#pay-button'),result=document.querySelector('#payment-result');
const ATTEMPT_KEY='tapstar_pix_attempt_v1';
let attempt;try{attempt=JSON.parse(localStorage.getItem(ATTEMPT_KEY)||'null');}catch{}
let cart=getCart();
let config={ready:false},busy=false,currentQuote;
function updatePayButton(){
 const eligible=currentQuote&&currentQuote.quantity>=MIN_QUANTITY&&currentQuote.within_limit;
 button.disabled=!config.ready||!eligible||busy||['sent','unknown','complete'].includes(attempt?.state);
 button.textContent=busy?'Preparando seu Pix…':currentQuote&&!currentQuote.within_limit?'Ajuste o total do pedido':!eligible?`Mínimo de ${MIN_QUANTITY} placas`:config.ready?'Gerar meu Pix →':'Pagamento em configuração';
}
function renderSummary(){
 cart=getCart();
 currentQuote=cart.length?quote(cart,getShipping(),{enforceMinimum:false,enforceLimit:false}):null;
 document.querySelector('#checkout-summary').innerHTML=currentQuote?currentQuote.items.map(l=>`<div class="summary-line"><span>${l.quantity}× ${escapeHTML(l.name)}<br><small>${money(l.unit_cents)} por placa</small></span><b>${money(l.total_cents)}</b></div>`).join('')+summary(currentQuote):'<p>Seu carrinho está vazio.</p>';
 const limitExceeded=currentQuote&&!currentQuote.within_limit;
 error.textContent=limitExceeded?`O limite por pagamento é ${money(MAX_TOTAL_CENTS)}, incluindo o frete. Altere a entrega ou ajuste seu carrinho.`:'';error.hidden=!limitExceeded;
 updatePayButton();
}
renderSummary();
const options=document.querySelector('#shipping-options');options.innerHTML=shippingOptions(getShipping());options.addEventListener('change',e=>{if(e.target.name==='shipping_method'){saveShipping(e.target.value);renderSummary();}});
function syncSelection(){
 if(busy||['sent','unknown','complete'].includes(attempt?.state))return;
 options.innerHTML=shippingOptions(getShipping());renderSummary();
 const tooSmall=!currentQuote||currentQuote.quantity<MIN_QUANTITY;
 form.hidden=tooSmall;result.hidden=!tooSmall;
 if(tooSmall)result.innerHTML=`<h2>Seu lote precisa de ${MIN_QUANTITY} placas.</h2><p>Adicione mais modelos antes de finalizar.</p><a class="button" href="/carrinho.html">Ajustar meu carrinho</a>`;
}
window.addEventListener('storage',event=>{if(event.key===CART_KEY||event.key===SHIPPING_KEY||event.key===null)syncSelection();});
document.querySelector('#zipcode').value=sessionStorage.getItem('delivery_zip')||'';
shopConfig().then(value=>{config=value;updatePayButton();});
export async function criarPagamentoPix(data,key){const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(data)});const response=await r.json();if(!r.ok)throw Error(response.error||'Não foi possível iniciar o pagamento.');return response;}
function keepAttempt(){localStorage.setItem(ATTEMPT_KEY,JSON.stringify(attempt));}
function showUnknown(){form.hidden=true;result.hidden=false;result.innerHTML='<h2>Vamos conferir seu Pix.</h2><p>O resultado desta tentativa ainda não foi confirmado. Consulte o atendimento antes de gerar outra cobrança.</p>';const p=document.createElement('p');p.className='small-note';p.textContent=`Referência: ${attempt?.order_id||'consulte o atendimento'}`;result.append(p);appendPaymentDiagnostic(result,attempt?.response?.failure);if(attempt?.response?.access_token){const a=document.createElement('a');a.className='button secondary';a.href=`/obrigado.html?pedido=${encodeURIComponent(attempt.order_id)}`;a.textContent='Consultar ou recuperar este Pix';result.append(a);}}
function showPayment(data){
 form.hidden=true;result.hidden=false;
 if(data.status==='approved'){purchaseConfirmed(data);saveCart([]);localStorage.removeItem(ATTEMPT_KEY);location.href=`/obrigado.html?pedido=${encodeURIComponent(data.order_id)}`;return;}
 if(!data.pix?.text){showUnknown();return;}
 result.innerHTML='<span class="eyebrow">PIX GERADO</span><h2>Pronto para pagar.</h2><p>Escaneie no aplicativo do banco ou copie o código Pix.</p>';
 const image=pixImageSource(data.pix);
 if(image){const img=document.createElement('img');img.src=image;img.alt='QR Code Pix';img.width=280;img.height=280;result.append(img);}
 const area=document.createElement('textarea');area.readOnly=true;area.value=data.pix.text;area.setAttribute('aria-label','Código Pix copia e cola');result.append(area);
 const copy=document.createElement('button');copy.className='button wide';copy.type='button';copy.textContent='Copiar código Pix';copy.onclick=async()=>{try{await navigator.clipboard.writeText(data.pix.text);toast('Pix copiado.');}catch{area.select();toast('Selecione e copie o código.');}};result.append(copy);
 const message=document.createElement('p');message.className='small-note';message.textContent=pixExpiryText(data.pix.expires_at);result.append(message);
 const link=document.createElement('a');link.href=`/obrigado.html?pedido=${encodeURIComponent(data.order_id)}`;link.className='button secondary wide';link.textContent='Já paguei · verificar confirmação';result.append(link);
}
if(attempt?.state==='complete'&&attempt.response)showPayment(attempt.response);
else if(['sent','unknown'].includes(attempt?.state))showUnknown();
else if(!currentQuote||currentQuote.quantity<MIN_QUANTITY){form.hidden=true;result.hidden=false;result.innerHTML=`<h2>Seu lote precisa de ${MIN_QUANTITY} placas.</h2><p>Adicione mais modelos antes de finalizar.</p><a class="button" href="/carrinho.html">Ajustar meu carrinho</a>`;}
async function submitPix(){
 if(busy||!form.reportValidity())return;error.hidden=true;
 if(!config.ready){error.textContent='O Pix ainda está em configuração.';error.hidden=false;return;}
 // A persistent browser marker survives refreshes. No automatic retry of the
 // creating POST, even if the connection drops before its response arrives.
 let latest;try{latest=JSON.parse(localStorage.getItem(ATTEMPT_KEY)||'null');}catch{}
 if(['sent','unknown','complete'].includes(latest?.state)){attempt=latest;latest.response?showPayment(latest.response):showUnknown();return;}
 if(JSON.stringify(getCart())!==JSON.stringify(cart)||getShipping()!==currentQuote?.shipping_method){
  syncSelection();error.textContent='Seu pedido foi atualizado. Confira o novo total antes de gerar o Pix.';error.hidden=false;return;
 }
 const fields=new FormData(form),address={};for(const k of ['zipcode','state','street','number','complement','neighborhood','city'])address[k]=fields.get(k);
 const data={items:getCart(),shipping_method:getShipping(),customer:{name:fields.get('name'),email:fields.get('email'),phone:fields.get('phone'),document:fields.get('document'),address},payment_method:'pix',tracking:captureTracking(),meta:metaContext()};
 busy=true;button.disabled=true;button.textContent='Preparando seu Pix…';form.querySelectorAll('fieldset').forEach(el=>el.disabled=true);let sent=false;
 try{
  const reviewed=quote(data.items,data.shipping_method);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))),fingerprint=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  const key=latest?.fingerprint===fingerprint?latest.key:crypto.randomUUID();
  metaEvent('InitiateCheckout',{currency:'BRL',value:reviewed.total_cents/100,num_items:reviewed.quantity},`tapstar:TS-${key}:checkout`);
  const prepared=await criarPagamentoPix({...data,action:'prepare'},key);
  if(prepared.total_cents!==reviewed.total_cents||prepared.shipping_cents!==reviewed.shipping_cents)throw Error('Os preços foram atualizados. Recarregue a página e confira o pedido antes de gerar o Pix.');
  attempt={key,fingerprint,order_id:prepared.order_id,state:'sent'};keepAttempt();sent=true;button.textContent='Gerando seu Pix…';
  const response=await criarPagamentoPix({...data,action:'create',checkout_token:prepared.checkout_token},key);
  if(response.pix?.text)metaEvent('AddPaymentInfo',{currency:'BRL',value:response.total_cents/100},`tapstar:${response.order_id}:pix`);
  attempt.state=response.status==='verification_required'?'unknown':'complete';attempt.response=response;keepAttempt();
  localStorage.setItem(`tapstar-order:${response.order_id}`,response.access_token);localStorage.setItem('tapstar_last_order',response.order_id);showPayment(response);
 }catch(e){
  if(sent){attempt.state='unknown';keepAttempt();showUnknown();}
  else{error.textContent=e.message;error.hidden=false;}
 }finally{busy=false;form.querySelectorAll('fieldset').forEach(el=>el.disabled=false);updatePayButton();}
 }
form.addEventListener('submit',event=>{
 event.preventDefault();
 if(busy||!form.reportValidity())return;
 if(navigator.locks)navigator.locks.request('tapstar-create-pix',{ifAvailable:true},async lock=>{
  if(!lock){toast('Há uma geração de Pix aberta neste navegador. Confira a outra aba.');return;}
  await submitPix();
 });else submitPix();
});
