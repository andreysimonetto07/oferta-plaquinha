import {PRODUCTS,PRICE_TIERS,MIN_QUANTITY,MAX_QUANTITY,MAX_TOTAL_CENTS,unitPrice,tierFor,money,quote} from './catalog.js';
import {getCart,saveCart,toast,shopConfig} from './common.js';
import {metaEvent} from './meta.js';
const draftOptions={enforceMinimum:false,enforceLimit:false};
const grid=document.querySelector('#products');
if(grid){
 grid.innerHTML=PRODUCTS.map(p=>`<article class="product"><div class="product-image"><span class="product-tag">${p.tag}</span><img src="${p.image}" alt="${p.name}${p.illustrative?' — ilustração do modelo em L':''}" width="800" height="800" loading="lazy"></div><div class="product-info"><h3>${p.name}</h3><p>${p.description}</p><span class="spec">${p.spec} · NFC + QR Code</span><div class="product-price"><strong>${money(unitPrice(p,MIN_QUANTITY))}</strong><small>${p.premium?'por placa · modelo de mesa':'por placa · '+money(PRICE_TIERS[1].cents)+' a partir de 100'}</small></div><label for="qty-${p.id}">Quantidade de ${p.shortName}</label><div class="product-buy"><input id="qty-${p.id}" type="number" min="0" max="${MAX_QUANTITY}" step="1" value="0"><button class="button secondary" data-add="${p.id}" type="button" disabled>Adicionar</button></div>${p.illustrative?'<small class="image-note">Imagem ilustrativa do formato em L.</small>':''}</div></article>`).join('');
 grid.querySelectorAll('[data-add]').forEach(button=>{
  const p=PRODUCTS.find(p=>p.id===button.dataset.add),input=document.querySelector(`#qty-${p.id}`);
  input.addEventListener('input',()=>{button.disabled=!input.validity.valid||Number(input.value)<=0;});
  button.addEventListener('click',()=>{
   if(!input.reportValidity()||Number(input.value)<=0)return;
   const items=getCart(),old=items.find(i=>i.id===p.id);if(old)old.quantity+=Number(input.value);else items.push({id:p.id,variant:p.variants[0],quantity:Number(input.value)});
   try{saveCart(items);const q=quote(items,'standard',draftOptions);toast(!q.within_limit?`Adicionado. O total ultrapassa ${money(MAX_TOTAL_CENTS)}; ajuste no carrinho.`:`${p.shortName} adicionada.${q.quantity<MIN_QUANTITY?` Adicione mais ${MIN_QUANTITY-q.quantity} ${MIN_QUANTITY-q.quantity===1?'placa':'placas'} para o mínimo de ${MIN_QUANTITY}.`:''}`);
    metaEvent('AddToCart',{currency:'BRL',value:unitPrice(p,q.quantity)*Number(input.value)/100,content_ids:[p.id],content_type:'product',contents:[{id:p.id,quantity:Number(input.value)}]});
   }catch(e){toast(e.message);}
  });
 });
}
const simulator=document.querySelector('#sim-models');
if(simulator){
 // Every visit starts with no preselected plaques; the cart remains separate.
 simulator.innerHTML=PRODUCTS.map(p=>`<div class="sim-model"><div class="sim-name"><span class="sim-thumb"><img src="${p.image}" alt="" width="52" height="52"></span><label for="sim-${p.id}">${p.shortName}</label></div><div class="stepper"><button type="button" data-step="-1" data-for="${p.id}" aria-label="Diminuir quantidade de ${p.shortName}">−</button><input id="sim-${p.id}" data-model="${p.id}" type="number" min="0" max="${MAX_QUANTITY}" step="1" value="0" aria-label="Quantidade de ${p.shortName}"><button type="button" data-step="1" data-for="${p.id}" aria-label="Aumentar quantidade de ${p.shortName}">+</button></div></div>`).join('');
 const inputs=[...simulator.querySelectorAll('input')];
 const selected=()=>inputs.map(input=>({id:input.dataset.model,variant:PRODUCTS.find(p=>p.id===input.dataset.model).variants[0],quantity:Number(input.value)})).filter(i=>i.quantity>0);
 function update(){
  const valid=inputs.every(i=>i.validity.valid&&i.value!==''),items=selected(),n=items.reduce((s,i)=>s+i.quantity,0),tier=tierFor(n),within=valid&&n<=MAX_QUANTITY;
  const q=within&&n?quote(items,'standard',draftOptions):null,overLimit=q&&!q.within_limit;
  document.querySelector('#sim-quantity').textContent=within?n:'—';
  document.querySelector('#sim-unit').textContent=within?money(tier.cents):'—';
  document.querySelector('#sim-l-unit').textContent=within?money(tier.l_cents):'—';
  document.querySelector('#sim-total').textContent=within?money(q?.subtotal_cents||0):'—';
  const next=PRICE_TIERS.find(t=>t.min>n&&t.min>MIN_QUANTITY);
  document.querySelector('#sim-next').textContent=!within?'Confira as quantidades: use números inteiros.':overLimit?`Total acima de ${money(MAX_TOTAL_CENTS)}. Ajuste as quantidades para continuar.`:n===0?`Escolha seus modelos. Mínimo de ${MIN_QUANTITY} placas no pedido.`:n<MIN_QUANTITY?`Adicione mais ${MIN_QUANTITY-n} ${MIN_QUANTITY-n===1?'placa':'placas'} para o pedido mínimo de ${MIN_QUANTITY}.`:next?`A partir de ${next.min} placas, as comuns saem por ${money(next.cents)} cada.`:'Preço de atacado aplicado às placas comuns.';
  document.querySelectorAll('[data-price-tier]').forEach(el=>el.classList.toggle('active',within&&n>0&&Number(el.dataset.priceTier)===tier.min));
  const button=document.querySelector('#buy-order');button.disabled=!within||n<MIN_QUANTITY||overLimit;button.textContent=overLimit?'Ajustar quantidades':n===0?'Selecione suas placas':n<MIN_QUANTITY?`Mínimo de ${MIN_QUANTITY} placas`:'Comprar meu lote →';
 }
 inputs.forEach(input=>input.addEventListener('input',update));
 simulator.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{const input=document.querySelector(`#sim-${button.dataset.for}`);input.value=Math.max(0,Math.min(MAX_QUANTITY,(Number(input.value)||0)+Number(button.dataset.step)));update();}));
 document.querySelector('#buy-order').addEventListener('click',()=>{try{const items=selected(),q=quote(items);saveCart(items);metaEvent('AddToCart',{currency:'BRL',value:q.total_cents/100,content_type:'product',content_ids:items.map(i=>i.id),contents:items.map(i=>({id:i.id,quantity:i.quantity}))});location.href='/carrinho.html';}catch(e){toast(e.message);}});update();
}
shopConfig();
