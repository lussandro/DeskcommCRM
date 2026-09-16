# Jornadas de vinícola — design

**Data:** 2026-09-15 · **Produto:** Bacco Adega CRM (fork do DeskcommCRM) · **Release alvo:** `v26.9.4` (numeração do fork: `vAA.M.P`)

**Conteúdo (anexo, parte desta spec):**
[`docs/superpowers/specs/2026-09-15-bacco-jornadas-de-vinicola-conteudo.md`](2026-09-15-bacco-jornadas-de-vinicola-conteudo.md)

## 1. Objetivo

Hoje o produto tem a cara de CRM de vinho e não o conteúdo: o onboarding aplica **um** funil de
vinícola (e o vocabulário permanece o de e-commerce), e não existe nenhuma resposta rápida, cadência,
tag, campo, motivo de perda ou tipo de agenda de vinícola. Esta entrega dá ao produto o conteúdo
operacional: **quatro jornadas** prontas — canal e revenda (B2B), enoturismo, clube de assinatura e
vendas ao consumidor —, aplicáveis por escolha da vinícola no onboarding e, depois, por uma tela
própria.

**Critério de pronto:** uma vinícola nova marca as jornadas que usa e, ao entrar no sistema, encontra
funis com etapas e vocabulário próprios, campos, motivos de perda, tags, respostas rápidas com atalho,
tipos de compromisso e cadências de follow-up em rascunho — sem digitar nada e sem nenhum dado
inventado sobre a casa dela.

## 2. Princípio que manda nesta entrega

**Não quebrar o que funciona.** O núcleo herdado do DeskcommCRM está em produção e é o valor do fork.
Em consequência:

- O conteúdo entra pelas tabelas e regras que já existem. **Nenhum gatilho de banco existente é
  alterado, nenhuma rota existente é alterada** e nenhum comportamento do núcleo é reescrito. O que
  nasce é código novo do fork, em `lib/vertical/vinicola/`.
- Nesta entrega **não há mudança de schema**, e isso foi medido nas duas peças que pareciam exigir
  uma:
  - o **ledger** de aplicação (§4.3) mora em `organizations.settings`, que é
    `jsonb not null default '{}'` sem CHECK (`supabase/baseline.sql`, DDL de `public.organizations`);
  - a **ação de auditoria nova** (§6) é só TypeScript: `api_audit_log.action` é `"text" NOT NULL` sem
    CHECK nem enum (mesmo arquivo, DDL de `public.api_audit_log` — as únicas constraints da tabela são
    a PK e duas FKs de ator). A lista fechada é a do código, `AUDIT_ACTIONS` em `lib/audit/actions.ts`.

    ```bash
    grep -n 'CONSTRAINT "api_audit_log' supabase/baseline.sql   # PK + 2 FKs, nenhum CHECK em action
    ```

  Se uma fase futura exigir coluna nova, ela sai como migration idempotente + apêndice do
  `baseline.sql` + linha no MANIFEST, declarada antes.
- Aplicar o pacote **nunca sobrescreve nem apaga** o que a organização criou; reaplicar não duplica; o
  que a vinícola apagou não volta.
- A suíte existente continua verde, incluindo os invariantes que prendem o que nasce hoje
  (`tests/invariants/quadro-do-onboarding.test.ts`, `tests/invariants/agenda-nasce-com-o-que-marcar.test.ts`).

## 3. Escopo

**Entra:** as 4 jornadas (funil, etapas, vocabulário, campos personalizados, motivos de perda, tags,
respostas rápidas, tipos de compromisso, cadências de follow-up em rascunho); a seleção múltipla no
onboarding, substituindo os três pacotes de vinícola atuais; a tela **Configurações › Jornadas** para
ativar jornada depois; e a aplicação nas organizações de QA e de produção do dono.

**Fica fora:**

