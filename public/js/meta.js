import {META_PIXEL_ID,purchaseEventId} from './marketing-data.js';
export function initMeta(){
 if(window.__tapstarMetaReady)return;
 window.__tapstarMetaReady=true;
 if(!window.fbq){
  let initialized=false,pageView=false;
  const n=window.fbq=function(...args){
   // The UTMify pixel may also initialize this same Meta pixel. Keep one init
   // and one PageView per page, while retaining the official fbq queue API.
   if(args[0]==='init'&&String(args[1])===META_PIXEL_ID){if(initialized)return;initialized=true;}
   if((args[0]==='track'&&args[1]==='PageView')||(args[0]==='trackSingle'&&String(args[1])===META_PIXEL_ID&&args[2]==='PageView')){if(pageView)return;pageView=true;}
   n.callMethod?n.callMethod.apply(n,args):n.queue.push(args);
  };
  window._fbq=n;n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
 }
 if(!document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]')){
  const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';document.head.append(script);
 }
 window.fbq('init',META_PIXEL_ID);
 window.fbq('trackSingle',META_PIXEL_ID,'PageView');
}
export function metaEvent(name,data={},eventId){
 try{initMeta();window.fbq('trackSingle',META_PIXEL_ID,name,data,...(eventId?[{eventID:eventId}]:[]));return true;}catch{return false;}
}
export function purchaseConfirmed(data){
 if(data?.status!=='approved'||!data.order_id||!Number.isSafeInteger(data.total_cents))return;
 const key=`tapstar-meta-purchase:${data.order_id}`;
 try{if(localStorage.getItem(key))return;}catch{}
 if(metaEvent('Purchase',{currency:'BRL',value:data.total_cents/100},purchaseEventId(data.order_id)))try{localStorage.setItem(key,'1');}catch{}
}
export function metaContext(){
 const cookie=name=>document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||null;
 let fbc=cookie('_fbc');const click=new URLSearchParams(location.search).get('fbclid');
 if(click&&/^[A-Za-z0-9_-]{1,300}$/.test(click)){
  fbc=`fb.1.${Date.now()}.${click}`;
  document.cookie=`_fbc=${fbc}; Max-Age=7776000; Path=/; Secure; SameSite=Lax`;
 }
 return {fbp:cookie('_fbp'),fbc};
}
if(typeof window!=='undefined'){initMeta();metaContext();}
