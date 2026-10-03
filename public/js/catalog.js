// Shared price source. All monetary values are integer centavos.
export const MIN_QUANTITY=5;
export const MAX_QUANTITY=2000;
export const MAX_TOTAL_CENTS=90000;
export const PRICE_TIERS=[
 {min:1,max:99,cents:999,l_cents:1299,label:'5 a 99 placas'},
 {min:100,max:2000,cents:749,l_cents:1299,label:'100 placas ou mais'}
];
export const SHIPPING_METHODS=[
 {id:'standard',name:'Frete grátis',cents:0,delivery:'6 dias'},
 {id:'full',name:'Frete Full',cents:1690,delivery:'2 dias úteis'}
];
export const PRODUCTS=[
 {id:'google-azul',name:'Google Azul',shortName:'Google Azul',description:'Convide seus clientes a avaliar no Google.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Azul'],image:'/assets/google-azul.webp',tag:'GOOGLE'},
 {id:'google-preta',name:'Google Preta',shortName:'Google Preta',description:'A mesma conexão, com acabamento preto.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Preta'],image:'/assets/google-preta.webp',tag:'GOOGLE'},
 {id:'instagram',name:'Instagram',shortName:'Instagram',description:'Leve seus clientes direto para o seu perfil.',spec:'10 × 10 cm · Acrílico 2 mm',variants:['Instagram'],image:'/assets/instagram.webp',tag:'INSTAGRAM'},
 {id:'google-l',name:'Google em L',shortName:'Google em L',description:'Com base de mesa para ficar em pé no balcão.',spec:'Acrílico · Base em L',variants:['Azul em L'],image:'/assets/google-l.png',tag:'MODELO DE MESA',premium:true,illustrative:true}
];
export const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export const tierFor=quantity=>PRICE_TIERS.find(t=>quantity>=t.min&&quantity<=t.max)||PRICE_TIERS[0];
export const unitPrice=(product,quantity)=>product?.premium?tierFor(quantity).l_cents:tierFor(quantity).cents;
export function quote(items,shippingMethod='standard',{enforceMinimum=true,enforceLimit=true}={}){
 if(!Array.isArray(items)||!items.length||items.length>20)throw Error('Escolha os modelos do seu pedido.');
 const shipping=SHIPPING_METHODS.find(s=>s.id===shippingMethod);
 if(!shipping)throw Error('Selecione uma opção de entrega válida.');
 const merged=new Map();
 for(const item of items){
  const p=PRODUCTS.find(p=>p.id===item?.id);
  if(!p||!p.variants.includes(item.variant)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>MAX_QUANTITY)throw Error('Confira o modelo e a quantidade de placas.');
  const previous=merged.get(p.id);merged.set(p.id,{id:p.id,name:p.name,variant:p.variants[0],quantity:item.quantity+(previous?.quantity||0)});
 }
 const lines=[...merged.values()],quantity=lines.reduce((sum,l)=>sum+l.quantity,0);
 if(quantity>MAX_QUANTITY)throw Error('Para mais de 2.000 placas, consulte o atendimento.');
 if(enforceMinimum&&quantity<MIN_QUANTITY)throw Error(`O pedido mínimo é de ${MIN_QUANTITY} placas. Faltam ${MIN_QUANTITY-quantity}.`);
 for(const line of lines){line.unit_cents=unitPrice(PRODUCTS.find(p=>p.id===line.id),quantity);line.total_cents=line.quantity*line.unit_cents;}
 const subtotal_cents=lines.reduce((sum,l)=>sum+l.total_cents,0);
 const total_cents=subtotal_cents+shipping.cents,within_limit=total_cents<=MAX_TOTAL_CENTS;
 // Drafts may display an over-limit total. Payment creation always uses this
 // strict default, including freight, before contacting the gateway.
 if(enforceLimit&&!within_limit)throw Error(`O limite por pagamento é ${money(MAX_TOTAL_CENTS)}, incluindo o frete. Ajuste seu pedido.`);
 return {items:lines,quantity,unit_cents:tierFor(quantity).cents,l_unit_cents:tierFor(quantity).l_cents,subtotal_cents,shipping_method:shipping.id,shipping_name:shipping.name,delivery:shipping.delivery,shipping_cents:shipping.cents,total_cents,within_limit};
}
