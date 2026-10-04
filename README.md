# TapStar

Loja pt-BR de Google azul, Google preta, Instagram e Google em L. Visual compacto, logos fornecidas no repositório, pedido mínimo de 5 placas e pagamento somente Pix. Publicação GitHub → Vercel, projeto `tap-star`: <https://tap-star-two.vercel.app/>.

## Preços e entrega

A soma dos quatro modelos determina a faixa. Cada modelo conserva o seu preço:

| Quantidade total | Comuns | Google em L |
| --- | --- | --- |
| 5–99 | R$ 9,99 | R$ 12,99 |
| 100 ou mais | R$ 7,49 | R$ 12,99 |

Frete grátis: 6 dias úteis. Frete Full: R$ 16,90, 2 dias úteis. Prazos estimados após confirmação do Pix. Escolha de frete aparece no carrinho e checkout e é recalculada no servidor. Seletores do catálogo e simulador iniciam em zero, sem selecionar modelos pelo cliente. Carrinho pode ser montado aos poucos; API exige mínimo de 5 no pedido inteiro. O desconto das placas comuns começa exatamente em 100 unidades somadas; Google em L mantém R$ 12,99.

O limite é **R$ 900,00 por pagamento, incluindo frete**, em centavos (`MAX_TOTAL_CENTS=90000`). Carrinho e simulador mostram totais acima do limite para permitir ajustes, mas bloqueiam a finalização. Checkout revalida ao trocar frete; API recalcula e rejeita acima do teto tanto no `prepare` quanto no `create`, antes de chamar Mangofy. Não dividimos automaticamente uma compra em vários Pix. Sem contas e sem armazenamento próprio, esse teto é por transação; não controla um limite acumulado por CPF/conta. O limite técnico de 2.000 unidades continua servindo apenas para validar entradas.

`public/js/catalog.js` é a fonte compartilhada de preços e entrega. Valores enviados pelo navegador não são confiados. O modelo em L usa ilustração gerada, indicada no catálogo; confirmar acabamento com fornecedor. A configuração física dos destinos NFC/QR e um eventual serviço de QR dinâmico são operações separadas. Nenhuma plataforma de gestão de placas está implementada.

## Sem banco próprio

Não há Redis, banco de pedidos, administração ou histórico local de pedidos. A Mangofy recebe os itens, cliente e endereço; o site consulta o pagamento diretamente por `payment_code`. Confirmar na conta Mangofy a disponibilidade desses dados para expedição antes de aceitar vendas. Não há automação de despacho.

1. `POST /api/checkout`, `action: prepare`: valida mínimo, teto de R$ 900, modelos, frete, cliente e origem. Retorna ticket assinado, referência, hash dos dados e valores recalculados (`total_cents`, `shipping_cents`). O cliente confere esses valores antes de criar o Pix; uma diferença de preço exige recarregar a página. Não gera cobrança.
2. `action: create` + ticket: confere o hash, recalcula os valores e faz um único POST Pix nessa execução.
3. A resposta contém recibo assinado com código Mangofy, referência e valores. O navegador guarda recibo e QR; não grava nome, documento, telefone ou endereço nesse armazenamento.
4. `GET /api/status/{pedido_id}` com Bearer recibo: valida assinatura, consulta a Mangofy e confere referência, método, código, total e frete antes de informar aprovação.
5. `POST /api/webhook?token=...`: ticket assinado por transação; consulta a Mangofy, nunca confia na aprovação do corpo. Apenas confirma recebimento, sem persistir estado ou iniciar entrega.

Tickets de preparação: 20 minutos. Recibos e callbacks: 7 dias. Tokens não ficam em parâmetros públicos da página de acompanhamento. `ORDER_SECRET` permanece somente no servidor.

### Repetições e timeout

Sem persistência e sem idempotência documentada pelo provedor, não existe garantia de deduplicação entre todas as instâncias Vercel. A documentação pública consultada não define header de idempotência ou busca por código externo.

A proteção do site usa: clique bloqueado enquanto processa, Web Lock entre abas compatíveis, marcador persistente no navegador escrito **antes** de criar o Pix, e cache temporário por instância para repetir a resposta de uma tentativa. Esse cache não é banco ou lock distribuído; expira após 24h e pode sumir ao reiniciar a função. Limite de requisições também é local por instância, não uma garantia global.

O frontend **não repete o POST de criação** após perda da conexão, erro ou resultado incerto. Refresh mantém o bloqueio. Resultado incerto exige conferência manual na Mangofy usando a referência `TS-...`; não criar outra cobrança. Sem `payment_code` retornado, o site não consegue recuperar automaticamente esse resultado. Para deduplicação global garantida, o provedor precisa oferecer contrato de idempotência verificável, ou será necessário armazenamento persistente.