| Fora | Por quê |
|---|---|
| Guardrail de maioridade (pergunta na conversa, bloqueio do agente, campo próprio no contato) | Fase própria; depende do texto de encerramento, que é decisão do dono. Aqui entram só o motivo de perda "Menor de 18 anos", o campo "Maioridade confirmada" e a tag. |
| Gatilho de follow-up "compromisso concluído" | Não existe no motor. As cadências de pós-visita usam mudança de etapa. Criar o gatilho é mexer no núcleo: fase própria, se o dono quiser. |
| Agente de IA por jornada, roteador e base de conhecimento | Dependem de WhatsApp conectado e chave de IA; fase seguinte. |
| **As perguntas frequentes do anexo** | São **material para a fase do agente / base de conhecimento**, e **não são semeadas nesta entrega**. Não há tabela de FAQ no produto: o destino delas é o prompt do agente e a base de conhecimento, que estão na linha acima. O anexo as redige agora para que a fase seguinte não recomece do zero. |
| Resolver variáveis de contato (`{{nome}}`) no envio automático de follow-up | O motor só troca `{{volta}}`/`{{voltas}}` (§4.5). Fazê-lo resolver nome é mudança no núcleo, com teste e prova próprios: fase separada, se o dono quiser. Decisão do dono: as cadências desta entrega não usam o nome. |
| Evento com lotação, ingresso e lista de participantes | A agenda é compromisso 1:1 (`calendar_appointments` tem um contato e um dono). Grupo é registrado em campo, não como vaga controlada. |
| Conteúdo em espanhol | Decisão do dono: pacote só em português. A interface segue bilíngue. |

## 4. Arquitetura

### 4.1 Definições em código

Cada jornada é um módulo de **dados puros** em `lib/vertical/vinicola/`, sem lógica: funil (nome,
vocabulário), etapas (nome, slug, se é ganho/perdido, dica de passo do agente), campos personalizados,
motivos de perda, tags, respostas rápidas (título, atalho, corpo), tipos de compromisso (categoria,
duração, local, lembrete) e cadências (gatilho, passos, condição de parada). O anexo é a fonte do
texto; o módulo é a fonte da forma.

Uma jornada é identificada por uma chave estável (`canal`, `enoturismo`, `clube`, `consumidor`), usada
na tela, no onboarding e nos testes.

### 4.2 O aplicador

**Decisão: o aplicador é um módulo novo do fork, `lib/vertical/vinicola/aplicar.ts`, e grava no banco
direto. Ele não usa `POST /api/v1/pipelines`, não usa `POST /api/v1/pipelines/:id/stages` e não usa
`updatePipelineConfig`.** Nenhuma dessas três consegue produzir o que a jornada precisa, e a medição é
esta:

| Caminho que parecia servir | O que ele faz de verdade | Onde |
|---|---|---|
| `POST /api/v1/pipelines` | aceita só `{ name, description }` e **sempre** insere `ETAPAS_INICIAIS` — Novo · Em andamento · Ganho · Perdido, com `is_won`/`is_lost` **já ocupados** | `app/api/v1/pipelines/route.ts:53-54` e `:60`; `lib/pipelines/pipeline-editing.ts:261-271` |
| `POST /api/v1/pipelines/[id]/stages` | corpo é `z.object({ name }).strict()`; slug sai de `slugDeNome`. Não aceita `slug`, `is_won`, `is_lost` nem `agent_stage_hint` | `app/api/v1/pipelines/[id]/stages/route.ts:39` |
| `updatePipelineConfig` | server action **de sessão**: exige `admin` e resolve a organização do cookie — **não aceita `organizationId`** | `app/actions/settings/updatePipelineConfig.ts:37` |

Os dois uniques parciais do schema fecham o argumento: um funil criado por essa rota já chega com a
etapa de ganho e a de perdido tomadas (`uniq_crm_stages_pipeline_won` e `uniq_crm_stages_pipeline_lost`,
`supabase/baseline.sql:2910` e `:2918`), e não há rota que as libere. A jornada precisa nomear a
própria etapa de ganho — logo, o funil não pode nascer por ali.

`aplicarJornada(organizationId, chave)` grava então **na ordem obrigatória**:

