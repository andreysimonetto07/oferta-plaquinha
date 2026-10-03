# TapStar

Loja de placas Google azul, Google preta e Instagram com NFC + QR Code. Identidade TapStar usando as duas logos fornecidas no repositório. Visual baseado nos prints enviados: hero com placas sobrepostas, fundo claro quadriculado, destaque verde, tabela de atacado e simulador escuro. Somente Pix.

## Catálogo e desconto

`public/js/catalog.js` é compartilhado pelo navegador e servidor. A soma de **todos os modelos** determina um único preço por placa:

| Total de placas | Preço por placa |
| --- | --- |
| 1 | R$ 25 |
| 2–49 | R$ 20 |
| 50–299 | R$ 17 |
| 300–2.000 | R$ 15 |

20 Google azuis + 30 Google pretas = 50 placas, R$ 17 por unidade, R$ 850 em produtos. O frete de referência é R$ 19,90 por pedido (total R$ 869,90). Preços seguem o print; frete, especificações, disponibilidade e prazos precisam ser confirmados pelo responsável antes de aceitar pagamentos. Carrinho antigo de peças decorativas não é reaproveitado.

As peças físicas exigem configuração do destino NFC/QR para cada negócio. Este site não inclui plataforma de links dinâmicos, painel de ativação, fabricação, envio ou integração com o Google Business Profile. Não promete uma plataforma ainda inexistente.

## Desenvolvimento e deploy

Node.js 24, sem dependências de aplicação de terceiros:

```sh
npm run dev
npm test
npm run build
```

Para configuração local: `node --env-file=.env scripts/dev.mjs`. Build copia `public/` para `dist/`; Vercel serve `api/` separadamente. Projeto Vercel `tap-star`, conectado a `andreysimonetto07/oferta-plaquinha`, branch main. Produção: <https://tap-star-two.vercel.app/>. Framework Other, build `npm run build`, output `dist`, Node 24; configuração em `vercel.json`.

## Configuração de Pix

Não houve pagamento real nem teste em sandbox Mangofy: faltam credenciais e configuração do banco. Testes usam provedor e Redis simulados. O checkout fica bloqueado enquanto a configuração não estiver pronta. Nunca colocar chaves no frontend, repositório ou conversa.

| Variável | Uso |
| --- | --- |
| `MANGOFY_API_KEY` | Header Authorization como fornecido pela Mangofy |
| `MANGOFY_STORE_CODE` | Header Store-Code |
| `MANGOFY_BASE_URL` | Base oficial ou sandbox confirmado pelo gestor |
| `MANGOFY_API_STYLE` | `method` para `/api/v1/payment/pix`; `unified` para `/api/v1/payment` |
| `APP_URL` | URL HTTPS da loja para validar origem e postback |
| `ORDER_SECRET` | Segredo aleatório de pelo menos 32 caracteres |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Banco Redis REST privado e persistente |
| `SELLER_DETAILS` | Identificação e contato do vendedor, exibidos no rodapé |
| `SHOP_READY` | `true` somente após completar configuração comercial e validar Pix |

Gerar segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Banco e credenciais não foram provisionados. Somente `payment_method: 'pix'` é aceito. Outros métodos são rejeitados no servidor; não há campos, processamento ou armazenamento de dados de cartão.

## Contrato Mangofy

Fontes oficiais verificadas na implementação inicial em 03/10/2026: <https://app.mangofy.com.br/checkout/doc> e <https://app.mangofy.com.br/checkout-doc.json>.

O OpenAPI incorporado descreve endpoints separados e base `https://checkout.mangofy.com.br`; a coleção Postman descreve endpoint unificado e base `.test` ilustrativa. O código permite escolher a versão confirmada pelo gestor. Não faz fallback de POST, para evitar cobranças duplicadas. Confirmar sandbox e contrato antes de habilitar vendas.

Payload: `external_code`, `payment_method: pix`, `payment_format`, `installments: 1`, `payment_amount` em centavos (total com frete), `shipping_amount` (parcela informativa), `items` com código, nome, quantidade, preço e `digital_flag: false`, `customer` com documento, telefone, IP e endereço, `shipping`, `postback_url` e `pix.expires_in_days`.

**Validar a semântica do frete no sandbox:** o exemplo público não demonstra frete não zero. O servidor confere total e frete retornados e bloqueia divergências. Se o provedor somar frete adicionalmente, ajustar o payload e a conciliação antes de abrir vendas.

Resposta: `payment_code`, `payment_status`, `pix.pix_qrcode_text`, `pix.pix_qrcode_image`, `pix.pix_expires_at`. Não usa o endpoint fictício do prompt inicial.

## Rotas e segurança

- `GET /api/config`: disponibilidade, `payment_method: pix` e dados públicos do vendedor.
- `POST /api/checkout`: valida CPF/CNPJ, dados e endereço; recalcula preço agregado e frete; exige mesma origem e UUID de idempotência; persiste pedido antes de gerar Pix.
- `GET /api/status/{pedido_id}`: exige token exclusivo; consulta o provedor; valida pedido, código, método, total e frete; não expõe documento ou endereço.
- `POST /api/webhook?order=...&token=...`: token HMAC por pedido. A aprovação do corpo nunca é confiada diretamente: consulta autenticada ao provedor e conciliação antes de atualizar status.

Chaves Redis `order:OP-...`, `checkout:<uuid>` e `rate:...`. Pedidos persistem para entrega; definir política de retenção. Idempotência dura 24h. Timeout de criação gera `verification_required`: não iniciar outra cobrança; consultar pelo código ou conciliar o pedido no provedor. Nenhuma entrega automática ou painel administrativo está implementado.

## Verificação antes de liberar pagamentos

Confirmar os dados comerciais e completar `public/politicas.html`. Com sandbox e Redis de teste, conferir valor, itens, endereço, QR, validade, aprovação, callbacks repetidos, token inválido, timeout e idempotência. Ativar `SHOP_READY` apenas após essas verificações. A página de acompanhamento só confirma `approved` consultado no servidor.

## Assets

`IMG_2723.PNG` e `IMG_2724.PNG` originais foram preservadas. Cópias usadas em `public/assets/tapstar-cover.png` e `tapstar-logo.png`. Fotos de modelos provenientes dos assets públicos da referência solicitada <https://www.tapsmart.com.br/>: `/landing/placa-azul.webp`, `/landing/placa-preta-mockup.webp` e `/landing/placa-instagram.webp`. Fontes Geist e Geist Mono com licença SIL OFL em `public/assets/FONT-LICENSE.txt`. Nenhuma métrica de vendas ou depoimento fictício foi incluído.