Pagamentos pendentes podem ser reabertos no mesmo navegador. Aprovação ou status terminal confirmado limpa somente a tentativa correspondente. Não limpar manualmente os dados do navegador durante uma cobrança pendente. A confirmação nunca depende apenas de parâmetros da URL.

### Diagnóstico e recuperação de um Pix existente

A disponibilidade de `/api/config` comprova que as variáveis obrigatórias existem; ela **não autentica as credenciais na Mangofy**. Falhas de autorização, acesso, validação, timeout, resposta inválida, ausência do Pix e divergência de valores recebem diagnósticos separados. O retorno `verification_required` continua bloqueando uma nova criação, pois o provedor não documenta idempotência nem uma garantia geral de que uma resposta de erro não criou cobrança.

Na Vercel, abra **Logs**, filtre `/api/checkout` e procure `tapstar.pix.create.failed` junto da referência `TS-...`. Os registros contêm somente referência, categoria, HTTP/forma de resposta, nomes de campos previamente permitidos e indicação de referência retornada. Chaves, cabeçalhos, corpos do provedor, dados pessoais e QR Pix não são registrados. O navegador mostra o código em **Detalhes para o atendimento**. Recibos antigos, emitidos antes desta correção, não possuem diagnóstico retrospectivo.

Se a Mangofy retornou um `payment_code` associado ao pedido, ele é preservado mesmo quando o QR não voltou ou os valores divergiram. A consulta posterior faz somente GET e mantém a conferência dos valores. Para recibos antigos sem código, localizar manualmente a cobrança no painel Mangofy pela referência e valor; o **código da cobrança** pode ser informado em **Consultar ou recuperar este Pix → Recebeu o código da cobrança pelo atendimento?**. Não usar API Key ou Store Code nesse campo.

`GET /api/status/{pedido_id}?payment_code={codigo_existente}` exige o recibo Bearer já assinado. Apenas expõe o Pix e reemite recibo depois de conferir referência, método, código, total e frete. Não aceita códigos de outro pedido e não faz POST ao provedor. Após recuperar, **Abrir meu Pix** reabre QR e copia e cola no checkout. Se nenhum pagamento existir no painel, o responsável deve confirmar esse resultado antes de liberar uma nova tentativa; o site não apaga automaticamente um resultado incerto.

## Configuração

Executar `npm ci` antes dos comandos abaixo. `jsdom` e `jsqr` verificam a interface e decodificam os QR de teste. `qrcode` 1.5.4 e `esbuild` geram o encoder local do navegador; as funções de pagamento não dependem dessas bibliotecas. A suíte contém 37 testes, incluindo exibição do QR de teste, copia e cola, recarregamento, clique duplo e confirmação simulada. Nenhuma chamada desses testes alcança a Mangofy real.

O checkout acompanha alterações de quantidade e entrega feitas em outra aba. Se uma alteração ainda não apareceu na tela no momento do clique, ele pede que o cliente confira o novo total antes de gerar o Pix. Durante a requisição, os campos ficam bloqueados para manter os dados revisados.

Node.js 24, sem dependências de aplicação. `npm run dev`, `npm test`, `npm run build`. Para variáveis locais: `node --env-file=.env scripts/dev.mjs`. Build copia `public/` para `dist/`, e Vercel serve `api/` separadamente. Cada publicação usa JS e CSS em `/static/<hash>/`, com todos os imports relativos da mesma versão. O hash muda quando HTML, JS ou CSS mudam. HTML e caminhos antigos de JS/CSS usam `Cache-Control: no-store`; arquivos com hash usam cache imutável. Uma aba que já estava aberta com código antigo precisa ser recarregada ou reaberta; não apagamos carrinhos nem recibos Pix para atualizar a interface. Framework Other; build `npm run build`; output `dist`; branch main.