1. **Funil e etapas** — `insert` direto em `crm_pipelines` e `crm_stages`. **A tradução da definição
   para as linhas do banco é reusada, não reescrita:** `etapasParaGravar(proposta, slugDeNome)`
   (`lib/onboarding/proposta-de-funil.ts:171`) já devolve `{ nome, slug, position, is_won, is_lost,
   agent_stage_hint }` e é a mesma função que o onboarding usa hoje
   (`app/actions/onboarding/montarQuadro.ts:237`); o slug sai de `slugDeNome`
   (`lib/leads/stage-editing.ts:121`), que também resolve colisão dentro do funil com sufixo `_2`.
   Uma segunda conta de slug ou de `position` divergiria da do onboarding no primeiro ajuste — e
   `position` de 1000 em 1000 é o que o `midpoint()` do arrastar-e-soltar espera encontrar.
   **Consequência para o anexo:** os slugs lá são **informativos**, e o teste de forma compara o anexo
   contra o derivado — foi assim que se achou o único errado (`entendendo_canal`, que deriva
   `entendendo_o_canal`). `is_won`/`is_lost` saem do passo, nunca como campo próprio. Respeita os três uniques
   parciais do schema — `uniq_crm_stages_pipeline_slug` (`:2914`), `_won` (`:2918`), `_lost` (`:2910`)
   — e o `uniq_crm_stages_pipeline_hint` (`:9079`), que torna a dica de passo única por funil. Os dois
   CHECK de `agent_stage_hint` (vocabulário fechado e coerência com `is_won`/`is_lost`,
   `supabase/baseline.sql:9038` e `:9055`) são o que o teste de forma das definições prende antes de
   qualquer banco (§7).
2. **Configuração do funil** — vocabulário, campos e motivos de perda gravados **pelo mesmo módulo**,
   em `crm_pipelines.vocabulary` e `crm_pipelines.settings`, na mesma transação lógica do funil. As
   duas colunas existem com default no schema (`vocabulary jsonb not null`, `settings jsonb not null`
   com `fields`, `canonical_tags` e `lost_reasons` já dentro — DDL de `crm_pipelines` no baseline), e
   os motivos de perda moram em `crm_pipelines.settings.lost_reasons`, que é o que a validação lê
   (`organizations.settings.lost_reasons_extra`, citado na spec antiga, **não tem efeito**).
3. **Tags canônicas** — as do funil em `crm_pipelines.settings.canonical_tags` (mesmo `settings` do
   passo 2, gravado de uma vez) e as de conversa em
   `organizations.settings.canonical_conversation_tags`, que é onde o produto já as lê
   (`lib/operacao/marcadores-e-time.ts:59`, `app/api/v1/conversation-tags/route.ts:34`). A gravação
   **funde com as chaves irmãs** — nunca substitui o `settings` inteiro.
4. **Respostas rápidas** — `message_templates` com `owner_user_id = null` (compartilhado da
   organização, `supabase/baseline.sql:7587`), pois as cadências apontam para eles.
5. **Tipos de compromisso** — `insert` em `calendar_event_types` pelo mesmo módulo, com o slug da
   definição. A unique real é `calendar_event_types_org_slug_key` sobre `(organization_id, slug)`; o
   aplicador **pré-lê por slug** e trata `23505` como *já existia*. O gatilho que semeia os três tipos
   padrão **não é tocado**.
6. **Cadências** — criadas como `draft` e gravadas com os ids reais das etapas e das respostas rápidas
   desta organização.

**Qual client, e por quê.** O aplicador roda com o **admin client**
(`createAdminClient`, `lib/supabase/admin.ts`) e **filtra `organization_id` manualmente em toda
query**, com o id resolvido da sessão (tela) ou do contexto do onboarding — **nunca do body**, como
manda o CLAUDE.md. É o mesmo desenho do `montarQuadro.ts`, que já grava o quadro do onboarding assim
(`app/actions/onboarding/montarQuadro.ts:214`), e é o que permite ao aplicador atender uma organização
que não é a da sessão (§5.3) — coisa que `updatePipelineConfig` não faz.

**Papel: `admin`** (§5.2). A operação inteira tem um papel só; não há caminho em que parte do pacote
entra com `manager` e o resto falha.

**Por que a ordem é obrigatória:** um passo de cadência que aponta para um modelo inexistente só falha
no envio, em runtime; e a condição por etapa compara **id**, não nome — o motor lê
`lead_stage` do `stage_id` do lead (`lib/followup/engine.ts:770`, `lib/followup/turn-bridge.ts:295`) e
compara por igualdade em `evaluateCheck` (`lib/followup/node-handlers.ts:294-308`), então pacote com
string de etapa cairia sempre no ramo padrão, em silêncio.

### 4.3 Idempotência

Cada peça tem **chave natural**: funil por nome, etapa por slug dentro do funil, resposta rápida por
atalho, tipo de compromisso por slug, cadência por nome. O aplicador cria o que falta e deixa o que
existe como está — nunca `update`. O resultado é um relatório por peça (`criada`, `já existia`), que a
tela mostra.

