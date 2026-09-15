# Bacco Adega CRM — design v1

- **Data:** 2026-09-15
- **Status:** aprovado em conversa; aguardando revisão desta spec
- **Base:** fork de [melgarafael/DeskcommCRM](https://github.com/melgarafael/DeskcommCRM) (MIT), tag `v1.27.0`
- **Repo:** `/home/lussandro/Bacco-Crm`, remote `upstream`, branch `bacco`

## 1. Objetivo

Produto novo da Bacco Sistemas, **exclusivo para vinícolas** ("CRM exclusivo para
vinícolas"), para captarem e converterem três públicos — **clientes da vinícola** (quem compra
para revender/servir), **interessados em enoturismo** e **consumidores de vinho** —, sobre a estrutura completa do DeskcommCRM (inbox WhatsApp, funil, agentes de IA,
captação, multi-tenant, LGPD), com **identidade visual Bacco remodelada por inteiro**.

Não confundir com o "Bacco CRM" antigo (`~/Downloads/bacco-crm`), que é o CRM interno para
vender o Bacco-ERP a vinícolas. Os dois seguem separados; este se chama **Bacco Adega CRM**.

## 2. Fora de escopo (v1)

| Item | Por quê | Destino |
|---|---|---|
| Reservas de enoturismo (lotação, ingresso, grupo, pagamento) | Agenda do upstream é compromisso 1:1 sem capacidade/preço (`0177_agenda_o_compromisso_marcado.sql`); o Bacco-ERP já tem módulo completo | Módulo à parte, v2 |
| Integração Bacco-ERP (catálogo, estoque, reserva) | Sem contrato de API definido para isso | v2, com contrato do ERP |
| Adaptador Evolution API | Upstream só tem `meta-cloud`, `waha`, `zernio` (`lib/channels/adapters/`) | Issue, se necessário |
| Atributos estruturados de vinho (safra, uva, volume, teor) | `catalog_products` não tem coluna de atributos (`0204`) | Issue, v2 via `supabase/bacco.sql` |
| Cobrança automatizada (Asaas) e integração Bacco-Licenças | Licenças com 0 testes e modelo por instalação, não por organização (§6a) | v1.1, spec própria |
| Limites impostos por plano (usuários, números WhatsApp, IA) | `plan` do upstream é só rótulo (§6a) | v1.1, junto com Licenças |
| Renomear identificadores técnicos (`sb-deskcomm-auth`, `X-Deskcomm-Signature`, MCP `deskcomm-crm`, `deskcomm-theme`, `deskcomm-impersonate`) | Invisíveis ao usuário final; trocar derruba sessões/integrações e conflita em todo merge | Mantidos |

## 3. Estratégia de fork e atualização

Achados que determinam a estratégia (verificados no código da `v1.27.0`):

- Produção aplica **`supabase/baseline.sql`** (pg_dump idempotente, ~1,2 MB), não a pasta
  `migrations/` (`hostgator-setup-kit/install.sh:1775-1828`, `update.sh:139-175`).
- O kit fixa o namespace das imagens em `hostgator-setup-kit/_common.sh:453`
  `IMG_NS="ghcr.io/melgarafael"` e o `update.sh` **regrava** `APP_IMAGE`/`WORKER_IMAGE`/
  `SCHEDULER_IMAGE` a partir dele (`update.sh:233-237`); os defaults também apontam para o
  upstream em `docker-compose.prod.yml:35,92,212` e `.env.hostgator.example:32,39,41`.
  Sem trocar esses pontos, a primeira atualização volta a rodar a imagem do upstream e
  **apaga o rebrand**. Também apontam para o upstream: `REPO_URL` em `install.sh:18`,
  `comecar.sh:16`, `_common.sh:470`, e as URLs `raw.githubusercontent.com` em `comecar.sh:12`,
  `diagnostico.sh:22`.
- Ritmo do upstream: 39 tags de 2026-07-27 a 2026-09-15.

Decisões:

1. **Merge só por tag de release** (`git merge vX.Y.Z`), nunca da `main`. Cada merge exige
   `pnpm gov:verify` e `pnpm test:db` verdes antes de gerar imagem.
2. **Imagens próprias** para app, worker e scheduler, construídas nesta máquina (19 GB RAM) ou
   em CI do fork, publicadas num registry da Bacco. `.env` da VPS fixa `APP_IMAGE`,
   `WORKER_IMAGE`, `SCHEDULER_IMAGE`. A VPS nunca compila.
3. **Kit de instalação próprio**: `install.sh`/`update.sh`/`comecar.sh`/`diagnostico.sh`
   apontam para o repo e registry Bacco; saem os links de afiliado HostGator e as URLs
   `raw.githubusercontent.com/melgarafael/...`.
4. **Schema próprio segue a doutrina do upstream** (revisado após review Codex, 2026-09-15):
   o kit só aplica `supabase/baseline.sql` (`install.sh:1775-1827`, `update.sh:149-156`) e
   `tests/unit/manifest-x-migrations.test.ts` cobra o MANIFEST. Toda mudança de schema Bacco
   sai como a **tripla** de `CLAUDE.md:464-495`: arquivo em `supabase/migrations/`, linha no
   `MANIFEST.md`, apêndice idempotente rotulado no fim do `baseline.sql`
   (`-- ---- <coisa> (migration NNNN, bacco) ----`). ~~`bacco.sql` separado~~ descartado: exigiria
   kit divergente e ficaria fora dos gates. Custo aceito: conflito no fim do `baseline.sql` a
   cada merge de tag — resolve-se mantendo os dois apêndices (ambos idempotentes) e rodando
   `pnpm test:db`. A v1 **tem** schema novo (§5.5).
5. `LICENSE` mantém o copyright original (exigência MIT); acrescenta-se o da Bacco Sistemas.

## 4. Rebrand

### 4.1 Identidade (fonte: board do produto `docs/brand/bacco/referencia-board-2026-09-15.png`)

O board do Bacco Adega CRM prevalece sobre o brandbook institucional da Bacco Sistemas
(`~/Downloads/bacco-identidade-visual.md`: `#4D0E17`/`#B78136`/`#F8F1E9`, Cormorant +
Montserrat), que fica como referência da marca-mãe.

| Papel | Valor |
|---|---|
| Borgonha (principal) | `#4A0E1F` |
| Creme (background) | `#F5F0E6` |
| Ouro (destaques) | `#C49A4A` |
| Grafite (apoio) | `#2E2E2E` |
| Títulos / marca | Playfair Display |
| Corpo / interface | Inter |
| Tagline (no logo) | "Relacionamento e atendimento inteligente" — substitui a do board |
| Posicionamento (copy) | "CRM exclusivo para vinícolas" |
| Símbolo | **B** serifado (Playfair Display 600) com folha de videira em borgonha no topo e cacho de 6 uvas em ouro — substitui a gota-balão do board |

Assinaturas do board para copy: "Conexões que maturam resultados", "Vinhos movem pessoas.
Dados aproximam.", "Tradição encontra inteligência para um brinde mais longe."

⚠️ O board é raster gerado por IA: serve de direção e de valor de cor, **não** de arte final.
Símbolo e logotipo só entram a partir do SVG oficial (§4.4). Se o SVG trouxer hex
diferentes, o SVG ganha.

### 4.2 Paleta e tema

- Editar **diretamente** os tokens de `app/globals.css` (`:root` e `[data-theme="dark"]`).
  Arquivo separado não serve: `lib/branding/regua-do-produto.ts` é gerado do `globals.css`
  e `lib/branding/contraste.ts` extrai a régua dele; override por fora dessincroniza a derivação.
- Rampa accent de 11 tons a partir do bordô; neutros quentes a partir do creme; dourado como
  cor secundária (destaques, marca), não como accent de ação.
- Dark mode desenhado à parte (padrão do upstream: "Light + dark drawn separately").
- `--color-danger` precisa ficar **distinguível** do accent bordô (botão primário não pode
  parecer destrutivo): verificar par accent × danger também sob simulação de dicromacia
  (`simularDicromacia`, `PISO_DE_SEPARACAO_SIMULADA`).
- Regenerar `regua-do-produto.ts` com o literal impresso por
  `tests/unit/branding-regua-do-produto.test.ts`.

### 4.3 Tipografia

`app/layout.tsx` (`next/font/google`): `Atkinson_Hyperlegible` → **Inter** no corpo e na
interface; **Playfair Display** só em títulos de página, marca e telas públicas (login,
onboarding, e-mails) — nunca em tabela, inbox ou kanban, onde serifa de display perde
legibilidade em tamanho pequeno. `IBM_Plex_Mono` mantido. Validar com screenshot de inbox e
kanban nos dois temas.

### 4.4 Marca do produto

- **Fork com marca de produto, deliberado** (review Codex, 2026-09-15). A doutrina do
  upstream (`CLAUDE.md:147-153`) é "uma imagem serve todas as marcas; marca vem de
  `platform_branding`". Isso cobre nome/logo/cor de accent, **não** paleta completa,
  tipografia e símbolo em duas cores — que é o que o dono pediu. Portanto o Bacco Adega CRM
  troca a marca **do produto** (imagem própria, §3.2), e os testes-doutrina mudam no mesmo
  commit, com a razão escrita no teste:
  - `tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts:57` `MARCA_DO_PRODUTO`;
  - `tests/unit/branding.test.ts:146` prefixo `deskcommcrm` → `bacco-adega-crm`, e a catraca
    `MARCA_CONGELADA` (~`:210`) reconciliada com o que sobrar de "deskcomm";
  - `branding-contraste.test.ts:61,63`, `branding-rampa.test.ts:113,116`,
    `branding-pares-pintados.test.ts:340` (âncoras Sage `#506d48`/`#161510`);
  - `supabase/templates/{confirmation,recovery}.html` (fallback `background: #506d48` antes de
    `__ACCENT__`, `confirmation.html:27`) e `hostgator-setup-kit/marca-emails.sh:140`
    (`ACCENT="#506d48"` quando `APP_ACCENT_HEX` é inválido) → accent Bacco derivado;
  - `tests/unit/tailwind-tokens.test.ts:89` (`DE_FORA_DO_CSS` lista `--font-atkinson`) junto com
    a troca de fonte (§4.3; `globals.css:535,701`).
  - **Não mudam** (medido): as fixtures com `#506d48` em
    `app/api/v1/ai/providers/route.test.ts:52`, `app/email-templates/[modelo]/route.test.ts:22`,
    `lib/email/templates/acesso-gotrue.test.ts:21` usam marca de exemplo ("Acme", "THOTH CRM"),
    não a do produto.
  A instância Bacco continua podendo receber marca por organização (logo da vinícola).
- `lib/branding.ts:19` `DEFAULT_APP_NAME = "Bacco Adega CRM"`.
- **Arte oficial recebida em 2026-09-15**, guardada em `docs/brand/bacco/`:
  `bacco-adega-crm-simbolo.svg` (512×512), `bacco-adega-crm-logo-principal.svg` (1200×620,
  empilhado, borgonha+ouro+grafite), `bacco-adega-crm-logo-bordo.svg` (1600×420, horizontal
  monocromático) e `preview.png` (6 aplicações).
- ⚠️ Os SVGs recebidos usam `<text>` com `font-family` — renderizam diferente em cada máquina
  e o `satori` do favicon não os lê. **Converter texto em paths** com as fontes reais
  (Playfair Display wght 600/400, Inter wght 400 opsz 14, OFL, `google/fonts`) via fontTools.
  Viabilidade **medida** em spike (2026-09-15): os três convertidos com zero `<text>` e o
  render `rsvg-convert` bate com o `preview.png`. Pendências da conversão: sem kerning
  (fontTools puro — conferir contra o preview no plano), arredondar coordenadas (logos com
  tagline saíram com ~70 KB).
- **O contrato de `desenho.ts` muda.** Hoje o símbolo é 1 `path` + 1 `rect` numa cor só,
  consumido por `app/icon.tsx:97-100` e `components/branding/MarcaDoProduto.tsx:57-59,73-75`.
  O novo tem **duas cores** (folha e B em borgonha, uvas em ouro): `SIMBOLO` e
  `LOGOTIPO.simbolo` passam a ser partes com papel de cor (`corpo`, `uvas`), e
  `CORES_DA_MARCA` / `CLASSES_DE_COR` ganham o papel `uvas` nos dois temas.
  `tests/unit/marca-do-produto.test.tsx` acompanha.
- Cores por tema: claro = corpo `#4A0E1F`, uvas `#C49A4A`, nome `#4A0E1F`, sufixo `#C49A4A`;
  escuro = corpo/nome creme `#F5F0E6`, uvas/sufixo `#C49A4A` (como o negativo sobre borgonha
  do `preview.png`).
- Favicon (`app/icon.tsx`): o símbolo não está centrado no `viewBox` 512 (sobra à direita e
  embaixo) — recortar pelo bbox real antes de reduzir a 32/64 px, e conferir legibilidade das
  uvas nesse tamanho.
- Variantes que aparecem no `preview.png` mas **não vieram como arquivo**: horizontal colorida
  ("CRM" em ouro), ícone de app (fundo borgonha em gradiente, B creme, folha ouro) e negativo
  sobre borgonha. Derivar dos SVGs recebidos só trocando `fill` para os valores do preview;
  nenhuma geometria nova.
- `docs/brand/` com os SVGs novos; `app/icon.tsx` e `app/manifest.ts` herdam de `desenho.ts`.
- Literais visíveis a trocar: `lib/email/templates/ai-budget-alarm.tsx:35` (é a única DIVIDA
  da catraca `MARCA_CONGELADA`, `tests/unit/branding.test.ts:482` — usar o nome de
  `marcaDaSaida()` e remover a entrada), `app/design/page.tsx:51,110`,
  `app/design/layout.tsx:7`, `public/llms.txt`, `Dockerfile:58`.
- **Ficam como estão** (revisado 2026-09-15), entradas PROTOCOLO/INFRA da catraca:
  `lib/agenda/google/evento.ts:60,63` (`SUFIXO_ICAL_UID`/`PREFIXO_PROPRIEDADE`) — o prefixo
  `deskcommapp` também está gravado em SQL (`google_event_id` nas migrations 0225/0226) e
  entra na reconciliação com o Google; o UID não é exibido ao usuário.
  `lib/nuvemshop/config.ts:13` (User-Agent com e-mail do autor do upstream) — só é usado com
  `NUVEMSHOP_ENABLED` (`api-client.ts:68`, `oauth.ts:72`), fora da v1; **se a Nuvemshop for
  ligada, trocar por contato da Bacco antes** (§8).
  A lista é re-medida no início da implementação com
  `grep -rIni deskcomm app components lib hooks workers public Dockerfile*`.
- `README*.md`, `VISION.md`, `package.json` (`name`, `description`) reescritos para o
  posicionamento vinho.

### 4.5 Configuração por instalação

A marca fica gravada em `platform_branding` e o `.env` (`APP_NAME`, `APP_LOGO_URL`,
`APP_ACCENT_HEX`) só **semeia** linha vazia (`lib/branding/instalacao.ts:184`). Como a marca
padrão do produto já será a Bacco, a instalação Bacco deixa essas variáveis **vazias**.

## 5. Vertical: captar clientes de vinho

### 5.1 Pacotes de funil (`lib/onboarding/pacotes-de-funil.ts`)

Os nichos são **exclusivamente** os três públicos da vinícola. `PACOTES` passa a ter só estes
três + `generico` (último recurso, `PACOTE_PADRAO`), com textos PT e ES (o ES é cobrado por
`tests/unit/i18n-espanhol-cobre-a-tela.test.ts`):

| id | comoSeApresenta | Etapas (passo) |
|---|---|---|
| `clientes_vinicola` | Vender para restaurantes, empórios e distribuidores | Novo contato (new) · Já respondi (contacted) · Entendendo o negócio dele (qualifying) · Enviei tabela/amostra (qualified) · Negociando pedido (negotiating) · Pedido fechado (won) · Não fechou (lost) |
| `enoturismo_interesse` | Enoturismo — visitas e degustações | Novo interessado (new) · Já respondi (contacted) · Tirando dúvidas (qualifying) · Quer visitar (qualified) · Combinando data (negotiating) · Encaminhado para reserva (won) · Desistiu (lost) |
| `consumidor_vinho` | Vender vinho direto ao consumidor | Novo contato (new) · Já respondi (contacted) · Entendendo o gosto (qualifying) · Indiquei rótulos (qualified) · Fechando pedido (negotiating) · Pedido pago (won) · Não comprou (lost) |

Clube de assinatura não é nicho próprio na v1 (não foi pedido); se entrar, é etapa/tag dentro
de `consumidor_vinho`.

Mudanças que acompanham, no mesmo commit:

- `lib/onboarding/sugerir-funil.ts` `PISTAS`: trocar as 5 regex de outros setores por
  pistas dos três públicos (ex.: `restaurante|emp[óo]rio|distribuidor|revend|atacad` →
  `clientes_vinicola`; `enoturism|visita|degusta[çc]|passeio|tour` → `enoturismo_interesse`;
  `consumidor|cliente final|varejo|loja virtual|e-?commerce|clube` → `consumidor_vinho`).
- `lib/onboarding/sugerir-funil.test.ts:37-52,109`: casos reescritos para os três ids.
- `tests/unit/selecao-por-pacote.test.ts`, `lib/onboarding/proposta-de-funil.test.ts`:
  conferir referências a ids removidos.
- `lib/agenda/tipos.ts:23` (comentário-espelho dos nichos) e a copy de onboarding no
  `lib/i18n/dicionario.ts`.
- Skill `deskcomm-cliente-novo` (`.claude/skills/` e `.agents/skills/`,
  `references/nichos.md`): reescrita para os três públicos da vinícola.
- Fora do escopo desta troca: `lib/mcp/tools/pacotes.ts` e `ToolPicker.tsx` usam "pacote"
  em outro sentido (pacote de ferramentas) — conferir antes, não alterar por nome.

"Encaminhado para reserva" é o **fim do papel do CRM**: a reserva acontece fora (ERP hoje,
módulo v2 depois). Nenhuma reserva é criada ou controlada no CRM.

Pacotes de outros setores (clínica, imobiliária, serviços, curso, loja) **saem** — decisão
do dono em 2026-09-15.

### 5.2 Captação

Sem código novo na v1 — usar e revisar a copy do que já existe:

- WhatsApp via **WAHA Core** (`docker-compose.prod.yml:132`) + inbox + conversa vira lead.
- Fontes de webhook de entrada, RD Station, Respondi (`lib/webhooks/`, `app/app/webhooks`).
- `POST /api/v1/lead-captures`, importação de leads por planilha.
- Plataformas de anúncio / Meta (`lib/plataformas-de-anuncio`, `app/app/ads`).

Trabalho: revisar textos/placeholders dessas telas que citam nichos de outro setor
(clínica, imobiliária, paciente) e trocar por exemplos de vinho.

### 5.3 Catálogo

`catalog_products` nativo (cadastro e planilha). Convenção documentada na tela de importação:
atributos no `nome` (ex.: "Malbec Reserva 2021 750ml"), porque a busca do agente é por trigrama
no nome. Atributos estruturados: issue (§2).

### 5.4 Agente IA padrão

`app/actions/onboarding/createDefaultAgent.ts`: prompt de atendente de adega (entende o gosto,
indica rótulos do catálogo, nunca inventa rótulo/preço/estoque fora do catálogo, encaminha
visita para reserva sem prometer data/vaga).

### 5.5 Guardrail de maioridade

Venda de bebida alcoólica a menor de 18 é proibida (Lei 13.106/2015). O upstream não tem
guardrail disso (busca por idade/álcool em `lib` e `app`: zero).

- Regra em `lib/agent-engine/guardrails/` (encadeada em `before-send.ts`): antes de oferta,
  preço ou link de compra, o contato precisa ter confirmado maioridade na conversa; sem
  confirmação, o agente pede e não oferta.
- **Texto aprovado pelo dono em 2026-09-15** (usar exatamente assim, sem paráfrase do LLM —
  a mensagem é enviada como texto fixo, não gerada):

  > Este sistema é destinado exclusivamente a pessoas maiores de 18 anos.
  >
  > Ao continuar, você declara possuir 18 anos ou mais e estar ciente de que bebidas
  > alcoólicas devem ser consumidas com responsabilidade.
  >
  > Você tem 18 anos ou mais?
  >
  > [Sim, tenho 18 anos ou mais]
  > [Não, sou menor de 18 anos]

- **Forma de resposta** (decisão 2026-09-15): o canal WAHA do upstream não envia botões,
  listas nem enquetes (zero ocorrências em `lib/waha`, `lib/channels/adapters/waha.ts`).
  As duas opções vão como texto numerado, mesmas palavras:
  `1 - Sim, tenho 18 anos ou mais` / `2 - Não, sou menor de 18 anos`.
  Aceito como resposta: `1`, `2`, ou o texto exato de uma opção (normalizado: caixa, acento,
  espaço). Qualquer outra resposta repete a pergunta; nunca é interpretada pelo LLM.
- **Resposta "Sim":** grava a confirmação no contato (resposta, data/hora, conversa, mensagem
  de origem) — é a prova da declaração — e libera o guardrail para aquele contato.
- **Resposta "Não"** (decisão 2026-09-15): envia mensagem fixa de encerramento, marca o contato
  como menor de 18, bloqueia oferta de vinho para ele **permanentemente** (agente e automações),
  move o lead para a etapa `lost` com motivo "menor de 18". A conversa segue visível ao humano.
  ⚠️ **Texto da mensagem de encerramento: pendente do dono (§8).** Sem ele, o contato é marcado
  e bloqueado, mas nada é enviado.
- Enquanto não houver resposta "Sim", o guardrail bloqueia oferta (falha fechado), nunca libera.
- **Fatos medidos no código (2026-09-15) que restringem a implementação:**
  - Motor que responde WhatsApp é `lib/agent-engine` (worker), não `lib/ai/runtime`
    (`@deprecated`, `agent.ts:1-4`). Turno: `inbound-turn.ts` `executarTurnoDoAgente` (`:1588`).
  - **`contacts.is_blocked` NÃO serve para o menor**: bloqueia também o envio humano pela inbox
    (`app/api/v1/messages/_handler.ts:378-385` → 403). Como a conversa precisa seguir com o
    humano, o menor ganha **campo próprio** — não existe hoje (`contacts` não tem
    `attributes`/`metadata`; `ai_authorized_at` da 0206 é outro conceito). ⇒ migration (tripla,
    §3.4).
  - Interceptação da resposta ANTES do LLM segue o padrão já existente de handoff/opt-out
    ambíguo (`inbound-turn.ts:2059-2125`): detectar, enviar texto fixo, `return` sem modelo.
    Envio de texto fixo pelo mesmo caminho de saída (pacing, janela, LGPD, ledger):
    padrão `avisarLeadDaEscalacao` (`lib/agent-engine/agent/aviso-de-escalacao.ts:88`).
  - Gate de envio: `Gate { name; evaluate(ctx): GateVerdict }` síncrono e puro
    (`before-send.ts:280`). Gate novo exige atualizar `ORDEM_ESPERADA` em
    `tests/unit/before-send-chain-shape.test.ts:26-45` e subir
    `BEFORE_SEND_CHAIN_VERSION` (`before-send.ts:691`, hoje 7) no mesmo commit. Posição, nome,
    trace e comportamento em follow-up/automação definidos no Plano 2.
  - Mover para perdido: `encerraDemanda` (`lib/leads/encerramento.ts:73`); o trigger
    `fn_validate_lost_reason_required` (`baseline.sql:851-878`) **recusa motivo não cadastrado**
    — "Menor de 18 anos" precisa existir em `organizations.settings.lost_reasons` de toda org
    (seed na criação da organização).
- **LGPD da declaração** (review Codex): gravar o mínimo (resposta, data/hora, conversa,
  mensagem de origem — sem data de nascimento), com `audit()`; incluir no export e na
  anonimização LGPD do contato; visível na timeline do lead; **reversível só por humano com
  papel `manager`+, auditado** (ex.: o responsável corrige um "2" digitado por engano) — o
  "permanente" do bloqueio vale para agente e automações, não impede correção humana
  auditada. Base legal e retenção: texto jurídico do dono (§8).
- Teste unitário do guardrail: sem confirmação → bloqueia; com confirmação → libera; texto
  ausente → bloqueia e registra motivo.

## 6. Infra e deploy

- **Domínio de produção:** `adega-crm.baccosistemas.com.br` (dono, 2026-09-15). Registro DNS
  `A` → IP da VPS antes do install (o kit valida DNS e emite TLS pelo Caddy, ou pelo proxy da
  Hostinger se ele ocupar 80/443). Medido em 2026-09-15: `dig +short A` →
  `2.25.222.110` (a VPS), sem AAAA; NS `*.ns.cloudflare.com`. A resposta é o IP da VPS, não da
  Cloudflare, logo o registro está **DNS-only** — manter assim até o TLS ser emitido (proxy
  laranja da Cloudflare intercepta o desafio HTTP do Caddy).
- **Supabase próprio (self-hosted)** — decisão do dono em 2026-09-15.
  - O kit do upstream **aceita** Supabase próprio mas **não o instala**
    (`.env.hostgator.example:119-127`): subir a stack Supabase oficial em Docker antes, e
    informar `SUPABASE_DB_ADMIN_URL` (conexão do dono do banco — baseline e update exigem dono).
  - Containers obrigatórios para este produto: db, auth, rest, **realtime** (inbox/kanban usam
    `postgres_changes`, `ARCHITECTURE.md`), **storage** (bucket privado `whatsapp-media`), kong.
    ⚠️ O plano antigo do vault (`projetos/bacco-crm/_root_docs/plano-supabase-selfhosted.md`)
    desligava o Realtime — **não copiar essa otimização aqui**. Studio, analytics e imgproxy
    podem ficar desligados em produção.
  - Extensões: o kit cria `vector`, `citext`, `pg_trgm` antes do baseline
    (`install.sh:1787-1789`, `update.sh:146`); `pgcrypto` é criada pelo próprio
    `baseline.sql:6171-6175`.
  - Upstream testa em pg15 (`CLAUDE.md:446`) e o kit roda `psql` do `postgres:17-alpine` como
    cliente; a versão do Postgres da stack Supabase escolhida precisa passar `pnpm test:db`
    antes do install.
- VPS com kit self-host Bacco, Supabase na mesma máquina. Mínimo do upstream **sem** Supabase
  (`docs/runbooks/waha-hostgator.md:18-21`): 2 vCPU / 4 GB / 80 GB SSD / Ubuntu 22.04 ou 24.04
  / IP fixo. **Com Supabase próprio: ≥ 4 vCPU / 8 GB / 160 GB SSD** — estimativa (plano antigo
  do vault mediu ~2,5–3 GB para Supabase enxuto sem Realtime; aqui Realtime fica ligado),
  **não medida**; confirmar com `docker stats` no primeiro install e registrar no runbook.
- **VPS atual medida em 2026-09-15** (`ssh root@2.25.222.110`, acesso por chave OK): Hostinger
  `srv1982512.hstgr.cloud`, KVM, **1 vCPU / 3,6 GB / 50 GB / CentOS Stream 10 / sem Docker /
  sem swap**, portas ocupadas só 22 e 9090 (Cockpit). **Não atende.** Decisão do dono: upgrade
  para **Hostinger KVM 2 (2 vCPU / 8 GB / 100 GB) + reinstalar Ubuntu 24.04** — piso de
  **piloto** com poucas vinícolas, abaixo da estimativa de 4 vCPU / 160 GB. Consequências:
  medir `docker stats` e disco no primeiro install; swap obrigatório; Studio/analytics/imgproxy
  do Supabase desligados; limite de sessões WhatsApp simultâneas (~150 MB cada) definido pela
  medição, não por estimativa; upgrade antes de passar desse limite.
- Backup: o `backup.sh` do kit cobre o banco do `.env`; com Supabase próprio, backup do volume
  de Storage é responsabilidade nossa — entra no runbook do vault.
- Redis + `serverless-redis-http` já na compose (Upstash é obrigatório em `lib/env.ts`).
- Chave de IA (`AI_GATEWAY_API_KEY`) opcional para subir; sem ela o agente não responde.
- Toolchain local: upstream exige Node ≥ 22 (`package.json` engines, `.nvmrc`); a máquina tem
  v20.19.0 — instalar Node 22 antes de qualquer build/teste.

## 6a. Operação SaaS e cobrança

Decisões do dono em 2026-09-15.

### Multi-tenant

- **SaaS numa instância só**, hospedada pela Bacco; cada vinícola é uma `organization` do
  upstream (RLS com teste de isolamento no CI, `organizations.status` `active/suspended/...`
  em `baseline.sql:1749`, criação por platform admin em `app/api/v1/admin/tenants`, tela
  `app/account-suspended`, painel de uso em `app/api/v1/admin/usage`). Nenhum código de
  tenancy novo na v1.
- **Marca por vinícola:** o upstream já tem marca por organização
  (`fn_definir_logo_da_organizacao`, `updateMarcaDaOrganizacao`). A marca do produto é Bacco
  Adega CRM; a vinícola pode pôr o logo dela na própria organização.
- **LGPD:** Bacco = operadora, vinícola = controladora dos dados dos contatos. Termos de uso e
  contrato de tratamento de dados são pré-requisito de onboarding de cliente — **texto jurídico
  fora do escopo desta spec, não inventar**.
- **Chave de IA:** decidir por organização — chave da Bacco (custo repassado) ou BYOK da
  vinícola (`ai_provider_credentials`, já existe). Teto de gasto por organização
  (`lib/ai/budget/check.ts`) configurado em toda organização criada.

### Cobrança

- **v1: manual.** Platform admin cria a organização, e suspende/reativa inadimplente pela tela
  de admin existente. Nenhum código de cobrança no CRM.
- ⚠️ **Suspensão do upstream é só de tela** (medido por leitura em 2026-09-15, não executado):
  `POST /api/v1/admin/tenants/:id/suspend` grava `organizations.status='suspended'`, mas o
  único efeito é o redirect de `app/app/layout.tsx:109` para `/account-suspended`.
  `fn_user_org_ids()` (`baseline.sql:788-794`) filtra só `user_organizations.revoked_at`, não o
  status da organização; nenhum ponto de `lib/agent-engine`, `workers/`, `app/api/v1/webhooks`,
  `app/api/mcp` ou `app/api/v1` (fora de admin) lê `organizations.status`. **Uma vinícola
  suspensa continua com agente respondendo WhatsApp, automações, campanhas, API e MCP.**
- Matriz que a suspensão da v1 precisa cobrir, cada linha com prova (teste ou execução):

  | Superfície | Hoje | Exigido suspensa |
  |---|---|---|
  | Login / telas `app/app` | redirect ✅ | redirect |
  | API `/api/v1/*` com cookie | responde | 403 |
  | API/MCP com token `tok_` | responde | 401/403 |
  | Webhook WAHA inbound | ingere | ingere e guarda (não perder mensagem), sem despachar agente |
  | Agente (worker `inbound_turn`) | responde | não responde |
  | Follow-up, automações, campanhas, crons | disparam | não disparam |
  | Envio humano pela inbox | envia | bloqueado (tela já redireciona) |
  | Reativação | — | tudo volta sem perda, sem reenvio em massa |

  **Decisão do dono (2026-09-15): código de enforcement na v1.** Uma checagem central de
  `organizations.status` aplicada em cada superfície da matriz, com teste por linha; mensagem
  inbound de org suspensa é guardada sem despachar agente; reativação sem perda e sem reenvio
  em massa. O redirect de tela existente continua. Plano próprio (§10).

## 10. Planos de implementação

A spec vira quatro planos independentes, cada um entregando software testável sozinho, cada
um passando por refutador (agente Claude) e `codex review` antes da aprovação do dono e de
novo sobre o código entregue:

| Plano | Escopo | Depende de |
|---|---|---|
| 1. Rebrand + vertical | §4 (paleta, fontes, marca, testes-doutrina), §5.1–§5.4 (funis, captação, catálogo, agente) | nada externo |
| 2. Maioridade | §5.5 (pergunta fixa, resposta numerada, campo próprio, gate, LGPD) | texto de encerramento do menor (§8) para o envio ao menor |
| 3. Enforcement da suspensão | §6a matriz de suspensão | nada externo |
| 4. Kit, imagens e deploy | §3 (imagens GHCR Bacco, kit sem upstream/afiliado), §6 (Supabase próprio, VPS) | VPS com Ubuntu 24.04; org/token GHCR (§8) |
- O campo `plan` (`standard/pro/enterprise`, `lib/schemas/tenant-creation.ts:14`) **é só
  rótulo**: vai para o audit (`admin/tenants/route.ts:222`) e não limita nada. Não fingir que
  limita: na v1 o plano é registrado, não imposto.
- **v1.1: integração com Bacco-Licenças** (`/home/lussandro/Bacco-Licenças`, NestJS, Asaas,
  JWT via Vault Transit). Estado medido em 2026-09-15: endpoints `POST activate` e
  `POST heartbeat` existem (`apps/server/src/modules/licenses/licenses.controller.ts:24,34`),
  módulos `subscriptions/webhooks/portal/entitlements` existem, **0 arquivos `*.spec.ts`** —
  código existe, **não validado**. O modelo atual é licença por **instalação**; o SaaS precisa
  de licença/entitlement por **organização**. **Bloqueado:** não escrever consumidor no CRM
  antes de (1) validar o Licenças rodando e (2) definir o contrato por organização
  (entitlements: usuários, números de WhatsApp, orçamento de IA; suspensão por inadimplência).
  Abre issue no Licenças; spec própria na v1.1.

## 7. Verificação (critério de pronto)

Nada é "pronto" sem ter rodado. A v1 está pronta quando houver evidência de:

1. `pnpm gov:verify`, `pnpm test:db` e `pnpm test:shell` verdes na branch `bacco`
   (`test:shell` é o único gate do kit, `CLAUDE.md:552`); fragmento em `.changes/` para mudança
   visível ao operador, conferido com `pnpm release:conferir` (`CLAUDE.md:560-565`).
   Linha de base medida na `v1.27.0` intacta antes de qualquer mudança, para separar falha
   pré-existente de regressão nossa.
2. Imagens próprias construídas e subidas pelo kit Bacco num **install limpo** na VPS.
3. Playwright nas telas login, onboarding, inbox, kanban, detalhe de lead, catálogo e
   `/admin/marca`, temas claro e escuro — screenshots em `evidence/bacco-rebrand/`.
4. `grep` de "deskcomm" em texto visível ao usuário final: zero (fora dos identificadores
   técnicos listados em §2).
5. Fluxo ponta a ponta executado na VPS: mensagem real no WhatsApp (WAHA) → lead criado no
   funil `consumidor_vinho` → agente pede maioridade antes de ofertar → move de etapa.

## 8. Pendências do dono (bloqueiam partes, não o todo)

| Pendência | Bloqueia |
|---|---|
| Texto da mensagem de encerramento para quem responde "Não, sou menor de 18 anos" | §5.5 envio ao menor |
| Upgrade da VPS para KVM 2 + reinstalação Ubuntu 24.04 (apaga a VPS atual, vazia) | §6 install |
| Termos de uso + contrato de tratamento de dados (Bacco operadora × vinícola controladora) | §6a onboarding de cliente |
| Contrato de licença por organização no Bacco-Licenças | §6a cobrança v1.1 |
| Reinstalar a VPS com Ubuntu 24.04 (hardware KVM 2 já medido, SO ainda CentOS Stream 10) | §6 install |
| GHCR da Bacco (decidido): nome da org/conta GitHub + token de leitura de pacotes para a VPS | §3.2 deploy |

Resolvidas em 2026-09-15: Supabase próprio (§6); nichos exclusivos de vinícola (§5.1);
público "exclusivo para vinícolas" (§1); fonte do corpo = Inter (§4.3); arte oficial do logo
recebida (§4.4); texto de maioridade, resposta numerada e bloqueio do menor (§5.5); SaaS
multi-tenant, cobrança manual v1 / Bacco-Licenças v1.1 (§6a); VPS KVM 2 + Ubuntu 24.04 (§6).

## 9. Vault

Criar `projetos/bacco-adega-crm/` no vault com: runbook de deploy/atualização (merge por tag,
imagens próprias, `bacco.sql` depois do baseline), decisão fork-vs-hard-fork, gotchas
(régua gerada do `globals.css`, marca gravada no banco, `update.sh` upstream apaga rebrand).
`projetos/bacco-crm/` (produto antigo) fica intocado.
