// Shared with the server: all monetary values are integer centavos.
export const MIN_QUANTITY = 5;
export const SHIPPING_CENTS = 1990;
export const PRODUCTS = [
 {id:'acrilico',name:'Acrílico Premium',description:'Acabamento elegante para dar personalidade a qualquer espaço.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Azul','Preto','Branco'],image:'/assets/acrilico.svg',prices:[2500,2200,1900],tag:'MAIS VERSÁTIL'},
 {id:'mdf',name:'MDF Natural',description:'Textura natural e um toque acolhedor para a decoração.',spec:'12 × 12 cm · MDF 3 mm',variants:['Natural'],image:'/assets/mdf.svg',prices:[1900,1600,1300],tag:'TOQUE RÚSTICO'},
 {id:'espelhada',name:'Acrílico Espelhado',description:'Brilho e sofisticação em três acabamentos especiais.',spec:'8 × 8 cm · Acrílico espelhado',variants:['Dourado','Rosê','Prata'],image:'/assets/espelhada.svg',prices:[2900,2600,2300],tag:'ACABAMENTO ESPECIAL'},
 {id:'personalizada',name:'Sua Plaquinha',description:'Seu nome ou sua frase. Uma peça feita para ser única.',spec:'10 × 10 cm · Sob encomenda',variants:['Branco','Preto'],image:'/assets/personalizada.svg',prices:[3500,3200,2900],tag:'DO SEU JEITO'}
];
export const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export const unitPrice = (product, quantity) => product.prices[quantity>=50?2:quantity>=10?1:0];
export function quote(items) {
 if(!Array.isArray(items)||!items.length||items.length>40) throw new Error('Selecione suas plaquinhas.');
 const merged=new Map();
 for(const item of items){
  const p=PRODUCTS.find(p=>p.id===item.id);
  if(!p||!p.variants.includes(item.variant)||!Number.isSafeInteger(item.quantity)||item.quantity<5||item.quantity>1000) throw new Error('Cada modelo deve ter de 5 a 1.000 unidades e uma variante válida.');
  const text=p.id==='personalizada'?String(item.text||'').trim():'';
  if(p.id==='personalizada'&&(!text||text.length>60)) throw new Error('Informe uma frase de até 60 caracteres.');
  const key=JSON.stringify([p.id,item.variant,text]);const old=merged.get(key);
  merged.set(key,{id:p.id,name:p.name,variant:item.variant,text,quantity:item.quantity+(old?.quantity||0)});
 }
 const lines=[...merged.values()];if(lines.some(l=>l.quantity>1000))throw new Error('Limite de 1.000 unidades por variante.');
 const quantities={};for(const l of lines) quantities[l.id]=(quantities[l.id]||0)+l.quantity;
 if(lines.reduce((s,l)=>s+l.quantity,0)>2000) throw new Error('Para pedidos acima de 2.000 unidades, consulte atendimento.');
 for(const l of lines){const p=PRODUCTS.find(p=>p.id===l.id);l.unit_cents=unitPrice(p,quantities[l.id]);l.total_cents=l.unit_cents*l.quantity;}
 const subtotal_cents=lines.reduce((s,l)=>s+l.total_cents,0);
 return {items:lines,quantity:lines.reduce((s,l)=>s+l.quantity,0),subtotal_cents,shipping_cents:SHIPPING_CENTS,total_cents:subtotal_cents+SHIPPING_CENTS};
}