**Chave natural não basta, e o motivo é medido.** Duas coisas que esta entrega promete não se
sustentam só com ela:

- **Reaplicar sem duplicar.** `message_templates` **não tem unique por `shortcut`** — o único índice da
  tabela é `idx_message_templates_org on message_templates (organization_id)`
  (`supabase/baseline.sql:7598`; DDL em `:7587`). Sem ledger, o banco não impede a segunda cópia de
  `/canal-tabela-1`; quem impediria seria uma leitura prévia, que é exatamente o que uma corrida entre
  duas abas perde.
- **"O que a vinícola apagou não volta."** Chave natural ausente **não distingue** "nunca foi criado" de
  "foi criado e a vinícola apagou". As duas leituras são idênticas no banco, e a diferença entre elas é
  a diferença entre respeitar a decisão da vinícola e desfazê-la.

**Decisão: um ledger de aplicação, sem migration.** Ele mora em
`organizations.settings`, sob a chave **`bacco_jornadas`** — coluna `jsonb not null default '{}'` sem
CHECK (DDL de `public.organizations` no baseline), gravada com **merge das chaves irmãs**, como as tags
de conversa do §4.2. Por jornada aplicada, registra:

| Campo | Para que serve |
|---|---|
| `versao_do_pacote` | de que versão do pacote saiu o que está lá |
| `aplicada_em` | carimbo ISO-8601 UTC da aplicação |
| `pecas` | as **chaves** do que foi criado (slug de etapa, atalho de resposta rápida, slug de tipo de compromisso, nome de cadência) |

A regra de reaplicação passa a ser: **só cria a peça que nunca constou no ledger.** Peça que consta no
ledger e não existe hoje no banco foi apagada pela vinícola — e não volta.

O ledger é também o que dá sentido ao estado **parcial** da tela (§5.2).

### 4.4 Estado das cadências

Nascem em **rascunho**. Motivo medido: um fluxo só entra em ação se houver **agente publicado** com
follow-up ligado e o fluxo listado nele; publicar sem isso entrega tela verde e operação parada. A tela
diz, em texto, o que falta para publicar.

### 4.5 Mensagens sem nome do contato

**Medido no código** (`lib/agent-engine/agent/followup-turn.ts:485-507`): o envio de follow-up passa
tanto o texto fixo quanto o corpo da resposta rápida por `interpolarVoltaDoPayload` (`:480`), que troca
**apenas** `{{volta}}` e `{{voltas}}`. Nenhuma das duas funções que conhecem o nome do contato tem
chamador nesse caminho:

| Função | O que resolve | Quem chama |
|---|---|---|
| `interpolateTemplate` (`lib/inbox/template-vars.ts:10`) | `{{nome}}` e `{{primeiro_nome}}`; **mantém o literal** quando não há valor | só o composer do atendimento (`components/inbox/Composer.tsx:148`) |
| `renderTemplate` (`lib/automation/template.ts`) | `{{nome}}`, `{{telefone}}`, `{{email}}` (por alias) e caminhos como `contact.name`; **troca por string vazia** quando não resolve | a prévia do operador (`lib/operacao/modelos-de-mensagem.ts:91`) e a ação de webhook (`lib/automation/actions/send-whatsapp.ts`) |

Consequência: **mensagem automática desta entrega não usa o nome do contato** — a marcação sairia
literal no celular do cliente. Os textos das cadências são escritos sem marcação.

**A marcação do pacote é `{{nome}}`, não `{{contact.name}}`.** Onde o nome aparece (respostas rápidas
do operador, que passam pelo composer), a marcação escrita é a que o composer resolve. `{{contact.name}}`
**não seria resolvida ali em hipótese alguma**: a regex de `interpolateTemplate` é
`/\{\{\s*([a-zA-Z_]+)\s*\}\}/g` e **não casa ponto** — `{{contact.name}}` não é sequer reconhecida como
marcação, e sairia literal no celular do cliente. O anexo foi corrigido em todas as ocorrências.

Cada passo de cadência **continua sendo também uma resposta rápida** do pacote, com atalho próprio, por
dois motivos que se sustentam sozinhos: o texto fica editável fora do construtor de fluxo, e o mesmo
texto serve ao operador no envio manual — onde o render existe e o nome é resolvido.

