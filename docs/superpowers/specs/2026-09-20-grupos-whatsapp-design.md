# Grupos de WhatsApp — administração, moderação e atendimento

> Design aprovado em 2026-09-20. Abordagem **B** (subsistema paralelo).
> Toda afirmação sobre a API do WAHA nesta spec foi **medida** contra a
> instalação real (VPS `2.25.222.110`, WAHA `2026.7.2` NOWEB, sessão
> `org_f4bbc2c7_1335…`, número 554891972220) em 2026-09-20. Evidência crua dos
> webhooks em `.superpowers-capturas-grupo.jsonl` (6 eventos).

---

## 1. Problema

Hoje mensagem de grupo **não existe** para o CRM, em três camadas:

| Camada | Onde | O que faz |
|---|---|---|
| WAHA | `lib/waha/client.ts:54` (`CONVERSAS_IGNORADAS.groups: true`) | não processa nem armazena |
| Ingest | `lib/waha/ingest.ts:194,556,757` | `@g.us` → `return` seco |
| IA | `lib/ai/dispatcher/triggers.ts:87` | `ignore_groups` default `true` |

E a coluna `conversations.is_group` (baseline linha 1380) é **lida** em dezenas
de funções SQL (`not is_group`) e **escrita por ninguém** — gate preparado para
um grupo que nunca entra.

Quem opera uma comunidade no WhatsApp precisa: ver os grupos, ver os membros,
moderar quem infringe regra, e converter quem demonstra interesse — sem que 500
espectadores virem 500 leads.

## 2. Decisões travadas (do brainstorming)

| Decisão | Escolha |
|---|---|
| Núcleo | moderação + atendimento; **fatia 1 = moderação** |
| Autoridade | **por grupo**: `vigiado` / `semi` / `autonomo`. Default = `vigiado` |
| Painel manual | **pilar**, não fatia 2. Todo ato da IA reversível por ele |
| Identidade | tabela própria, `contact_id` **nullable** |
| Regras | determinístico primeiro; IA só no resíduo |
| Funil | grupo **fora**. Lead nasce no privado, origem `grupo:<id>` |
| Histórico | tabela própria, retenção curta configurável |
| Escala | projetar para os dois casos, sem otimizar antes de medir |

## 3. O que foi medido (e onde o CLAUDE.md está errado)

### 3.1 O autor da mensagem de grupo

Payload real de `message.any` num grupo:

```
from        = "120363414984201825@g.us"    ← o GRUPO
participant = "224253161005092@lid"         ← o AUTOR, no TOPO
_data.key.participant    = "224253161005092@lid"
_data.key.participantAlt = "554891286399@s.whatsapp.net"   ← telefone
_data.pushName           = "Lussa"
```

