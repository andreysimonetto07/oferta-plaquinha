import {quote} from './catalog.js';
export const CART_KEY='oferta_plaquinha_cart_v1';
export function getCart(){try{const value=JSON.parse(localStorage.getItem(CART_KEY)||'[]');if(value.length)quote(value);return Array.isArray(value)?value:[];}catch{return [];}}
export function saveCart(items){if(items.length)quote(items);localStorage.setItem(CART_KEY,JSON.stringify(items));updateCount();}
export function updateCount(){document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=getCart().reduce((s,i)=>s+i.quantity,0));}
export function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,3500);}
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function shopConfig(){try{const r=await fetch('/api/config');if(!r.ok)throw Error();const config=await r.json();document.querySelectorAll('[data-demo]').forEach(e=>e.hidden=config.ready);document.querySelectorAll('[data-seller]').forEach(e=>e.textContent=config.seller||'Loja em configuração.');return config;}catch{return {ready:false,card:false};}}
updateCount();window.addEventListener('storage',updateCount);