Fazer o envio de follow-up resolver variáveis de contato é mudança no núcleo e **fica fora desta
entrega** (ver §3).

## 5. Pontos de entrada

### 5.1 Onboarding

O passo do funil passa a oferecer as **quatro jornadas em seleção múltipla**, com as prováveis já
marcadas a partir do que a vinícola escreveu sobre si. O que ela marcar é aplicado na hora, pelo mesmo
aplicador.

Os três pacotes de vinícola atuais (`clientes_vinicola`, `enoturismo_interesse`, `consumidor_vinho`,
`lib/onboarding/pacotes-de-funil.ts:36`, `:52`, `:68`) **são substituídos** pelas quatro jornadas.
Organizações já instaladas não são alteradas.

**O que acontece quando a vinícola não marca nada** — a spec anterior dizia "mantém o comportamento de
hoje" ao lado de "os três pacotes são substituídos", e as duas frases não podiam valer juntas: o
comportamento de hoje **é** aplicar um dos três pacotes substituídos. A decisão, medida contra o que o
código faz:

> **Não marcar nada não aplica jornada nenhuma, e o onboarding segue com o funil que ele já monta.**

O passo do funil do onboarding não é um pacote de vinícola: ele grava a proposta pela RPC
`fn_aplicar_quadro_do_onboarding` sobre o funil que a organização **já tem**
(`app/actions/onboarding/montarQuadro.ts:232-247`), e o pacote só serve de **sugestão** quando a IA não
responde (`:148`). Com nenhuma jornada marcada, esse caminho continua inteiro, caindo no pacote
`generico` ("Outro tipo de negócio", `lib/onboarding/pacotes-de-funil.ts:84`) como sempre fez para quem
não é vinícola. Nada fica sem funil, e nada de vinícola é aplicado sem escolha.

### 5.2 Tela Configurações › Jornadas

Lista as quatro jornadas com o estado de cada uma (aplicada, não aplicada, parcial), o que cada uma
cria e o botão **Ativar jornada**.

**Os três estados, definidos pelo ledger (§4.3):**

| Estado | Definição |
|---|---|
| **não aplicada** | a jornada não consta em `organizations.settings.bacco_jornadas` |
| **aplicada** | consta no ledger e **todas** as peças que ele registra existem hoje no banco |
| **parcial** | consta no ledger e **alguma** peça registrada não existe mais hoje |

*Parcial* é, portanto, um fato sobre o que a vinícola apagou depois — e a tela diz isso com todas as
letras, junto do que falta. **Ativar jornada** sobre uma parcial não recria o que foi apagado (§4.3);
cria só o que nunca constou no ledger.

**Papel: a página é `manager+` em LEITURA; a ação de aplicar é `admin`.** São coisas diferentes e é
deliberado — mesmo desenho de `app/app/settings/tenant/pipelines/page.tsx:26-31`, onde a página é
`manager+` e `updatePipelineConfig` segue recusando quem não é `admin`: quem é gerente VÊ o que cada
jornada cria e em que estado ela está, e o botão só é desenhado para quem a ação aceitaria. Entra em
`lib/navigation/catalogo.ts` no grupo `organizacao`, seção `"Sua empresa"` — junto de *Tipos de
agendamento* (`lib/navigation/catalogo.ts:226-249`) —, com `minRole: "manager"` (é quem VÊ que decide
a porta) e sem `sidebar`, como as demais entradas desse grupo, que tem hub em Configurações.
Todo texto novo **da tela** ganha espanhol.

**O que ganha espanhol e o que não ganha.** A cerca
(`tests/unit/i18n-espanhol-cobre-a-tela.test.ts`) cobra a **interface**: rótulos, botões, estados,
mensagens de erro da tela nova. **Não** ganham tradução os dados semeados — nome de funil, nome e slug
de etapa, vocabulário, rótulo de campo, motivo de perda, título e corpo de resposta rápida, nome de
tipo de compromisso e de cadência. Isso é **conteúdo, não interface**: sai do pacote em português e vai
para o banco, e texto que veio do banco não passa por dicionário. É a decisão nº 3 do anexo (só
português) do lado do código.

### 5.3 Organizações existentes

A mesma rotina serve: como o pacote cria um funil novo, não depende do quadro estar vazio. Depois da
prova em tela, as jornadas são aplicadas **na organização de QA e na do dono**, por decisão dele.

