import {PRODUCTS,PRICE_TIERS,MIN_QUANTITY,unitPrice,tierFor,money,quote} from './catalog.js';
import {getCart,saveCart,toast,shopConfig} from './common.js';
const grid=document.querySelector('#products');
if(grid){
 grid.innerHTML=PRODUCTS.map(p=>`<article class="product"><div class="product-image"><span class="product-tag">${p.tag}</span><img src="${p.image}" alt="${p.name}${p.illustrative?' — ilustração do modelo em L':''}" width="800" height="800" loading="lazy"></div><div class="product-info"><h3>${p.name}</h3><p>${p.description}</p><span class="spec">${p.spec} · NFC + QR Code</span><div class="product-price"><strong>${money(unitPrice(p,25))}</strong><small>por placa · desconto a partir de 150</small></div><label for="qty-${p.id}">Quantidade de ${p.shortName}</label><div class="product-buy"><input id="qty-${p.id}" type="number" min="1" max="2000" step="1" value="5"><button class="button secondary" data-add="${p.id}" type="button">Adicionar</button></div>${p.illustrative?'<small class="image-note">Imagem ilustrativa do formato em L.</small>':''}</div></article>`).join('');
 grid.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>{
  const p=PRODUCTS.find(p=>p.id===button.dataset.add),input=document.querySelector(`#qty-${p.id}`);if(!input.reportValidity())return;
  const items=getCart(),old=items.find(i=>i.id===p.id);if(old)old.quantity+=Number(input.value);else items.push({id:p.id,variant:p.variants[0],quantity:Number(input.value)});
  try{saveCart(items);const qty=items.reduce((s,i)=>s+i.quantity,0);toast(`${p.shortName} adicionada.${qty<MIN_QUANTITY?` Faltam ${MIN_QUANTITY-qty} para o mínimo de 25.`:''}`);}catch(e){toast(e.message);}
 }));
}
const simulator=document.querySelector('#sim-models');
if(simulator){
 const cart=getCart(),initial=Object.fromEntries(cart.map(i=>[i.id,i.quantity]));
 simulator.innerHTML=PRODUCTS.map(p=>`<div class="sim-model"><div class="sim-name"><span class="sim-thumb"><img src="${p.image}" alt="" width="52" height="52"></span><label for="sim-${p.id}">${p.shortName}</label></div><div class="stepper"><button type="button" data-step="-1" data-for="${p.id}" aria-label="Diminuir quantidade de ${p.shortName}">−</button><input id="sim-${p.id}" data-model="${p.id}" type="number" min="0" max="2000" step="1" value="${cart.length?(initial[p.id]||0):5}" aria-label="Quantidade de ${p.shortName}"><button type="button" data-step="1" data-for="${p.id}" aria-label="Aumentar quantidade de ${p.shortName}">+</button></div></div>`).join('');
 const inputs=[...simulator.querySelectorAll('input')];
 const selected=()=>inputs.map(input=>({id:input.dataset.model,variant:PRODUCTS.find(p=>p.id===input.dataset.model).variants[0],quantity:Number(input.value)})).filter(i=>i.quantity>0);
 function update(){
  const valid=inputs.every(i=>i.validity.valid),items=selected(),n=items.reduce((s,i)=>s+i.quantity,0),tier=tierFor(n),within=valid&&n<=2000;
  document.querySelector('#sim-quantity').textContent=within?n:'—';
  document.querySelector('#sim-unit').textContent=within&&n?money(tier.cents):'—';
  document.querySelector('#sim-l-unit').textContent=within&&n?money(tier.l_cents):'—';
  document.querySelector('#sim-total').textContent=within?money(n?quote(items,'standard',{enforceMinimum:false}).subtotal_cents:0):'—';
  const next=PRICE_TIERS.find(t=>t.min>n&&t.min>MIN_QUANTITY);
  document.querySelector('#sim-next').textContent=!within?'Limite online: 2.000 placas, com quantidades inteiras.':n<MIN_QUANTITY?`Faltam ${MIN_QUANTITY-n} placas para o pedido mínimo de 25.`:next?`Com mais ${next.min-n}: comuns ${money(next.cents)} · em L ${money(next.l_cents)}.`:'Você chegou à melhor faixa de preço.';
  document.querySelectorAll('[data-price-tier]').forEach(el=>el.classList.toggle('active',within&&Number(el.dataset.priceTier)===tier.min));
  const button=document.querySelector('#buy-order');button.disabled=!within||n<MIN_QUANTITY;button.textContent=n<MIN_QUANTITY?`Mínimo de ${MIN_QUANTITY} placas`:'Comprar meu lote →';
 }
 inputs.forEach(input=>input.addEventListener('input',update));
 simulator.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{const input=document.querySelector(`#sim-${button.dataset.for}`);input.value=Math.max(0,Math.min(2000,(Number(input.value)||0)+Number(button.dataset.step)));update();}));
 document.querySelector('#buy-order').addEventListener('click',()=>{try{const items=selected();quote(items);saveCart(items);location.href='/carrinho.html';}catch(e){toast(e.message);}});update();
}
shopConfig();