**`p.author` NÃO EXISTE.** A linha do CLAUDE.md ("Grupos: … Sender é `p.author`,
não `p.from`") é vocabulário de `whatsapp-web.js` (engine WEBJS) e está errada
para NOWEB, que é o engine do kit. O campo certo é **`participant`, no topo** —
não é preciso descer em `_data`, que é superfície Baileys sem contrato.

Nota: `author` aparece, sim, em `group.v2.join._data.author` e
`group.v2.participants._data.author` — mas ali significa *quem executou a ação
no grupo*, não quem mandou mensagem. Nome igual, sentido diferente.

**Ação:** corrigir a linha do CLAUDE.md no mesmo PR (item 16 da DoD).

### 3.2 Resposta de ação NUNCA é prova

`POST /groups` com um participante devolveu **`201`** listando 2 membros.
`participants/v2` logo depois devolveu **1**. O membro nunca entrou.

As quatro rotas que a doc do WAHA não documenta devolvem **`200` sempre**, com o
veredito real num array por participante:

```json
[{"status":"451","jid":"5548991286399@s.whatsapp.net",
  "content":{"tag":"participant","attrs":{"error":"451"}}}]
```

| Código | Significado medido |
|---|---|
| `451` | JID inválido / inexistente |
| `404` | alvo não é membro do grupo |
| `200` | sucesso (por participante) |

Sucesso parcial é por linha: `remove` de 10 devolve 10 status. **Ler
`response.ok` é inútil.**

### 3.3 Settings funcionam, corpo vazio

`PUT .../settings/security/{messages-admin-only,info-admin-only,member-add-mode}`
→ `200` com corpo **vazio**. Efeito confirmado relendo o metadata:
`announce=true`, `restrict=true`, `memberAddMode=false`.

### 3.4 Membros vêm por evento, não por polling

`group.v2.participants` é pobre (`{id, role}` + `_data.action`). Mas o
`group.v2.update` disparado junto traz **a lista inteira com `pn` e papel** — e
para todos os grupos da sessão. É a fonte de verdade para manter a tabela em dia.

A doc avisa `rate-overlimit` em `/groups/refresh`; polling em centenas de grupos
fura isso. **Polling não entra no desenho.**

### 3.5 Correções ao relatório de pesquisa

- `creation`, `owner`, `ownerPn` **vêm** no payload (o relatório dizia "trate
  como ausente")
- `phoneNumber`/`pn` vem resolvido ao lado de cada `@lid` já na **2026.7.2** —
  o `participant.pn` da 2026.8.2 é menos necessário do que parecia
- `GET /groups` funciona **sem** `WHATSAPP_STORE_ENABLED` e **com**
  `ignore.groups=true` (o `ignore` corta evento/armazenamento, não a API de leitura)

### 3.6 O que a 2026.7.2 não tem

Medido nas duas tags (`404` na 7.2, `422` na 8.2 — rota existe):

- `GET /groups/{id}/participants/join-requests`
- `PUT /groups/{id}/settings/security/membership-approval`
- `POST .../join-requests/approve` e `/reject`

Bump para `latest-2026.8.2` confirmado sem regressão: todas as rotas que já
funcionavam continuam existindo.

## 4. Arquitetura

### 4.1 Por que subsistema paralelo (B), e não `is_group=true` (A)

A alternativa A (acordar `conversations.is_group`) tem o menor diff, mas coloca
grupo **dentro** da máquina que produz funil para depois barrá-lo em N lugares —
cada um dos `not is_group` espalhados pelas funções SQL vira uma decisão a
revisitar (atribuição, presença, follow-up, SLA, demanda, Central). E não
responde `contact_id` de quem, num grupo de 500.

Em B a doutrina "grupo fora do funil" vira **estrutura**, não sequência de `if`.
`conversations` não é tocada; `is_group` continua morta e ganha comentário
dizendo por quê.

Descartada também a híbrida C (mensagem em `messages` com `conversation_id`
nulo): `messages` é a tabela mais quente do sistema e sua RLS assume conversa;
tornar a coluna nulável é mudança de contrato em algo que já roda.

### 4.2 O que é reusado (não se reinventa)

| Peça existente | Uso |
|---|---|
| `event_log` + worker com claim CAS (`lib/routing/worker.ts`) | toda ação de grupo é assíncrona; **trigger nunca faz HTTP** |
| `agent_inbox_items` (Central) | modo `semi` abre pendência de aprovação |
| `api_audit_log` | toda mutação, com a regra "cron audita só quando houve efeito" |
| RLS `tenant_isolation_*` + `fn_user_org_ids()` | isolamento por `organization_id` |
| `lib/retencao/politica.ts` | constantes de retenção seguem o padrão `_PADRAO`/`_PISO` |
| `lib/ai/dispatcher` | o agente de grupo é mais um consumidor, não um runtime novo |
| `lib/navigation/catalogo.ts` | as telas novas declaram porta (DoD item 14) |

## 5. Schema

Migrations `0269`–`0272` (próximo `NNNN` após `0268`, medido), cada uma com
apêndice idempotente em `supabase/baseline.sql` e linha no `MANIFEST.md`.

### 5.1 `whatsapp_groups`

```sql
create table if not exists public.whatsapp_groups (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  wa_group_id text not null,                      -- 1203…@g.us
  subject text,
  description text,
  owner_lid text,                                 -- medido: vem em `owner`
  owner_pn text,                                  -- medido: vem em `ownerPn`
  created_at_wa timestamptz,                      -- medido: vem em `creation`
  size int,
  announce boolean default false,                 -- só admin fala
  restrict boolean default false,                 -- só admin edita info
  member_add_mode boolean default true,
  join_approval_mode boolean default false,
  somos_admin boolean default false,              -- derivado de participants/v2
  modo text not null default 'vigiado'
    check (modo in ('vigiado','semi','autonomo')),
  agent_id uuid references agents(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,    -- regras, tetos, janela
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel_session_id, wa_group_id)
);
```

`modo` é `text` + CHECK, não enum (doutrina). `somos_admin` é **derivado e
sincronizado por evento**, nunca digitado — sem ele o painel promete botão que
o WhatsApp recusa.

### 5.2 `whatsapp_group_members`

```sql
create table if not exists public.whatsapp_group_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references whatsapp_groups(id) on delete cascade,
  wa_lid text,                                    -- 2242…@lid (estável entre grupos)
  wa_pn text,                                     -- 5548…@c.us (medido: vem resolvido)
  push_name text,
  role text not null default 'participant'
    check (role in ('participant','admin','superadmin','left')),
  contact_id uuid references contacts(id) on delete set null,   -- NULLABLE por decisão
  strikes int not null default 0,
  silenciado_ate timestamptz,
  entrou_em timestamptz,
  saiu_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_id, wa_lid)
);
```

`contact_id` nullable é a decisão de identidade: quem já é cliente aparece
identificado, quem não é fica anônimo até falar. **Membro não vira contato por
entrar no grupo** — vira quando há handoff para o privado (§8).

### 5.3 `whatsapp_group_messages`

```sql
create table if not exists public.whatsapp_group_messages (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references whatsapp_groups(id) on delete cascade,
  member_id uuid references whatsapp_group_members(id) on delete set null,
  external_id text not null,                      -- id do WAHA
  autor_lid text,
  autor_pn text,
  body text,
  has_media boolean not null default false,
  media_url text,
  from_me boolean not null default false,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)           -- idempotência, captura 23505
);
```

Retenção curta (§9). Existe para dar **contexto ao agente** e **prova de
infração**, não para ser arquivo eterno num self-host de 1 GB.

### 5.4 `whatsapp_group_infractions` e `whatsapp_group_actions`

```sql
create table if not exists public.whatsapp_group_infractions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references whatsapp_groups(id) on delete cascade,
  member_id uuid references whatsapp_group_members(id) on delete set null,
  message_id uuid references whatsapp_group_messages(id) on delete set null,
  regra text not null,                            -- vocabulário ABERTO: sem CHECK
  origem text not null check (origem in ('deterministico','ia','humano')),
  confianca numeric,                              -- só quando origem='ia'
  trecho text,                                    -- a prova, congelada
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_group_actions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references whatsapp_groups(id) on delete cascade,
  member_id uuid references whatsapp_group_members(id) on delete set null,
  infraction_id uuid references whatsapp_group_infractions(id) on delete set null,
  acao text not null,                             -- avisar|advertir|silenciar|remover|promover|rebaixar
  decidido_por text not null check (decidido_por in ('ia','humano','regra')),
  aprovado_por_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente','executando','concluida','falhou','revertida','cancelada')),
  waha_http_status int,
  waha_status_participante text,                  -- o 451/404/200 do array
  waha_resposta jsonb,                            -- corpo cru, para o painel mostrar
  pos_condicao_ok boolean,                        -- ← releu participants/v2 e confirmou
  executada_em timestamptz,
  created_at timestamptz not null default now()
);
```

`regra` é vocabulário **aberto** e por isso **sem CHECK** — a exceção deliberada
do CLAUDE.md: um clone pode ter linha com valor legado, e a constraint quebraria
o `update.sh`. O vocabulário vive no TypeScript, com constante compartilhada
(nunca string literal), e a coluna fica fora de
`tests/invariants/vocabulario-banco-x-typescript.test.ts`.

**`pos_condicao_ok` é a coluna mais importante da spec.** Medido: a resposta
mente. Ação sem pós-condição verificada não é ação concluída.

### 5.5 RLS

Toda tabela: `organization_id uuid not null`, policy
`tenant_isolation_whatsapp_group_<x>_all` via `fn_user_org_ids()`. Handlers que
usam admin client filtram `organization_id` **manualmente**, resolvido do
webhook secret / sessão — **nunca do body**. Teste de isolamento entre 2
organizações em `tests/invariants/`, obrigatório.

## 6. Ingest

### 6.1 Env e config — sem isto, nada chega

Medido na VPS: a sessão tem `ignore.groups=true` e
`WHATSAPP_HOOK_EVENTS` **não inclui nenhum `group.v2.*`**.

1. `docker-compose.prod.yml`: `WHATSAPP_HOOK_EVENTS` += `group.v2.join`,
   `group.v2.leave`, `group.v2.participants`, `group.v2.update`
2. Por sessão: `ignore.groups` → `false` **apenas quando a org liga o módulo**.
   Ligar é ato explícito, não default — o `ignore` economiza CPU e disco de quem
   não usa grupo (o comentário em `client.ts:39-45` documenta isso).
3. Bump do pin para `latest-2026.8.2` (PR próprio, anterior), com fragmento em
   `.changes/` declarando `exige_acao` — é mudança de compose que o `update.sh`
   precisa alcançar.

### 6.2 Roteamento no webhook

`app/api/v1/webhooks/waha/route.ts` passa a distinguir:

- `message.any` com `from` terminando em `@g.us` **e** grupo cadastrado com
  módulo ligado → ingest de grupo
- `message.any` em `@g.us` sem módulo ligado → **descarte, como hoje**
  (`ingest.ts:194` permanece o caminho padrão)
- `group.v2.*` → sincronização de grupo/membros

O autor sai de `payload.participant` (topo, medido), telefone de
`_data.key.participantAlt`, nome de `_data.pushName`.

### 6.3 Sincronização de membros

Fonte: `group.v2.update` (lista completa com `pn` e papel — medido). Nunca
polling. `group.v2.participants` marca `entrou_em`/`saiu_em` e o `role`.

Ao ligar o módulo num grupo, **uma** chamada a `GET /groups/{id}` +
`participants/v2` faz a carga inicial. Depois disso, só evento.

## 7. Motor de regras e escada de penalidade

### 7.1 Duas camadas, nesta ordem

**Determinístico** (`lib/grupos/regras/deterministico.ts`, puro, sem I/O):
link externo, número de telefone, flood (N msg em M s), mídia proibida,
palavra-chave, mensagem fora da janela. Decide sem chamar modelo.

**IA** só no resíduo: ofensa, venda disfarçada, tom. Roda pelo
`lib/ai/dispatcher` existente, com o histórico curto de
`whatsapp_group_messages` como contexto.

Ordem importa por custo: grupo de 500 msg/dia não pode chamar modelo 500 vezes.

### 7.2 A escada, por modo

| Modo | Avisar | Advertir (strike) | Silenciar | Remover |
|---|---|---|---|---|
| `vigiado` | registra | registra | — | — |
| `semi` | IA | IA | IA | **pendência na Central** |
| `autonomo` | IA | IA | IA | IA, com teto |

Default `vigiado`. Tetos do modo `autonomo` em `settings`: máximo de remoções
por dia, nunca remover admin, nunca remover membro com menos de N dias de grupo.

`silenciar` não existe como operação individual no WhatsApp — o que existe é
`announce` (só admin fala) para o grupo inteiro. Portanto **silenciar é do CRM**:
`silenciado_ate` na tabela de membro faz o agente ignorar e o painel mostrar;
não há efeito no WhatsApp. Isto é limitação da plataforma e a tela tem de dizê-lo
ao operador, sem fingir poder que não tem.

### 7.3 Execução — o invariante central

Toda ação que toca o WhatsApp segue, sem exceção:

1. grava `whatsapp_group_actions` com `status='pendente'`
2. emite em `event_log`; **worker** drena (trigger nunca faz HTTP)
3. chama o WAHA; guarda `waha_http_status`, `waha_status_participante`,
   `waha_resposta` **crus**
4. **relê `participants/v2`** e compara com o esperado
5. `pos_condicao_ok = true` só se o estado mudou de fato
6. `status='concluida'` ou `'falhou'` — nunca "concluída" por `200`

Erro externo chega ao painel **com o texto real** (`451`, `404`, corpo cru).
Nunca "falha na operação" (Regra Nº 1).

### 7.4 `add` de membro

**O agente nunca chama `add`.** O painel manual pode, mostrando o erro cru. O
caminho de entrada suportado é o **link de convite**
(`GET /invite-code`, `POST /invite-code/revoke`), que foi medido e funciona.

## 8. O laço de retorno — como grupo alimenta o funil

Invariante 7 do Sistema Vivo ("todo laço se fecha"). Sem isto o módulo é ilha.

Quando o agente de grupo detecta interesse comercial (regra própria, separada das
de moderação), ele **não responde a venda no grupo**. Ele:

1. registra `whatsapp_group_actions` com `acao='handoff_privado'`
2. abre conversa **no privado** com aquele membro — aí sim nascem `contacts` +
   `conversations` + lead, pelo caminho normal do CRM
3. grava `contact_id` no membro do grupo (o vínculo opcional da §5.2)
4. o lead nasce com origem `grupo:<wa_group_id>`, rastreável até a mensagem

É assim que "grupo fora do funil" convive com "grupo gera negócio".

## 9. Retenção

Em `lib/retencao/politica.ts`, seguindo o padrão `_PADRAO`/`_PISO`:

```ts
export const RETENCAO_MENSAGENS_GRUPO_DIAS_PADRAO = 30;
export const RETENCAO_MENSAGENS_GRUPO_DIAS_PISO = 7;
```

Expurgo por `fn_expurgar_mensagens_grupo_vencidas` (`security definer`, piso
**no corpo**, revogada de `public`/`anon`, sem seletor de linha), chamada pelo
cron `data-retention` existente. Infrações e ações **não** são expurgadas junto:
são a prova de por que alguém foi removido.

## 10. Telas (painel manual é pilar)

Todas declaradas em `lib/navigation/catalogo.ts` (DoD item 14).

| Tela | O que faz |
|---|---|
| `/app/grupos` | lista: nome, membros, modo, se somos admin, infrações 7d |
| `/app/grupos/[id]` | painel do grupo: settings (announce/restrict/add-mode), link de convite, agente ligado, regras |
| `/app/grupos/[id]/membros` | tabela de membros: papel, strikes, silêncio, **ações manuais** (remover, promover, rebaixar), com o erro cru do WAHA visível |
| `/app/grupos/[id]/historico` | mensagens dentro da janela de retenção, infrações e ações — o log de "por que o Fábio saiu" |

Todo ato da IA aparece aí com `decidido_por='ia'` e é **reversível** pelo humano
(readicionar não é possível por `add`; a reversão real é o link de convite, e a
tela tem de dizer isso).

Modo `semi`: remoção vira item em `agent_inbox_items`, aprovado num clique.

⚠️ **`agent_inbox_items.kind` tem CHECK fechado** (baseline linha 6452):
`qr_rescan`, `job_dead`, `event_dead`, `budget_exceeded`, `handoff`,
`promotion_review`, `judge_unaligned`, `other`. Um `kind` novo **exige
migration que altere a constraint** — e o CLAUDE.md avisa que constraint nova
quebra o `update.sh` de clone com linha legada. Duas saídas, a decidir na
implementação:

- **(a)** migration `0273` que acrescenta `group_action_pending` ao CHECK
  (idempotente: `drop constraint if exists` + `add constraint`), ou
- **(b)** usar `kind='other'` com `ref_kind='whatsapp_group_action'` e
  `ref_id` apontando para `whatsapp_group_actions.id` — as colunas
  `ref_kind`/`ref_id` já existem exatamente para isto, e **não mexe em
  constraint**.

Recomendo **(b)**: é o mecanismo que a tabela já oferece, e não arrisca o
`update.sh`. Se a Central precisar distinguir visualmente, o `ref_kind` basta.

## 11. Testes

| Tipo | O quê |
|---|---|
| `tests/unit/` | regras determinísticas (puras); parser do payload de grupo contra `.superpowers-capturas-grupo.jsonl` **real** |
| `tests/invariants/` | isolamento RLS entre 2 orgs; **`pos_condicao_ok` obrigatório** — nenhuma ação vai a `concluida` sem ele; cron audita só quando houve efeito; `kind` usado na Central pertence ao CHECK em vigor |
| `tests/e2e/` | painel: ligar módulo num grupo, ver membros, remover pela tela, ver o erro cru quando não somos admin |

O teste do parser usa payload capturado em produção, não fixture inventada — é o
que impede a regressão de voltar a ler `p.author`.

## 12. Fatiamento

**Fatia 1 — ver e administrar à mão**
Schema, ingest de `group.v2.*`, sincronização de membros, telas de lista/detalhe/
membros, ações manuais com pós-condição. Sem IA. Já entrega o painel que você
pediu como pilar.

**Fatia 2 — moderação determinística**
Motor de regras sem IA, strikes, escada, modos `vigiado`/`semi`/`autonomo`,
Central para aprovação.

**Fatia 3 — IA no resíduo**
Agente de grupo, regras que exigem julgamento, contexto do histórico curto.

**Fatia 4 — atendimento e handoff**
Detecção de interesse, handoff para privado, lead com origem de grupo (§8).

Fila de aprovação de entrada (`join-requests`) entra na fatia 1 **se** o bump
para 2026.8.2 já tiver ocorrido; senão, fatia 2.

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Resposta do WAHA mente | `pos_condicao_ok`, invariante com teste |
| Não somos admin → tudo falha silencioso | `somos_admin` sincronizado; painel desabilita o que não dá; erro cru na tela |
| `rate-overlimit` no NOWEB | zero polling; só evento + carga inicial única |
| Ban por automação | `add` fora do agente; tetos no modo autônomo; reusa o pacing existente |
| Grupo grande enche o disco | retenção curta com piso; só infração/ação são perenes |
| Módulo vira ilha | §8 é requisito, não enfeite; cobrado no Living System Checklist |
| `_data` é Baileys sem contrato | ler `participant` do **topo**; `_data` só para `participantAlt`/`pushName`, com teste sobre payload real |

## 14. Fora de escopo

- Comunidades (`isCommunity`) — estrutura própria do WhatsApp, outro projeto
- Enquete, evento, mensagem fixada em grupo
- Grupo como card de funil (decidido: não)
- `DELETE /groups/{id}` — WEBJS/WPP apenas, não existe em NOWEB