## 6. Riscos medidos e como esta entrega os evita

| Risco | Evidência | Como evitamos |
|---|---|---|
| Alterar o gatilho que semeia os tipos de compromisso | `tests/invariants/agenda-nasce-com-o-que-marcar.test.ts` exige exatamente `consulta, reuniao, atendimento` | Tipos do pacote entram por API, por organização |
| Alterar o gatilho do funil padrão | `tests/invariants/quadro-do-onboarding.test.ts` prende 8 etapas | O pacote cria funil novo |
| Etapa duplicada de ganho ou de dica de passo | uniques `uniq_crm_stages_pipeline_won` e `uniq_crm_stages_pipeline_hint` | Teste de forma nas definições: uma de ganho, uma de perdido, dica única por funil |
| Cadência apontando para modelo inexistente | falha só no envio (`followup-turn`) | Ordem obrigatória: modelos antes das cadências |
| Condição por etapa escrita como nome | o motor compara id | O aplicador resolve ids na hora |
| Cadência publicada sem motor | gatilho `conversation_end` é recusado no publish | O pacote só usa gatilhos com motor: manual, silêncio, mudança de etapa, falta confirmada |
| Tela nova sem porta na navegação | `tests/unit/navegacao-completude.test.ts` | Entrada no catálogo com grupo e seção |
| Texto sem espanhol | `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` | Toda string nova no dicionário |
| Ação de auditoria inexistente | `lib/audit/actions.ts` é a lista fechada (`AUDIT_ACTIONS`, array do qual `AuditAction` é derivado) | Por peça, o pacote reusa as existentes — `pipeline.created` (`:307`), `pipeline.stage_created` (`:304`), `pipeline.config_updated` (`:85`), `followup_flow.created` (`:260`), `agenda.tipo_criado` (`:451`). Para a aplicação em si entra **uma ação nova**: ver abaixo |
| Tipo de compromisso repetido | `POST /api/v1/agenda/tipos` **não faz `on conflict`**: insere direto e devolve **409** ao capturar `23505` (`app/api/v1/agenda/tipos/route.ts:237` e `:243`), contra `calendar_event_types_org_slug_key` | O aplicador grava pelo módulo, pré-lendo por slug, e trata `23505` como *já existia* (§4.2) |
| Contagens de e2e mudando | `tests/e2e/followup-builder.spec.ts` conta arestas | O pacote não altera o fluxo de demonstração |

### 6.1 A ação de auditoria nova

