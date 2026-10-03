// Shared by browser and server. BRL amounts are integer centavos.
export const MIN_QUANTITY = 1;
export const SHIPPING_CENTS = 1990;
export const PRICE_TIERS = [
 {min:1,max:1,cents:2500,label:'1 placa'},
 {min:2,max:49,cents:2000,label:'2 a 49 placas'},
 {min:50,max:299,cents:1700,label:'50 a 299 placas'},
 {min:300,max:2000,cents:1500,label:'300 placas ou mais'}
];
export const PRODUCTS = [
 {id:'google-azul',name:'Placa Google Azul',shortName:'Placa Azul',description:'Uma forma simples de convidar seus clientes a avaliar seu negócio no Google.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Azul'],image:'/assets/google-azul.webp',tag:'AVALIAÇÕES NO GOOGLE'},
 {id:'google-preta',name:'Placa Google Preta',shortName:'Placa Preta',description:'Avaliações no Google com um acabamento versátil para qualquer balcão.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Preta'],image:'/assets/google-preta.webp',tag:'AVALIAÇÕES NO GOOGLE'},
 {id:'instagram',name:'Placa Instagram',shortName:'Placa Instagram',description:'Aproxime o celular ou escaneie o QR Code para conhecer o perfil do negócio.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Instagram'],image:'/assets/instagram.webp',tag:'CONECTE SEU INSTAGRAM'}
];
export const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export const tierFor = quantity => PRICE_TIERS.find(t=>quantity>=t.min&&quantity<=t.max)||PRICE_TIERS[0];
export const unitPrice = (_product,quantity) => tierFor(quantity).cents;
export function quote(items) {
 if(!Array.isArray(items)||!items.length||items.length>20)throw new Error('Escolha pelo menos uma placa.');
 const merged=new Map();
 for(const item of items){
  const p=PRODUCTS.find(p=>p.id===item.id);
  if(!p||!p.variants.includes(item.variant)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>2000)throw new Error('Escolha um modelo válido e uma quantidade de 1 a 2.000 placas.');
  const existing=merged.get(p.id);merged.set(p.id,{id:p.id,name:p.name,variant:p.variants[0],text:'',quantity:item.quantity+(existing?.quantity||0)});
 }
 const lines=[...merged.values()],quantity=lines.reduce((s,l)=>s+l.quantity,0);
 if(quantity>2000)throw new Error('Para pedidos acima de 2.000 placas, consulte atendimento.');
 const unit_cents=tierFor(quantity).cents;
 for(const l of lines){l.unit_cents=unit_cents;l.total_cents=unit_cents*l.quantity;}
 const subtotal_cents=unit_cents*quantity;
 return {items:lines,quantity,unit_cents,subtotal_cents,shipping_cents:SHIPPING_CENTS,total_cents:subtotal_cents+SHIPPING_CENTS};
}
