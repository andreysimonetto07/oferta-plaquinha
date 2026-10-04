const labels={
 AUTHORIZATION:'A Mangofy recusou a autorização da loja.',
 ACCESS_DENIED:'A Mangofy recusou o acesso à solicitação.',
 VALIDATION:'A Mangofy recusou dados enviados na solicitação.',
 RATE_LIMIT:'A Mangofy limitou as solicitações temporariamente.',
 PROVIDER_UNAVAILABLE:'A Mangofy retornou uma falha de serviço.',
 PROVIDER_ERROR:'A Mangofy não retornou um resultado confirmado.',
 INVALID_RESPONSE:'A resposta da Mangofy não pôde ser interpretada.',
 NETWORK_ERROR:'A conexão com a Mangofy foi interrompida.',
 TIMEOUT:'O tempo de resposta da Mangofy terminou.',
 PAYMENT_MISMATCH:'Os dados retornados pela Mangofy divergiram do pedido.',
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
