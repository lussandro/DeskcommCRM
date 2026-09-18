# Campanha de prospecção ativa — desenho

**Estado:** proposta (18/09/2026). Pedida pelo dono para prospectar vinícolas; decisões dele
registradas no §Decisões. Nada implementado ainda.

## O que existe hoje, medido

Não existe campanha no produto: zero tabela `campaign*`, zero rota, zero tela. "Campanha" no
código é atribuição de anúncio **inbound** (`lib/ai/elegibilidade/campanha.ts`) — o caminho
contrário do que se quer aqui.

O que **é** reusável e não deve ser reinventado:

| Peça | Onde | Serve para |
|---|---|---|
| Ritmo (throttle 1,2s + jitter 800ms + janela + warm-up) | `lib/agent-engine/pacing/` | decidir SE e QUANDO cada mensagem sai |
| Contador real de envios | `pacing_ledger` (`pacing/store.ts:112`) | cap diário por número que funciona |
| Serialização por número | `pg_advisory_xact_lock(hashtext(session))` em `guardrails/before-send.ts` | dois processos não furarem o ritmo |
| Cadeia de vetos | `BEFORE_SEND_GATES` | opt-out, LGPD, anti-ban, janela, spinning |
| Envio | `sendMessageHandler` (`app/api/v1/messages/_handler.ts`) | a linha em `messages` e o adapter do canal |
| Opt-out | `lib/opt-out/deteccao.ts` + `is_blocked` | quem não pode receber |
| Import CSV | `lib/leads/planilha.ts`, `CSV_MAX_DATA_ROWS = 500` | entrada da lista |
| Entregue/lido | `messages.delivered_at/read_at` via ACK do WAHA (`lib/waha/ingest.ts:925`) | relatório |

## Os três achados que mandam no desenho

### 1. A cerca de LGPD já existe — e está desarmada

`lib/agent-engine/guardrails/lgpd/legal-basis.ts` veta o **primeiro toque de prospecção** sem
`consent.marketing.granted_at` ou `consent.legitimate_interest.ref` (LIA). O gate está na
cadeia (`before-send.ts:364`), mas `isProspecting` é cravado `false` em
`edge/crm/get-lead-context.ts:249` e `agent/preview.ts:259` — "o MVP é inbound".

**Campanha é o primeiro caso que precisa passar `true`.** E a regra escrita diz que origem
`import` sem prova é base legal **inválida**. Portanto: ou a campanha registra LIA (interesse
legítimo, com finalidade e como opor-se), ou o próprio produto a barra — corretamente.

Isto não é obstáculo a contornar: é a única coisa que separa prospecção de spam, e é o que
protege o número de ser denunciado.

### 2. Campanha não anda sobre follow-up

`idx_followup_enrollments_one_live` é único por `(organization_id, contact_id)` — não por
fluxo. Quem já está em qualquer follow-up vivo recebe 409 (`enroll.ts:145`). Numa lista de 518,
a campanha perderia destinatários **em silêncio**.

Campanha tem fila própria, não matrícula em fluxo.

### 3. O envio canônico não tem ritmo

`sendMessageHandler` não consulta `decidePacing`. Quem consulta é a automação, por um espelho
(`lib/automation/janela-do-canal.ts`) mais um `Map` de módulo (`throttle.ts:98`) que não
sobrevive a restart nem a dois processos. E `checkDailyLimit` lê `channel_session_warmup`,
**tabela sem escritor** (`throttle.ts:53`): o cap diário da automação nunca dispara.

A campanha usa o caminho do motor do agente — `pacing_ledger` + advisory lock —, nunca o
espelho.

## Decisões do dono (18/09/2026)

1. **Campanha vira feature do produto** (não ferramenta externa, não disparo fora do CRM).
2. **Dois públicos, em ordem**: teste pequeno na lista atual enquanto se monta o público de
   vinícola de verdade.

## A lista atual, medida na fonte (18/09/2026)

`leads` do Supabase do dono, filtro `whatsapp_confirmado=true` + `status≠nao_qualificado`:
**518 leads**, e **100% CNAE 0132 (cultivo de uva)**. Nenhum dos 2 registros de fabricação de
vinho (1112) está entre os confirmados.

- DDD: 15 (135), 19 (105), 11 (69), 17 (53), 87 (46), 54 (10).
- **396 já têm a tag `campanha-reforma-2027`** — essa lista já foi abordada antes.
- **197 com `email_contador`**: o telefone da Receita é do escritório contábil, não do produtor.

