export function readiness(){
 const required=['MANGOFY_API_KEY','MANGOFY_STORE_CODE','APP_URL','ORDER_SECRET','SELLER_DETAILS'];
 if(process.env.SHOP_READY!=='true'||!required.every(k=>!!process.env[k]?.trim())||process.env.ORDER_SECRET.length<32)return false;
 try{const app=new URL(process.env.APP_URL);if(app.protocol!=='https:'||app.username||app.password||app.search||app.hash)return false;gatewayBase();return true;}catch{return false;}
}
export function gatewayBase(){
 const url=new URL(process.env.MANGOFY_BASE_URL||'https://checkout.mangofy.com.br');
 // The .test host in the Postman collection is documentation, not an API.
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.hostname==='localhost'||url.hostname.endsWith('.test')||url.hostname.endsWith('.invalid'))throw Error('Invalid gateway base configuration');
 return url.origin;
}
