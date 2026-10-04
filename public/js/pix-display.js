import {createPixQrDataUrl} from './vendor/pix-qr.js';

export function pixImageSource(pix){
 try{return createPixQrDataUrl(pix.text);}catch{return pix.image||null;}
}

export function pixExpiryText(value){
 if(!value)return 'Confira a validade no aplicativo do banco.';
 // ISO dates with an explicit timezone can be safely shown in Brasília time.
 if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)){
  const date=new Date(value);
  if(!Number.isNaN(date.getTime())){
   const text=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(date);
   return 'Validade: '+text.replace(', ',' às ');
  }
 }
 return 'Validade: '+value;
}