**Consequência para a cópia:** abrir com "ERP para vinícola" denuncia lista comprada e queima os
518. O primeiro toque **qualifica** ("vocês vinificam ou vendem a uva?") e só aprofunda com quem
responde que vinifica.

## O desenho

### Fase 1 — o mínimo que permite disparar com segurança

**Schema** (migration + apêndice no baseline + MANIFEST):

- `campaigns`: `id, organization_id, name, channel_session_id (not null), status
  (draft|running|paused|done|cancelled), template_body, base_legal (consent|legitimate_interest),
  lia_ref, created_by, started_at, finished_at`.
  O `channel_session_id` é obrigatório — campanha fala por **um** número, como funil (`0262`)
  e cobrança (esta semana).
- `campaign_recipients`: `id, organization_id, campaign_id, contact_id, status
  (pending|sent|failed|skipped), skip_reason, message_id, scheduled_for, sent_at`,
  `unique (campaign_id, contact_id)`.

**Fila e ritmo**: um cron (`app/api/v1/cron/campaign-worker`) que, por rodada:

1. pega a campanha `running` mais antiga;
2. abre `pg_advisory_xact_lock(hashtext(channel_session_id))` — o mesmo lock do agente, para
   campanha e agente não furarem o ritmo um do outro;
3. chama `decidePacing` com os knobs reais e o `pacing_ledger`; fora da janela ou estourado o
   cap, **não envia e não marca nada** (a rodada vazia não audita — regra do `CLAUDE.md`);
4. envia **um** destinatário por rodada permitida, grava `recordSend`, marca o destinatário.

Nada de "disparar 518". O ritmo é o produto: 1 msg a cada 5s em campanha, janela do canal,
warm-up respeitado.

**Vetos por destinatário**, antes de enviar, reusando o que existe: `is_blocked` (opt-out),
anonimizado (LGPD), sem telefone, consentimento recusado, e **base legal** — com
`isProspecting: true`, que é o primeiro uso real do gate.

**Relatório**: `campaign_recipients` + join em `messages` dá enviado/entregue/lido; respondido
sai de `conversations.last_inbound_at` posterior ao envio.

**Tela**: lista de campanhas, criação (nome, número, texto, base legal, audiência), e a régua
viva — quantos pendentes, enviados, entregues, lidos, respondidos, pulados e por quê.

### Fase 2 — audiência e personalização

- Seleção de audiência por filtro (tags, origem, DDD) em vez de lista colada.
- Import acima de 500 linhas (hoje `CSV_MAX_DATA_ROWS`) — em lotes, não aumentando o limite.
- Variáveis além de `{{nome}}` (o interpolador conhece 2): região, empresa.
- Spinning de cópia por destinatário (o motor já tem `lib/agent-engine/spinning/`).

### O que NÃO entra

- **Aumentar o limite do CSV** para caber 518 de uma vez: o limite é cerca de memória e de
  erro humano. A lista entra em dois lotes.
- **Bypass do índice de follow-up**: campanha não matricula em fluxo.
- **Escrever `consent.marketing.granted_at` para a lista importada**: seria inventar
  consentimento que ninguém deu — Regra nº 1. Para lista fria, o caminho é LIA registrada.

## O piloto (o que se faz primeiro, e pequeno)

1. Campanha no número **do Bacco** (2220), não no da ChatCore.
2. Audiência: **30 contatos** do DDD com maior massa (15), sem a tag `email_contador` e sem a
   tag `campanha-reforma-2027` — para não repetir abordagem.
3. Cópia de primeiro toque que **qualifica**, não vende: pergunta se vinificam ou vendem a uva.
4. Mede: respondidos, quantos vinificam, quantos pedem para parar. Só depois disso se fala em
   volume.

## Prova exigida antes de "pronto"

1. Campanha com 3 destinatários, um deles `is_blocked` → o bloqueado sai como `skipped` com
   motivo, e não recebe nada.
2. Fora da janela do canal → nenhuma mensagem sai, e a rodada **não** grava auditoria.
3. Sem base legal → campanha nem inicia (a tela recusa), e o gate veta se alguém forçar.
4. Duas rodadas concorrentes do cron não furam o ritmo (o lock segura) — medido no
   `pacing_ledger`.
5. Prova em tela, em ambiente fresco, com envio real para número de teste do dono.
