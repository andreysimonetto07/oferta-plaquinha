# Oferta Plaquinha

Loja pt-BR de quatro modelos decorativos. Estrutura visual inspirada no TapSmart: destaque verde, fundo claro, hero de produtos, catálogo, etapas, atacado, simulador de revenda e FAQ. Identidade própria. Não utiliza marca, código, métricas, depoimentos ou fotos da referência. Não inclui plataforma NFC/QR: os produtos seguem a especificação decorativa do pedido.

## Estado da entrega

Carrinho e simulador funcionais; backend Mangofy implementado. Testes usam provedor simulado. **Não houve pagamento real nem teste no sandbox Mangofy**, pois não foram fornecidas credenciais/acesso. A loja inicia em demonstração sem cobranças. Preços, frete de R$ 19,90 e imagens SVG são demonstrativos e exigem confirmação comercial.

## Desenvolvimento e publicação

Node.js 24, sem dependências de terceiros.

```sh
npm run dev
npm test
npm run build
```

Build copia `public/` para `dist/`; Vercel publica funções `api/` separadamente. Para carregar configuração local: `node --env-file=.env scripts/dev.mjs`.

Importar `andreysimonetto07/oferta-plaquinha` na Vercel. Framework Other; build `npm run build`; output `dist`; Node 24. Esses valores estão em `vercel.json`, junto dos headers de segurança. A integração Git pode publicar automaticamente após push em main.

Configurar variáveis de `.env.example` no painel Vercel. Nunca colocar chaves reais no repositório, frontend ou conversa.

| Variável | Uso |
| --- | --- |
| `MANGOFY_API_KEY` | Header Authorization exatamente como fornecido pelo gestor |
| `MANGOFY_STORE_CODE` | Header Store-Code da integração |
| `MANGOFY_BASE_URL` | Padrão oficial `https://checkout.mangofy.com.br`; base de sandbox deve ser confirmada pelo gestor |
| `MANGOFY_API_STYLE` | `method`: `/api/v1/payment/pix` ou `/api/v1/payment/credit-card`; `unified`: `/api/v1/payment` |
| `APP_URL` | URL HTTPS definitiva, usada para validar origem e postback |
| `ORDER_SECRET` | Segredo aleatório de pelo menos 32 caracteres |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis REST privado e persistente, com acesso de leitura/escrita |
| `SELLER_DETAILS` | Identificação do vendedor e contato, exibidos no rodapé |
| `ENABLE_CARD_PAYMENTS` | `true` somente após habilitação e avaliação de segurança do fluxo |
| `SHOP_READY` | `true` após confirmar preços, frete, prazos, políticas, identidade e pagamento |

Gerar segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Não usar credenciais de produção em testes. Banco Redis não foi provisionado automaticamente.

## Contrato Mangofy verificado em 03/10/2026

Fontes oficiais: <https://app.mangofy.com.br/checkout/doc> e <https://app.mangofy.com.br/checkout-doc.json>.

**As fontes divergem:** o OpenAPI incorporado na página descreve endpoints separados e base `https://checkout.mangofy.com.br`; a coleção Postman descreve endpoint unificado e uma base `.test` ilustrativa. O código oferece as duas opções. Não faz fallback automático de POST, pois isso pode duplicar cobrança. Confirmar endpoint/sandbox com o gestor.

Payload: `external_code`, `payment_method`, `payment_format`, `installments`, `payment_amount` em centavos (total com frete), `shipping_amount` (parcela informativa), `items` com `code/name/quantity/price/digital_flag:false`, `customer` com `document/phone/ip` e endereço, `shipping`, `postback_url` e `pix.expires_in_days`. Cartão usa `card.number/holder_name/expiration_month/expiration_year/cvv/soft_descriptor`, seguindo o esquema atual. **Confirmar no sandbox a semântica de shipping_amount**, pois o exemplo público não demonstra frete não-zero; o servidor compara o valor retornado e bloqueia divergências. Se o provedor tratar frete como adicional, ajustar payment_amount e a conciliação antes de abrir vendas.

Respostas: `payment_code`, `payment_status`, `pix.pix_qrcode_text`, `pix.pix_qrcode_image`, `pix.pix_expires_at`. Não utiliza a URL fictícia `api.mangofy.com.br/checkout` do prompt original.

## Rotas e segurança

- `GET /api/config`: disponibilidade pública do checkout, sem segredos.
- `POST /api/checkout`: valida cliente, CPF/CNPJ e endereço; recalcula preços/frete no servidor; registra pedido e cria cobrança. Exige mesma origem e `Idempotency-Key` UUID. Valores enviados pelo cliente são ignorados.
- `GET /api/status/{pedido_id}`: exige Bearer token exclusivo do pedido; consulta o provedor e compara código externo, método, total e frete. Não expõe endereço/documento.
- `POST /api/webhook?order=...&token=...`: callback com HMAC próprio por pedido. A documentação não define assinatura Mangofy. A aprovação recebida não é aceita diretamente: o backend faz GET autenticado no provedor e valida a transação. Repetições reconciliam o estado sem iniciar entrega ou novo pagamento.

Banco: chaves `order:OP-...`, `checkout:<uuid>`, `rate:...`. Pedidos persistem sem expiração automática para não perder dados de entrega; definir política de retenção e exclusão. Idempotência expira em 24h. Timeout após POST retorna `verification_required`; não criar outra cobrança. Se houver payment_code, consultar status. Se não houver, conciliar pelo webhook ou localizar pelo código externo no painel Mangofy. Não há painel administrativo nesta versão.

Cartão/CVV permanecem somente na memória da requisição; não são persistidos ou registrados. Cartão inicia desabilitado. O responsável deve atender às exigências PCI DSS antes de ativar o fluxo. A documentação consultada não fornece SDK de tokenização inicial ou hosted fields; nenhum SDK foi inventado. O token descrito é para cartões já salvos no provedor.

## Catálogo e conteúdo comercial

Editar `public/js/catalog.js`: fonte compartilhada pelo frontend/backend. Mínimo 5 por variante; descontos pela soma das cores do mesmo modelo; faixas 5–9, 10–49 e 50+; personalização até 60 caracteres. Limites: 1.000 por item e 2.000 por pedido. Textos inseridos pelo cliente são escapados ao exibir.

Substituir SVGs por fotos reais; completar `public/politicas.html`; revisar FAQ, tabela, preços e frete; publicar identificação e contato, prazo de produção/entrega, aprovação da personalização, trocas e retenção de dados. O readiness exige configuração comercial e credenciais, mas não valida automaticamente o conteúdo editorial das políticas.

## Antes de receber pagamentos

1. Configurar sandbox confirmado pela Mangofy e Redis de teste.
2. Confirmar endpoint, campos e tratamento do frete com o gestor.
3. Gerar Pix; conferir valor, itens, endereço, QR Code, validade e aprovação.
4. Verificar webhook repetido, token inválido e consulta de status autorizada.
5. Testar cartão aprovado/recusado, timeout e idempotência.
6. Conferir ausência de dados de cartão em banco/logs.
7. Confirmar condições comerciais; então ativar `SHOP_READY` no ambiente definitivo.

A página de acompanhamento só informa pagamento confirmado com status `approved` consultado no servidor. Parâmetros da URL nunca confirmam pagamentos.