| Variável | Uso |
| --- | --- |
| `MANGOFY_API_KEY` | Header Authorization fornecido pela Mangofy |
| `MANGOFY_STORE_CODE` | Store-Code da integração |
| `MANGOFY_BASE_URL` | `https://checkout.mangofy.com.br`, confirmado nos exemplos da documentação oficial; URL de sandbox somente se fornecida pelo gestor |
| `APP_URL` | URL HTTPS da loja para origem e callback |
| `ORDER_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `SELLER_DETAILS` | Identificação e contato do vendedor |
| `SHOP_READY` | `true` após configurar e testar Pix |

Não há variáveis de banco. Não commitir chaves reais. Gerar segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. `/api/config` divulga somente disponibilidade, Pix, armazenamento no provedor e identificação pública.

### Mensagem de loja em configuração

`/api/config` precisa retornar `ready: true` para liberar o botão Pix. Na configuração atual, `SELLER_DETAILS` também é obrigatório: preencher somente as chaves da Mangofy, URL, segredo e `SHOP_READY` deixa o pagamento desativado. Usar a identificação comercial real da loja; o valor aparece publicamente no site. Conferir se todas as variáveis estão em **Production** e fazer uma nova publicação após salvá-las, pois uma publicação existente conserva suas variáveis anteriores. Não remover a validação de credenciais para ocultar a mensagem.

## Contrato e teste Mangofy

Fontes oficiais verificadas em 03/10/2026: <https://app.mangofy.com.br/checkout/doc> e <https://app.mangofy.com.br/checkout-doc.json>, além da coleção V1 fornecida pelo responsável pela loja. A criação de Pix usa exclusivamente `POST /api/v1/payment`. `Authorization` recebe a chave diretamente, sem adicionar `Bearer`; `Store-Code` recebe o código da integração. Consulta: `GET /api/v1/payment/{payment_code}`. A variável legada `MANGOFY_API_STYLE` é ignorada para que uma configuração antiga não envie uma cobrança para a rota desatualizada. Nenhum fallback automático de POST foi implementado.

`https://whitelabel-checkout.test` é o placeholder da coleção Postman. Não usar esse endereço em produção; o site recusa habilitar pagamentos quando ele está configurado. O domínio `https://checkout.mangofy.com.br` foi confirmado nos exemplos visíveis da documentação oficial. Sandbox, se existir para a conta, precisa ter o domínio fornecido pela Mangofy. Redirecionamentos HTTP não são seguidos nas chamadas autenticadas.

Payload: `external_code`, `payment_method: pix`, `payment_format`, `installments: 1`, `payment_amount` em centavos (total com frete), `shipping_amount` como parcela informativa, `items`, cliente/endereço, `shipping`, `postback_url`, `pix.expires_in_days`, metadata de frete. **Confirmar a semântica do frete no sandbox**: se o provedor somar frete adicionalmente, ajustar o payload e a conciliação antes de liberar vendas. O servidor bloqueia divergência nos valores retornados.

Credenciais reais são configuradas exclusivamente como variáveis privadas na Vercel; não ficam neste repositório, em arquivos públicos ou no bundle. Não houve cobrança real ou sandbox. Testes simulam a Mangofy; cobrem preços (99/100), mínimo (4/5), teto de R$ 900 com frete e valores forjados, fretes, alteração de ticket, Pix somente, sessão sem banco, callback falso, divergência e timeout. Antes de `SHOP_READY=true`, gerar Pix de teste, conferir valores, itens/endereço disponíveis para entrega e status aprovado. Completar políticas e contato comercial. A tela normal não promete pagamento confirmado antes de consulta ao provedor.

## Assets

Logos originais `IMG_2723.PNG`, `IMG_2724.PNG` preservadas; cópias em `public/assets/`. Fotos comuns são os assets públicos da referência solicitada TapSmart (`/landing/placa-azul.webp`, `/landing/placa-preta-mockup.webp`, `/landing/placa-instagram.webp`).

`public/assets/google-l.png`: ilustração criada com a ferramenta integrada de geração de imagens. Prompt: placa Google azul para avaliações, NFC e QR ilustrativo, acrílico dobrado em L com base de balcão, vista de três quartos, fotografia de produto em fundo transparente; referência da arte da Google azul. Nenhuma marca TapSmart ou foto de fornecedor é atribuída a essa ilustração.

Fontes Geist/Geist Mono com licença SIL OFL em `public/assets/FONT-LICENSE.txt`.

## Interface azul e exibição local do QR Pix

A interface usa azul, sem citar o gateway nos textos das páginas, diagnóstico, acompanhamento ou erros retornados ao comprador. As variáveis privadas e o contrato de integração conservam seus nomes técnicos. Frete grátis: **6 dias úteis**; Full: **2 dias úteis**, R$ 16,90. O prazo compartilhado em `catalog.js` também é enviado nos metadados da cobrança.

A imagem do QR não depende de `pix_qrcode_image`. O checkout gera um SVG no próprio navegador a partir do **texto exato** de `pix_qrcode_text`, preservando a margem de quatro módulos e contraste preto/branco. Não consulta serviço externo de QR e não cria outra cobrança. Um Pix já salvo sem imagem passa a exibir o QR ao recarregar; recibo, carrinho e copia e cola permanecem disponíveis. Datas ISO com fuso explícito aparecem em português, no horário de Brasília.

`npm run pretest`, `prebuild` e `predev` compilam `scripts/pix-qr-entry.mjs` em `public/js/vendor/pix-qr.js`. Esse bundle e suas licenças MIT ficam versionados. A versão do storefront inclui o encoder e seus imports no hash. O teste com `jsqr` decodifica a imagem gerada e confere igualdade exata do texto; o teste da interface comprova o QR sem imagem do provedor e a reabertura sem nova chamada de criação.
