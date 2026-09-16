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

- O conteúdo entra pelas tabelas, rotas e regras que já existem. Nenhum gatilho de banco existente é
  alterado; nenhum comportamento do núcleo é reescrito.
- Nesta entrega **não há mudança de schema**. Se uma fase futura exigir coluna nova, ela sai como
  migration idempotente + apêndice do `baseline.sql` + linha no MANIFEST, declarada antes.
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

Uma função `aplicarJornada(organizationId, chave)` grava o conteúdo **na ordem obrigatória**, que sai
das dependências reais do produto:

1. **Funil e etapas** — `POST /api/v1/pipelines` cria o funil com as etapas iniciais e
   `POST /api/v1/pipelines/:id/stages` acrescenta as demais. Nenhuma das duas exige funil vazio, e a
   RPC do onboarding (que exige) **não** é usada aqui.
2. **Configuração do funil** — vocabulário, campos e motivos de perda, por `updatePipelineConfig`.
   Os motivos de perda moram em `crm_pipelines.settings.lost_reasons`: é o que a validação do banco lê
   (`organizations.settings.lost_reasons_extra`, citado na spec antiga, **não tem efeito**).
3. **Tags canônicas** do funil e da conversa.
4. **Respostas rápidas** — `message_templates` compartilhados (sem dono), pois as cadências apontam
   para eles.
5. **Tipos de compromisso** — `POST /api/v1/agenda/tipos`, com `on conflict` natural por slug. O
   gatilho que semeia os três tipos padrão **não é tocado**.
6. **Cadências** — criadas como `draft` e gravadas com os ids reais das etapas e das respostas rápidas
   desta organização.

**Por que a ordem é obrigatória:** um passo de cadência que aponta para um modelo inexistente só falha
no envio, em runtime; e condição por etapa compara **id**, não nome — pacote com string de etapa cairia
sempre no ramo padrão, em silêncio.

### 4.3 Idempotência

Cada peça tem **chave natural**: funil por nome, etapa por slug dentro do funil, resposta rápida por
atalho, tipo de compromisso por slug, cadência por nome. O aplicador cria o que falta e deixa o que
existe como está — nunca `update`. O resultado é um relatório por peça (`criada`, `já existia`), que a
tela mostra.

### 4.4 Estado das cadências

Nascem em **rascunho**. Motivo medido: um fluxo só entra em ação se houver **agente publicado** com
follow-up ligado e o fluxo listado nele; publicar sem isso entrega tela verde e operação parada. A tela
diz, em texto, o que falta para publicar.

### 4.5 Mensagens sem nome do contato

**Medido no código** (`lib/agent-engine/agent/followup-turn.ts:480-508`): o envio de follow-up passa
tanto o texto fixo quanto o corpo da resposta rápida por `interpolarVoltaDoPayload`, que troca
**apenas** `{{volta}}` e `{{voltas}}`. O `renderTemplate` que resolve `{{contact.name}}`, `{{nome}}`,
`{{telefone}}` e `{{email}}` (`lib/automation/template.ts`) **não tem chamador no caminho de
follow-up** — seus consumidores são a prévia do operador (`lib/operacao/modelos-de-mensagem.ts`) e a
ação de webhook (`lib/automation/actions/send-whatsapp.ts`).

Consequência: **mensagem automática desta entrega não usa o nome do contato** — a marcação sairia
literal no celular do cliente. Os textos das cadências são escritos sem marcação.

Cada passo de cadência **continua sendo também uma resposta rápida** do pacote, com atalho próprio, por
dois motivos que se sustentam sozinhos: o texto fica editável fora do construtor de fluxo, e o mesmo
texto serve ao operador no envio manual — onde o render existe e o nome é resolvido.

Fazer o envio de follow-up resolver variáveis de contato é mudança no núcleo e **fica fora desta
entrega** (ver §3).

## 5. Pontos de entrada

### 5.1 Onboarding

O passo do funil passa a oferecer as **quatro jornadas em seleção múltipla**, com as prováveis já
marcadas a partir do que a vinícola escreveu sobre si. O que ela marcar é aplicado na hora, pelo mesmo
aplicador. Não marcar nada mantém o comportamento de hoje.

Os três pacotes atuais (`clientes_vinicola`, `enoturismo_interesse`, `consumidor_vinho`) **são
substituídos** pelas quatro jornadas. Organizações já instaladas não são alteradas.

### 5.2 Tela Configurações › Jornadas

Lista as quatro jornadas com o estado de cada uma (aplicada, não aplicada, parcial), o que cada uma
cria e o botão **Ativar jornada**. Papel mínimo: gerente. Entra em `lib/navigation/catalogo.ts` com
grupo e seção, como o CI exige, e todo texto novo ganha espanhol.

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
| Ação de auditoria inexistente | `lib/audit/actions.ts` é a lista fechada | Ações do pacote reusam as existentes (`pipeline.created`, `followup_flow.created`, `agenda.tipo_criado`) |
| Contagens de e2e mudando | `tests/e2e/followup-builder.spec.ts` conta arestas | O pacote não altera o fluxo de demonstração |

## 7. Testes

- **Forma das definições:** slugs válidos; uma etapa de ganho e uma de perdido por jornada; atalho de
  resposta rápida único em todo o pacote; grafo de cada cadência válido pelas regras de publicação do
  motor; contagens por jornada iguais às do inventário do anexo.
- **Aplicador:** aplica em organização vazia; reaplica sem duplicar; não sobrescreve item editado; não
  recria item apagado; respeita a ordem (cadência só depois do modelo); devolve relatório por peça.
- **Tela e onboarding:** estado parcial aparece; ativar jornada cria o que falta; papel abaixo de
  gerente não vê a ação.
- **Existente:** `pnpm test:unit`, `pnpm test:db` e `pnpm lint` verdes, sem afrouxar nenhum invariante.

## 8. Prova em tela (na VPS, como sempre)

Depois do deploy: aplicar uma jornada pela tela nova e capturar, nos dois temas, o funil no quadro, a
resposta rápida no atendimento, o tipo de compromisso na agenda e a cadência em rascunho. Evidência em
`evidence/bacco-jornadas/`, com revisão citando cada captura. Falha de medida vira causa raiz e nova
release, nunca expectativa afrouxada.

## 9. Entrega

**Uma release só** (`v26.9.4`), com as quatro fases internas na ordem: definições e aplicador →
onboarding → tela → cadências. Plano único, executado por subagentes, com refutador e Codex antes de
aprovar o plano e a entrega.

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
| Aplicação | em QA e na organização do dono |
| Entrega | uma release só |

## 11. Pendências do dono (não bloqueiam esta entrega)

- Texto de encerramento para quem se declara menor de 18 anos, e se o bloqueio é permanente ou
  reavaliado — bloqueia a fase do guardrail.
- Se o gatilho "compromisso concluído" deve virar feature do motor.
