import {quote,money,PRODUCTS,SHIPPING_METHODS,MIN_QUANTITY,MAX_TOTAL_CENTS} from './catalog.js';
import {getCart,saveCart,getShipping,saveShipping,shopConfig,toast} from './common.js';
export function summary(q){return `<div class="summary-line"><span>${q.quantity} placas</span><span>${money(q.subtotal_cents)}</span></div><div class="summary-line"><span>${q.shipping_name}<br><small>${q.delivery}</small></span><span>${q.shipping_cents?money(q.shipping_cents):'Grátis'}</span></div><div class="summary-line total"><span>Total</span><span>${money(q.total_cents)}</span></div>`;}
export function shippingOptions(selected){return SHIPPING_METHODS.map(s=>`<label class="shipping-option"><input type="radio" name="shipping_method" value="${s.id}" ${selected===s.id?'checked':''}><span><b>${s.name}</b><small>${s.delivery} após a confirmação do Pix</small></span><strong>${s.cents?money(s.cents):'Grátis'}</strong></label>`).join('');}
const list=document.querySelector('#cart-items');
function totals(q){
 document.querySelector('#cart-summary').innerHTML=q?summary(q):'<p>Seu carrinho está vazio.</p>';
 document.querySelector('#checkout-link').hidden=!q||q.quantity<MIN_QUANTITY||!q.within_limit;
 document.querySelector('#minimum-message').textContent=q&&!q.within_limit?`O total supera ${money(MAX_TOTAL_CENTS)}, incluindo o frete. Ajuste seu pedido para continuar.`:q&&q.quantity<MIN_QUANTITY?`Faltam ${MIN_QUANTITY-q.quantity} placas para o mínimo de ${MIN_QUANTITY}.`:`Misture os quatro modelos. Mínimo de ${MIN_QUANTITY} placas no pedido.`;
 if(q)for(const line of q.items){const row=list.querySelector(`[data-line="${line.id}"]`);if(row){row.querySelector('[data-unit]').textContent=`${money(line.unit_cents)} por placa`;row.querySelector('[data-line-total]').textContent=money(line.total_cents);}}
}
function render(){
 const items=getCart(),q=items.length?quote(items,getShipping(),{enforceMinimum:false,enforceLimit:false}):null;
 list.innerHTML=!q?`<div class="panel empty"><h2>Monte seu lote.</h2><p>Escolha os modelos e some pelo menos ${MIN_QUANTITY} placas.</p><a href="/#modelos" class="button">Escolher placas</a></div>`:q.items.map((line,i)=>{const p=PRODUCTS.find(p=>p.id===line.id);return `<article class="cart-item" data-line="${line.id}"><img src="${p.image}" alt="${p.name}"><div><h3>${p.name}</h3><p data-unit>${money(line.unit_cents)} por placa</p><div class="cart-controls"><label for="cart-qty-${i}">Qtd.</label><input id="cart-qty-${i}" data-id="${line.id}" type="number" min="1" max="2000" step="1" value="${line.quantity}"><button type="button" data-remove="${line.id}">Remover</button><b data-line-total>${money(line.total_cents)}</b></div></div></article>`;}).join('');
 totals(q);
 list.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{saveCart(getCart().filter(i=>i.id!==el.dataset.remove));render();});
 const inputs=[...list.querySelectorAll('input')];
 function update(){
  if(!inputs.every(i=>i.validity.valid&&i.value!=='')){document.querySelector('#checkout-link').hidden=true;document.querySelector('#minimum-message').textContent='Confira as quantidades antes de continuar.';return;}
  const next=inputs.map(input=>{const p=PRODUCTS.find(p=>p.id===input.dataset.id);return {id:p.id,variant:p.variants[0],quantity:Number(input.value)};});
  try{const nextQuote=quote(next,getShipping(),{enforceMinimum:false,enforceLimit:false});saveCart(next);totals(nextQuote);}catch(e){document.querySelector('#checkout-link').hidden=true;document.querySelector('#minimum-message').textContent=e.message;}
 }
 // Updating only prices preserves focus and caret while someone types a number.
 inputs.forEach(input=>{input.addEventListener('input',update);input.addEventListener('change',update);});
}
if(list){
 const options=document.querySelector('#shipping-options');options.innerHTML=shippingOptions(getShipping());options.addEventListener('change',e=>{if(e.target.name==='shipping_method'){saveShipping(e.target.value);render();}});
 render();const zip=document.querySelector('#zip');zip.value=sessionStorage.getItem('delivery_zip')||'';
 zip.oninput=()=>{const digits=zip.value.replace(/\D/g,'').slice(0,8);zip.value=digits.slice(0,5)+(digits.length>5?'-'+digits.slice(5):'');const valid=digits.length===8&&!/^0{8}$/.test(digits);document.querySelector('#shipping-message').textContent=valid?'CEP informado. Escolha o prazo de entrega acima.':'Informe seu CEP de entrega.';if(valid)sessionStorage.setItem('delivery_zip',zip.value);};shopConfig();
}
