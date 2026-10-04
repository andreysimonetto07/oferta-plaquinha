const labels={
 AUTHORIZATION:'O serviço de pagamento recusou a autorização da loja.',
 ACCESS_DENIED:'O serviço de pagamento recusou o acesso à solicitação.',
 VALIDATION:'O serviço de pagamento recusou dados enviados na solicitação.',
 RATE_LIMIT:'O serviço de pagamento limitou as solicitações temporariamente.',
 PROVIDER_UNAVAILABLE:'O serviço de pagamento retornou uma falha de serviço.',
 PROVIDER_ERROR:'O serviço de pagamento não retornou um resultado confirmado.',
 INVALID_RESPONSE:'A resposta do serviço de pagamento não pôde ser interpretada.',
 NETWORK_ERROR:'A conexão com o serviço de pagamento foi interrompida.',
 TIMEOUT:'O tempo de resposta do serviço de pagamento terminou.',
 PAYMENT_MISMATCH:'Os dados retornados pelo serviço de pagamento divergiram do pedido.',
 MISSING_PIX:'A cobrança retornou sem o código Pix.'
};
export function appendPaymentDiagnostic(container,failure){
 if(!failure||!Object.hasOwn(labels,failure.kind))return;
 const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');
 details.className='small-note';summary.textContent='Detalhes para o atendimento';
 const http=Number.isInteger(failure.http_status)?` · HTTP ${failure.http_status}`:'';
 text.textContent=`${labels[failure.kind]} Código: ${failure.kind}${http}.`;
 details.append(summary,text);container.append(details);
}
