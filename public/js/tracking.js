const KEY='tapstar_attribution_v1',TTL=30*86400000;
export const TRACKING_KEYS=['src','sck','utm_source','utm_campaign','utm_medium','utm_content','utm_term'];
export function captureTracking(){
 const params=new URLSearchParams(location.search),values=Object.fromEntries(TRACKING_KEYS.map(key=>[key,params.get(key)?.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200)||null]));
 try{
  if(Object.values(values).some(Boolean))localStorage.setItem(KEY,JSON.stringify({values,expires:Date.now()+TTL}));
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.expires>Date.now()&&saved.values)return Object.fromEntries(TRACKING_KEYS.map(key=>[key,typeof saved.values[key]==='string'?saved.values[key].slice(0,200):null]));
  localStorage.removeItem(KEY);
 }catch{}
 return values;
}
