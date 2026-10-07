import {shopConfig,saveCart} from './common.js';
import {appendPaymentDiagnostic} from './payment-diagnostics.js';
import {purchaseConfirmed} from './meta.js';
shopConfig();
const ATTEMPT_KEY='tapstar_pix_attempt_v1';
const id=new URLSearchParams(location.search).get('pedido')||localStorage.getItem('tapstar_last_order');
const title=document.querySelector('#status-title'),description=document.querySelector('#status-description'),error=document.querySelector('#status-error'),button=document.querySelector('#refresh-status');
const recovery=document.querySelector('#recover-payment'),recoveryForm=document.querySelector('#recover-payment-form'),recoverButton=document.querySelector('#recover-payment-button'),openPix=document.querySelector('#open-pix'),diagnostic=document.querySelector('#payment-diagnostic');
const labels={approved:['Pagamento confirmado!','Seu pedido foi aprovado. Seu pagamento foi confirmado. A loja poderá seguir com o envio.'],pending:['Aguardando seu pagamento.','O Pix foi gerado. A confirmação ainda não foi recebida.'],creating:['Pedido em processamento.','Aguarde a consulta do provedor antes de fazer uma nova tentativa.'],in_process:['Pagamento em análise.','A confirmação ainda está em andamento no provedor.'],in_review:['Pagamento em análise.','Aguarde a avaliação do provedor antes de fazer uma nova tentativa.'],verification_required:['Pagamento em verificação.','O atendimento precisa conferir esta referência. Não gere outra cobrança enquanto o resultado estiver em aberto.'],refused:['Pagamento não aprovado.','O provedor recusou o pagamento. Consulte o atendimento antes de tentar novamente.'],canceled:['Pagamento cancelado.','Este pagamento foi cancelado.'],expired:['Pagamento expirado.','O prazo desta cobrança terminou.'],refunded:['Pagamento estornado.','O provedor informou o estorno do pagamento.']};
let attempts=0,timer,busy=false;
async function refresh(paymentCode){
 if(busy)return;
 error.hidden=true;window.clearTimeout(timer);
 const token=id?localStorage.getItem(`tapstar-order:${id}`):null;
 if(!id||!token){title.textContent='Nenhum pedido disponível.';description.textContent='Abra esta página no mesmo navegador usado para realizar seu pedido.';button.hidden=true;return;}
 busy=true;button.disabled=true;recoverButton.disabled=true;
 document.querySelector('#order-number').textContent=`Pedido ${id}`;
 try{
  const query=paymentCode?`?payment_code=${encodeURIComponent(paymentCode)}`:'';
  const response=await fetch(`/api/status/${encodeURIComponent(id)}${query}`,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Não foi possível consultar o pagamento.');
  const [heading,text]=labels[data.status]||['Pagamento em verificação.','A loja ainda precisa confirmar o status junto ao provedor.'];
  title.textContent=heading;description.textContent=text;
  diagnostic.replaceChildren();appendPaymentDiagnostic(diagnostic,data.failure);
  recovery.hidden=data.status!=='verification_required';
  openPix.hidden=!data.pix?.text||data.status==='approved';
  const accessToken=data.access_token||token;
  if(data.access_token)localStorage.setItem(`tapstar-order:${id}`,accessToken);
  let attempt;try{attempt=JSON.parse(localStorage.getItem(ATTEMPT_KEY)||'null');}catch{}
  if(data.status==='approved'){
   purchaseConfirmed(data);
   if(attempt?.order_id===id){localStorage.removeItem(ATTEMPT_KEY);saveCart([]);}
   document.querySelector('#status-symbol').textContent='✓';button.hidden=true;
  }else if(['expired','canceled','refused','refunded'].includes(data.status)){
   if(attempt?.order_id===id)localStorage.removeItem(ATTEMPT_KEY);
   openPix.hidden=true;button.hidden=true;
  }else{
   if(attempt?.order_id===id){
    attempt.response={...data,access_token:accessToken};
    attempt.state=data.pix?.text?'complete':'unknown';
    localStorage.setItem(ATTEMPT_KEY,JSON.stringify(attempt));
   }
   if(['pending','creating','in_process','in_review'].includes(data.status)&&attempts++<40)timer=window.setTimeout(()=>refresh(),15000);
  }
 }catch(e){error.textContent=e.message;error.hidden=false;}
 finally{busy=false;button.disabled=false;recoverButton.disabled=false;}
}
button.addEventListener('click',()=>refresh());
recoveryForm.addEventListener('submit',event=>{
 event.preventDefault();
 if(recoveryForm.reportValidity())refresh(document.querySelector('#provider-payment-code').value.trim());
});
refresh();
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.clearTimeout(timer);else refresh();});
