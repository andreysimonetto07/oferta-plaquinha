import {quote,SHIPPING_METHODS} from './catalog.js';
export const CART_KEY='tapstar_cart_v3';
export const SHIPPING_KEY='tapstar_shipping_v1';
export function getShipping(){return SHIPPING_METHODS.some(s=>s.id===localStorage.getItem(SHIPPING_KEY))?localStorage.getItem(SHIPPING_KEY):'standard';}
export function saveShipping(value){if(!SHIPPING_METHODS.some(s=>s.id===value))return;localStorage.setItem(SHIPPING_KEY,value);}
export function getCart(){try{const value=JSON.parse(localStorage.getItem(CART_KEY)||'[]');if(!Array.isArray(value))return [];if(value.length)quote(value,getShipping(),{enforceMinimum:false});return value;}catch{return [];}}
export function saveCart(items){if(items.length)quote(items,getShipping(),{enforceMinimum:false});localStorage.setItem(CART_KEY,JSON.stringify(items));updateCount();}
export function updateCount(){document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=getCart().reduce((s,i)=>s+i.quantity,0));}
export function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,3500);}
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function shopConfig(){try{const r=await fetch('/api/config');if(!r.ok)throw Error();const config=await r.json();document.querySelectorAll('[data-demo]').forEach(e=>e.hidden=config.ready);document.querySelectorAll('[data-seller]').forEach(e=>e.textContent=config.seller||'Loja em configuração.');return config;}catch{return {ready:false,payment_method:'pix'};}}
updateCount();window.addEventListener('storage',updateCount);