**Decisão: entra uma ação nova em `lib/audit/actions.ts`, `vertical.jornada_aplicada`** — acrescentada
**no fim** do array `AUDIT_ACTIONS`, como o cabeçalho do arquivo manda ("Acrescente código novo no fim;
nunca renomeie"). Não há prefixo `vertical.` no arquivo hoje; este é o primeiro.

A versão anterior desta spec afirmava que nenhuma ação nova era necessária, e isso estava errado por
uma razão simples: as ações existentes registram **peça por peça** — um funil criado, uma cadência
criada, um tipo de compromisso criado —, e nenhuma delas registra **que uma jornada foi aplicada**. Sem
a linha da aplicação, a auditoria mostra dez criações avulsas e não responde quem ativou *Enoturismo*,
quando, em que versão do pacote, nem se o resultado foi completo ou parcial. É o mesmo modo de falha
que o cabeçalho de `AUDIT_ACTIONS` descreve: a ausência lê-se como "isso não acontece".

O `metadata` carrega a chave da jornada, a versão do pacote e o relatório por peça (§4.3) — os mesmos
dados que entram no ledger, que é o que permite reconciliar auditoria e ledger depois.

**Não custa migration:** `api_audit_log.action` é `text` sem CHECK (§2).

O painel de auditoria recebe a ação **sem ninguém mexer nele**: a lista da tela é derivada de
`AUDIT_ACTIONS`, e `tests/unit/audit-lista-do-painel-e-derivada.test.tsx` reprova quem reintroduzir a
cópia manual.

## 7. Testes

- **Forma das definições:** slugs válidos **e iguais ao que `slugDeNome` deriva do nome**; uma etapa de
  ganho e uma de perdido por jornada; atalho de resposta rápida único em todo o pacote; grafo de cada
  cadência válido pelas regras de publicação do motor; contagens por jornada iguais às do inventário do
  anexo.
- **As quatro jornadas passam em `lib/onboarding/proposta-de-funil.test.ts`** — é o gate que os pacotes
  de funil já têm, e os novos entram nele. São quatro exigências, todas medidas:

  | Exigência | Régua | Onde |
  |---|---|---|
  | aceito pelo próprio validador | `validarProposta` — nome, ≥4 etapas, uma `won`, uma `lost` | `lib/onboarding/proposta-de-funil.test.ts:34-42` |
  | **cobertura 5/5** | `cobertura.faltando === []` e `traduzidos === 5`, sobre `PASSOS_QUE_PRECISAM_DE_ETAPA` (`lib/leads/agent-mapping.ts:261`) | `:43-57` |
  | sem jargão de manual de vendas | `/\b(MQL\|SQL\|lead scoring\|prospec\|funil de topo\|fundo de funil\|nutri)\w*/i` sobre o nome de cada etapa | `:61-69` |
  | tamanho | `MIN_ETAPAS = 4`, `MAX_ETAPAS = 8` (`lib/onboarding/proposta-de-funil.ts:52-53`) | validador |

  **Duas consequências de conteúdo saíram daí, e estão no anexo:** o clube ganhou a etapa *Plano
  escolhido* (`qualified`) — com 6 etapas ele deixava `qualified` sem destino e **reprovaria** —, e o
  canal fica **no teto de 8**, com `amostra_ou_degustacao` sem dica, que é estado válido
  (`EtapaProposta.passo` é `LeadStage | null`, `lib/onboarding/proposta-de-funil.ts:32-38`) e não tira
  a cobertura de 5/5, porque `coberturaDoFunil` só conta as dicas presentes
  (`lib/leads/agent-mapping.ts:295-301`). Nenhum nome de etapa do pacote casa o regex de jargão —
  conferido sobre as 29 etapas.
- **Aplicador:** aplica em organização vazia; reaplica sem duplicar; não sobrescreve item editado; não
  recria item apagado; respeita a ordem (cadência só depois do modelo); devolve relatório por peça.
- **Tela e onboarding:** estado parcial aparece; ativar jornada cria o que falta; **papel abaixo de
  `admin` não vê a ação** (§5.2).
- **Ledger:** aplicar grava `bacco_jornadas` fundindo com as chaves irmãs de
  `organizations.settings`; peça apagada depois não é recriada na reaplicação; jornada com peça
  ausente lê como *parcial*.
- **Existente:** `pnpm test:unit`, `pnpm test:db` e `pnpm lint` verdes, sem afrouxar nenhum invariante.

**Um teste existente é reescrito, e a spec não finge o contrário.** Substituir os três pacotes de
vinícola (§5.1) **reprova `lib/onboarding/sugerir-funil.test.ts`**: o arquivo casa o texto do dono
contra os ids antigos em **13 casos de tabela**, mais uma asserção direta na linha 118 — todas com
`clientes_vinicola`, `enoturismo_interesse` e `consumidor_vinho`, que deixam de existir.

```bash
grep -c 'clientes_vinicola\|enoturismo_interesse\|consumidor_vinho' lib/onboarding/sugerir-funil.test.ts
```

O teste é **reescrito para as quatro jornadas**, preservando o que ele realmente vigia e que continua
valendo: que o texto digitado no celular (sem acento, em maiúscula, no plural) chegue à jornada certa, e
que o desconhecido caia no `generico` em vez de cair em nada (`lib/onboarding/sugerir-funil.test.ts:57`).
O que muda são os ids esperados; o que não muda é a régua. Prometer "suíte intocada" aqui seria
prometer o impossível — e descobrir isso no CI, depois do plano aprovado.

## 8. Prova em tela (na VPS, como sempre)

**A prova em tela acontece ANTES de a release ser declarada pronta** — numa candidata (o topo da
`main`, que o `publish-image` publica como tag `main`), não depois de cortar a tag. É o que a doutrina
de QA Visual exige: a experiência de quem instala É o produto, e uma tag cortada antes da prova
transforma "achado" em "release nova". Só com a prova verde e o ok do dono é que a `v26.9.4` é cortada.

O que se prova, depois do deploy da candidata: aplicar uma jornada pela tela nova e capturar, nos dois
temas, o funil no quadro, a resposta rápida no atendimento, o tipo de compromisso na agenda e a
cadência em rascunho. Evidência em `evidence/bacco-jornadas/`, com revisão citando cada captura. Falha
de medida vira causa raiz e nova candidata, nunca expectativa afrouxada.

## 9. Entrega

**Uma release só** (`v26.9.4`), com as quatro fases internas na ordem: definições e aplicador →
onboarding → tela → cadências. Plano único, executado por subagentes, com refutador e Codex antes de
aprovar o plano e a entrega.

**Fragmento de release.** A entrega muda o que quem opera uma VPS vê — tela nova, jornadas aplicáveis,
os três pacotes de vinícola substituídos —, então ela traz o seu fragmento em `.changes/`, como manda
[`docs/doctrine/versionamento.md`](../../doctrine/versionamento.md) e o item 17 da Definition of Done.
Impacto: **`capacidade_nova`** — a instalação existente não precisa fazer nada, e ganha a tela e as
jornadas. O fragmento declara o efeito no operador, **nunca o número da versão**, que sai do conjunto:

```yaml
---
impacto: capacidade_nova
secao: adicionado
titulo: Quatro jornadas de vinícola prontas para aplicar
---
```

Confira com `pnpm release:conferir`.

## 10. Decisões do dono registradas

| Decisão | Valor |
|---|---|
| Jornadas | as quatro, desde o primeiro dia |
| Como nascem | a vinícola marca no onboarding; ativa as outras depois |
| Autoria do conteúdo | eu redijo, o dono revisa; dado da vinícola nunca é inventado |
| Primeira entrega | base + cadências de follow-up |
| Abordagem | pacote em código + tela Jornadas |
| Cadências | nascem em rascunho |
| Funis atuais | os três são substituídos |
| Gatilho de agenda | fica na mudança de etapa; sem feature nova |
| Mesmo contato | pode ter negócio em vários funis |
| Idioma | só português |
| Etapas do B2B | mantém as oito |
| Mensagens | cada passo de cadência é também uma resposta rápida (texto editável e útil no envio manual) |
| Nome do contato em cadência | não usar: o motor não resolve a marcação (§4.5); render no follow-up fica fora desta entrega |
| Marcação de nome nas respostas rápidas | `{{nome}}` — é o que o composer resolve; `{{contact.name}}` nem é reconhecida como marcação (§4.5) |
| Aplicador | módulo novo do fork, gravando o banco direto — as rotas de funil/etapa e a action de configuração não conseguem semear a jornada (§4.2) |
| Papel do aplicador e da tela | `admin`, um só para a operação inteira |
| Reaplicar sem duplicar, e não ressuscitar o que foi apagado | ledger em `organizations.settings.bacco_jornadas`, sem migration (§4.3) |
| Auditoria da aplicação | ação nova `vertical.jornada_aplicada`, além das por peça (§6.1) |
| Recompra do consumidor | gatilho **manual**, como a recompra do canal — silêncio de 60 dias não existe no motor (teto de 7 dias) |
| Véspera da visita | **lembrete do tipo de compromisso**, não passo de cadência — não há espera relativa à data do compromisso |
| Perguntas frequentes | material da fase do agente; **não** são semeadas nesta entrega (§3) |
| Etapas por jornada | mínimo 7 — as 5 dicas não-terminais são obrigatórias pelo gate de cobertura. O clube ganhou *Plano escolhido*; o canal fica no teto de 8, com uma etapa sem dica |
| Slug de etapa | derivado por `slugDeNome` via `etapasParaGravar`, reusando o que o onboarding já faz; o slug do anexo é informativo |
| Lembrete do tipo de compromisso | o pacote grava a antecedência sugerida e **não liga** o lembrete — `reminder_enabled` nasce falso, e quem liga é a vinícola |
| Condição por etapa em cadência | nó `condition` com `lead_stage` e o **id** da etapa — `segments` do gatilho de silêncio casa tags, não etapas |
| Aplicação | em QA e na organização do dono |
| Entrega | uma release só |

## 11. Pendências do dono (não bloqueiam esta entrega)

- Texto de encerramento para quem se declara menor de 18 anos, e se o bloqueio é permanente ou
  reavaliado — bloqueia a fase do guardrail.
- Se o gatilho "compromisso concluído" deve virar feature do motor.
