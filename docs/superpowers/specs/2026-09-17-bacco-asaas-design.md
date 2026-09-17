# Bacco — módulo Asaas (pendências financeiras no atendimento)

**Data:** 2026-09-17 · **Estado:** revisão 2 (após refutador + Codex), aguardando aprovação · **Escopo:** fork Bacco (vertical aditiva)

## 1. O que é, em um parágrafo

Módulo **opcional, ligado só pelo `admin` da organização**, que conecta o CRM à conta Asaas do
cliente. Com ele ligado: o agente de IA consulta as cobranças pendentes ou vencidas de um contato,
manda link/linha digitável/Pix, e prorroga o vencimento de um boleto vencido dentro da cerca que o
admin declarou; o Asaas avisa por webhook quando uma cobrança vence ou é paga, e o sistema
matricula o contato num fluxo de retorno escolhido pelo admin (vencida) ou encerra a matrícula
(paga). Com ele desligado: nenhuma ferramenta chega ao modelo, nenhuma matrícula nova, webhook não
processa, e nenhuma peça do núcleo (atendimento, funil, agenda, retorno) depende dele. O que já
estava em curso ao desligar é tratado em §11 — "sem rastro" seria mentira, e a spec diz o que fica.

Decisões tomadas com o dono (2026-09-17):

| decisão | escolha |
|---|---|
| Onde nascem as cobranças | **No Asaas** (ERP/painel). O CRM lê e age; **não cria** cobrança na v1 |
| "Reemitir boleto atrasado" | **Novo vencimento na mesma cobrança** (`PUT /v3/payments/{id}` com `dueDate`). Sem cobrança duplicada |
| Chave contato ↔ cliente Asaas | **CPF/CNPJ**, informado na conversa ou lido do Asaas — ver §5.3 para por que o documento **não é persistido** pelo módulo |
| Autonomia do agente | **Total**, dentro de cerca declarada pelo admin (dias de prorrogação, máx. reemissões por cobrança) |
| Módulo | Opt-in por tenant; sistema funciona igual com ele desligado |
| Webhook | Cadastrado **à mão** no painel do Asaas com URL + token que a tela mostra |

Ajuste do dono na aprovação (2026-09-17): **cadastro de empresas com vários contatos** (§5.2a). O
Asaas cobra o CNPJ; no CRM cada telefone da empresa é um contato; a empresa é quem carrega o
vínculo e aponta o **número principal** que recebe o aviso financeiro. Empresas é CRM genérico e **aditivo**: quem
não usa não vê diferença (tabela de regras em §5.2a).

Decisões tomadas na revisão 2 (o dono pode reverter):

- **O módulo não grava CPF/CNPJ no contato.** Guarda só o `asaas_customer_id`. Motivo em §5.3.
- **Cobrança vencida não expulsa outro retorno em curso.** Só existe uma matrícula viva por contato
  na organização (índice `idx_followup_enrollments_one_live`, sem `pointer_id`). Se o contato já está
  noutro fluxo, a pendência espera e o cron tenta de novo no dia seguinte. Motivo em §8.

## 2. Fora de escopo (v1)

- Criar cobrança, Pix ou assinatura a partir do CRM.
- Tela financeira, relatório de inadimplência, espelho completo das cobranças.
- Cartão de crédito (exige `remoteIp` e antifraude — vide runbook do ERP).
- Cancelar/estornar cobrança.
- Várias contas/subcontas Asaas por organização.
- Registrar o webhook via API do Asaas.

Cada item vira issue própria se pedido; a v1 não deixa gancho "para depois".

## 3. Fatos do Asaas que governam o desenho (medidos no ERP, não deduzidos)

Fonte: `/home/lussandro/Bacco-Erp/backend/src/asaas/*` e
`docs/superpowers/specs/asaas-sandbox-medido.md` do ERP.

- Base: `https://api.asaas.com/v3` (produção) e `https://api-sandbox.asaas.com/v3`. Auth: header
  `access_token` com a chave em claro.
- Cliente: `GET /customers?cpfCnpj=<dígitos>` — documento só dígitos. Toda cobrança pertence a um
  `customer`, inclusive Pix. `GET /customers/{id}` devolve `cpfCnpj`, `name`, `mobilePhone`.
- Cobranças: `GET /payments?customer=<id>&status=OVERDUE&limit=100&offset=N` (um status por
  chamada). Campos: `id`, `customer`, `status`, `value`, `dueDate`, `billingType`
  (`BOLETO|PIX|CREDIT_CARD|UNDEFINED`), `invoiceUrl`, `bankSlipUrl`, `paymentDate`.
- Linha digitável: `GET /payments/{id}/identificationField`. Pix copia-e-cola:
  `GET /payments/{id}/pixQrCode` (`payload`, `encodedImage`, `expirationDate`).
- Alterar vencimento: `PUT /payments/{id}` com `{ dueDate: 'YYYY-MM-DD' }`. Só em
  `PENDING`/`OVERDUE`. Lição do ERP (`ASAAS_STATUS_APAGAVEL`): **ler o status ao vivo antes de
  agir**; o Asaas devolve 200 em operações que não fizeram nada.
- Erro 4xx: `{ errors: [{ code, description }] }`. `code` distingue erro nosso (`invalid_value`,
  `invalid_object`) de recusa do Asaas (`invalid_action`). O texto vai ao usuário **inteiro**.
- Webhook: o Asaas manda o token cadastrado no header `asaas-access-token`. Se a URL responder
  5xx repetidas vezes ele **interrompe a fila** (`interrupted:true` em `GET /webhooks`) — por isso o
  cron de reconciliação existe e o endpoint responde 200 rápido.
- Eventos: `PAYMENT_OVERDUE`, `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_DELETED`,
  `PAYMENT_REFUNDED`, `PAYMENT_UPDATED` (o próprio `PUT dueDate` gera um).
- Sandbox não vence boleto sozinho: o teste de "vencida" cria cobrança com `dueDate` no passado.

**A medir antes de confiar** (a implementação abre com isso, no sandbox, e grava a saída crua em
`docs/superpowers/specs/asaas-sandbox-medido-crm.md`):

1. Se `GET /payments?status=RECEIVED&paymentDate[ge]=YYYY-MM-DD` filtra por data de **pagamento**
   (o ERP só usou `dateCreated`, que é criação — e uma cobrança de 30 dias paga ontem não entraria).
2. Se `PUT dueDate` em `OVERDUE` volta a `PENDING` na hora.
3. `identificationField` para `PIX` (provavelmente 404).
4. Se o Asaas conta 404 como entrega ou como falha (decide §7 passo 1).
5. Formato exato do envelope `PAYMENT_*` (o Zod de §7 nasce da medição).

## 4. Arquitetura

```
Admin (tela)  ──► tenant_integrations(provider='asaas')  ◄── cron asaas-reconcile (diário)
                       │  chave cifrada, config, token do webhook
                       ▼
Asaas ──POST /api/v1/webhooks/asaas/[token]──► webhook_events_log ──► event_log
                                                                         │ asaas.payment_overdue
                                                                         │ asaas.payment_received
                                                                         ▼
                                     consumidor (lib/asaas/consumidor.handler.ts)
                                       ├─ asaas_charges (estado mínimo por cobrança)
                                       ├─ contato por asaas_customer_id ─► enrollFollowupFlow
                                       ├─ pago ─► cancela matrícula + atividade no lead
                                       └─ sem contato ─► agent_inbox_items(kind='charge_unmatched')

Agente de IA ──tools──► lib/mcp/tools/financeiro.ts ──► lib/asaas/cliente.ts ──► Asaas
```

`lib/asaas/` **não existe hoje** — é módulo novo: `cliente.ts` (HTTP), `tipos.ts`, `mapeamento.ts`
(webhook → evento interno, sanitização), `cliente-do-contato.ts` (resolução do customer),
`consumidor.handler.ts`, `reconcile.ts`. Ferramentas, webhook e cron importam dali; nenhum outro
arquivo monta URL do Asaas.

Regras que valem para todas as peças:

- **`organization_id` sempre de fonte confiável**: `McpContext` (tool), token de path (webhook),
  varredura por org (cron). Nunca do body.
- **Trigger nunca faz HTTP.** Toda chamada ao Asaas sai de tool, rota ou cron.
- **Nada lança em layout.** Erro do módulo aparece na tela do módulo e na Central.
- **Documento (CPF/CNPJ) nunca é persistido pelo módulo, nunca vai a log, audit ou Central.**

## 5. Ativação e credencial

### 5.1 Tela `/app/integrations/asaas`

Modelada em `app/app/integrations/nuvemshop/page.tsx`, com uma diferença: **a rota e as server
actions exigem papel `admin`** (a página do Nuvemshop não filtra papel, e a RLS
`tenant_integrations_admin_write` aceita `manager` — o piso do banco fica como está, o gate de
`admin` é do handler, e um teste unitário garante que `manager` recebe 403).

| campo | obrigatório | onde grava |
|---|---|---|
| Chave de API | sim | `oauth_access_token_encrypted` via `fn_encrypt_oauth` |
| Ambiente `sandbox` / `producao` | sim | `store_metadata.ambiente` |
| Fluxo de retorno para pendência vencida | sim para matricular | `store_metadata.followup_pointer_id` |
| Prorrogar vencimento por N dias | sim para a ferramenta de reemissão existir | `store_metadata.reemissao.dias` (int 1..90) |
| Máx. de prorrogações por cobrança | idem | `store_metadata.reemissao.max_por_cobranca` (int 1..10) |

Sem `dias` **e** `max_por_cobranca`, `crm_reissue_overdue_charge` não chega ao modelo e a tela avisa.
Não há default: número inventado aqui é o bug que a Regra nº 1 proíbe.

**Validação do fluxo escolhido, ao salvar** (o refutador mostrou que nada disso é checado por
`enrollFollowupFlow`):

- `followup_flow_pointers.status='active'`, mesma org, `trigger_config.kind='webhook'`.
- O agente que arma esse pointer (`resolveAgentForAutomaticTrigger`) existe e tem as três
  `tool_ids` de §6 na versão publicada. Sem isso a tela recusa: "o agente X arma este fluxo mas não
  tem as capacidades de pendência financeira ligadas; ligue-as no agente e publique".
- Se o fluxo tem nó `action` em modo `text` (mensagem fixa), a tela avisa que texto fixo não
  consulta o Asaas e pode cobrar valor errado ou cliente que já pagou; recomenda `ai_message`. Não
  bloqueia — é decisão do admin, registrada no audit.

Botões:

- **Testar conexão** → `GET /v3/finance/balance`. Sucesso: `status='healthy'`,
  `last_health_check_at`. Erro: `status='error'`, `status_reason` = texto do Asaas.
- **Ativar** → testa conexão, gera `webhook_path_token` (default do schema) e um segredo de 32
  bytes em `webhook_secret_encrypted`, `status='healthy'`, mostra **uma vez**:

  ```
  URL:   https://<dominio>/api/v1/webhooks/asaas/<webhook_path_token>
  Token: <segredo em claro>
  ```

  O admin cadastra no painel do Asaas (Integrações › Webhooks; "Token de autenticação" = segredo;
  eventos de §3; API v3; fila sequencial). Botão "Gerar novo token" invalida o anterior. A URL fica
  sempre visível; o token nunca mais. Ativar também dispara uma reconciliação (§9) fire-and-forget.
- **Desativar** → `status='disconnected'`. Chave fica cifrada para religar; "Esquecer chave" apaga a
  linha. Efeitos em §11.

Auditoria (entram em `AUDIT_ACTIONS`, `lib/audit/actions.ts`, com o gate do painel):
`asaas.integration_enabled`, `asaas.integration_disabled`, `asaas.integration_config_changed` (com
`last4`, nunca a chave), `asaas.webhook_token_rotated`, `asaas.webhook_invalid_signature`,
`asaas.charge_reissued`, `asaas.contact_linked`.

### 5.2 Schema (tripla de migration, número `0260`, apêndice `-- ---- asaas (migration 0260, bacco) ----`)

```sql
-- tenant_integrations: provider novo (reconstruir com TODOS os valores vigentes)
alter table public.tenant_integrations drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations add constraint tenant_integrations_provider_check
  check (provider in ('nuvemshop','vtex','shopify','asaas'));

-- webhook_events_log: provider novo. ATENÇÃO: o apêndice do baseline já reconstruiu esta
-- constraint com meta_cloud e zernio; listar só os quatro originais derrubaria dois providers em uso.
alter table public.webhook_events_log drop constraint if exists webhook_events_log_provider_check;
alter table public.webhook_events_log add constraint webhook_events_log_provider_check
  check (provider in ('waha','nuvemshop','generic','meta_cloud','zernio','asaas'));

-- idempotência REAL do webhook Asaas: o índice existente (baseline.sql:2786) não é único.
-- Parcial por provider para não impor unicidade a providers que hoje não a têm.
create unique index if not exists uq_webhook_events_asaas_external
  on public.webhook_events_log (organization_id, external_id)
  where provider = 'asaas' and external_id is not null;

-- agent_inbox_items.kind: +'charge_unmatched', +'charge_overdue_no_flow', +'charge_reissue_failed',
-- +'charge_webhook_paused' — no bloco ÚNICO do fim do baseline, com todos os valores
-- (tests/unit/kind-check-migration-x-baseline.test.ts vigia).

-- contato ↔ cliente Asaas: coluna própria, não custom_fields (que é do usuário e é limpo na anonimização)
alter table public.contacts add column if not exists asaas_customer_id text;
create unique index if not exists uq_contacts_org_asaas_customer
  on public.contacts (organization_id, asaas_customer_id) where asaas_customer_id is not null;
-- a anonimização (trg_contacts_anon*) passa a zerar asaas_customer_id junto com o resto

-- estado mínimo por cobrança: o que o módulo precisa lembrar e o Asaas não lembra por nós
create table if not exists public.asaas_charges (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id text not null,
  customer_id text not null,
  holder_kind text check (holder_kind in ('company','contact')),   -- quem é o titular no CRM (§5.2a); null = sem vínculo
  holder_id uuid,
  status text not null,                 -- último status visto (PENDING|OVERDUE|RECEIVED|…), sem CHECK: vocabulário do Asaas
  due_date date not null,
  value_cents integer not null,
  enrollment_id uuid references public.followup_enrollments(id) on delete set null,
  reissue_count integer not null default 0,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, payment_id)
);
alter table public.asaas_charges enable row level security;
-- policy tenant_isolation_asaas_charges_all via fn_user_org_ids(), como as demais

create table if not exists public.asaas_charge_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id text not null,
  action text not null check (action in ('reissue')),
  actor_kind text not null check (actor_kind in ('agent','user','system')),
  actor_id uuid,
  old_due_date date not null,
  new_due_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_asaas_charge_actions_org_payment
  on public.asaas_charge_actions (organization_id, payment_id);
alter table public.asaas_charge_actions enable row level security;
```

`asaas_charges` é estado, não espelho: guarda o necessário para (a) saber a qual matrícula uma
cobrança está ligada, (b) contar reemissões, (c) o cron saber o que já foi tratado. Valor e
vencimento ficam aí só para a Central e a atividade mostrarem sem chamar o Asaas; **toda decisão
lê o Asaas ao vivo**.

### 5.2a Empresas — cadastro com vários contatos (ajuste do dono, 2026-09-17)

**Por quê.** Uma empresa cliente tem mais de um telefone que aciona o financeiro. O Asaas cobra o
CNPJ (um `customer`), e no CRM cada telefone é um contato. Se o vínculo com o Asaas ficasse no
contato, o segundo telefone da mesma empresa cairia em `charge_unmatched` e o aviso de vencido só
chegaria a um deles. A entidade que falta é a **empresa**: dona do vínculo com o Asaas e dos seus
contatos. Não existe hoje — `contacts` é plano e o único CNPJ do banco é o da própria organização.

**Restrição do dono (2026-09-17): o CRM não é só do Bacco. O cadastro de empresas não pode, em
hipótese alguma, interferir no funcionamento do CRM para quem não o usa.** Traduzido em regras
mecânicas, cada uma com teste:

| regra | como se garante | teste |
|---|---|---|
| Nada novo é obrigatório | `company_id` e `billing_contact_id` nullable; nenhum Zod existente ganha campo obrigatório | `route.test.ts` de contatos continua verde sem tocar |
| Nenhum fluxo existente muda de caminho | criar/editar/importar/mesclar/anonimizar contato, criar lead, roteamento, follow-up, agente: **zero** `if (company)` fora de `lib/companies/` e `lib/asaas/` | gate novo `tests/unit/empresas-sao-aditivas.test.ts`: varre `app/api/v1/{contacts,leads,conversations,messages}` e `lib/{followup,routing,agent-engine,ai,leads,channels}` e reprova import de `lib/companies` ou referência a `crm_companies`/`company_id` — com uma allowlist só para `app/api/v1/contacts/`, que passa `company_id` como coluna (SELECT/PATCH) sem ramificar |
| Respostas de API só ganham campo opcional | `contacts` GET devolve `company_id` e `company: {id,name} \| null` quando há; consumidores antigos ignoram | contrato em `docs/specs` atualizado como aditivo |
| Anonimização é a única peça existente tocada | trigger-irmão `trg_crm_companies_principal_anonimizado` em `after update of is_anonymized` (o padrão do repo para efeitos colaterais da anonimização; não reescreve `fn_lgpd_anonymize_contact`) zera `company_id` e solta `billing_contact_id` | `tests/invariants/empresas.test.ts` |
| Org sem empresa não vê diferença de desempenho | índices parciais `where company_id is not null`; nenhuma query existente ganha JOIN | `EXPLAIN` do GET de contatos sem empresa não muda de plano (medido uma vez, registrado no PR) |
| Tela some quando não é usada | a entrada "Empresas" na navegação fica `sidebar: true` mas o contato 360 só mostra o campo "Empresa" quando a org tem ≥1 empresa ou o módulo Asaas está ativo; criar a primeira empresa é pela tela Empresas | teste de navegação + teste do 360 nos dois estados |
| Módulo Asaas desligado não apaga empresas | empresas são CRM genérico (B2B de qualquer nicho); o bloco Asaas da tela some, o resto fica | caso no teste da tela |
| Merge de contatos | `fn_mesclar_contatos`: o principal **manda** — mantém o `company_id` do sobrevivente e não herda o do secundário. O repoint automático de FKs pode deixar o sobrevivente como principal de uma empresa que não é a dele: a função solta esse `billing_contact_id`. Sem atividade nova (o merge já audita) | 1 caso em `tests/invariants/empresas.test.ts` |

**Schema** (mesma migration `0260`):

```sql
create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,                    -- razão social ou como o dono chama
  trade_name text,                       -- nome fantasia
  cnpj text,                             -- só dígitos; não é dado pessoal, fica em claro
  asaas_customer_id text,
  billing_contact_id uuid references public.contacts(id) on delete set null,  -- o número principal para cobrança
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_crm_companies_org_cnpj
  on public.crm_companies (organization_id, cnpj) where cnpj is not null;
create unique index if not exists uq_crm_companies_org_asaas_customer
  on public.crm_companies (organization_id, asaas_customer_id) where asaas_customer_id is not null;
alter table public.crm_companies enable row level security;
-- policy tenant_isolation_crm_companies_all via fn_user_org_ids()

alter table public.contacts add column if not exists company_id uuid
  references public.crm_companies(id) on delete set null;
create index if not exists idx_contacts_org_company on public.contacts (organization_id, company_id)
  where company_id is not null;
```

- `on delete set null` no contato: apagar a empresa não apaga pessoas nem histórico (anti-pattern 7).
- `billing_contact_id`: **o número principal** — o único contato da empresa que recebe o retorno
  de pendência (decisão do dono, 2026-09-17). Precisa ter `company_id` = esta empresa (checado no
  handler; FK não expressa isso). Sem principal → a pendência vai à Central
  (`charge_overdue_no_flow`, texto "a empresa X não tem número principal para cobrança") e não fala
  com ninguém — a spec não escolhe um telefone no chute. Os demais contatos da empresa **não**
  recebem aviso, mas consultam e reemitem quando eles mesmos acionam o atendimento.
- `crm_lead_links.target_kind` ganha `'company'` (CHECK reconstruído com os sete valores atuais +
  1) para a oportunidade poder apontar a empresa. Só o vínculo; nada de coluna `company_id` em
  `crm_leads` (DIRC: Referenciar).
- Anonimização de contato: zera `company_id`; se era o `billing_contact_id`, a FK `set null`
  desfaz o principal e o sistema abre `charge_overdue_no_flow` na próxima vencida. A empresa
  não é anonimizada (pessoa jurídica).
- `contacts.asaas_customer_id` (§5.2) **continua existindo** para pessoa física: consumidor de
  vinho com CPF não tem empresa. Regra: **se o contato tem `company_id`, o vínculo Asaas é o da
  empresa; senão, o do contato.** `lib/asaas/cliente-do-contato.ts` resolve nessa ordem e devolve
  também `titular: { kind: 'company' | 'contact', id }` — é isso que `asaas_charges` grava
  (colunas `holder_kind text check in ('company','contact')`, `holder_id uuid`, no lugar de só
  `contact_id`).

**Tela** (porta em `lib/navigation/catalogo.ts`, grupo `crm`, ao lado de Contatos, `sidebar: true`):

- `/app/companies`: lista com nome, CNPJ, nº de contatos, busca por nome/CNPJ (a coluna
  "vínculo Asaas" entra com o módulo Asaas). Criar empresa: nome + CNPJ opcional.
- `/app/companies/[id]`: dados, **contatos da empresa** (adicionar contato existente por
  busca, remover, marcar um como **número principal para cobrança**),
  e o bloco **Asaas** (só aparece com o módulo ativo): "Vincular pelo CNPJ" → `GET
  /customers?cpfCnpj=` → grava `asaas_customer_id`, audit `asaas.company_linked`; mostra pendências
  ao vivo (`PENDING` + `OVERDUE`) com valor, vencimento e link — leitura, sem ação de reemitir
  pela tela na v1 (a ação é do agente; humano reemite no painel do Asaas).
- Contato 360 (`app/app/contacts/[id]`): campo "Empresa" (seletor com busca, criar nova inline) e
  a etiqueta "número principal para cobrança" quando é o caso (a troca é feita na tela da empresa).
- API `/api/v1/companies` (GET list, POST) e `/api/v1/companies/[id]` (GET, PATCH, DELETE) +
  `/api/v1/companies/[id]/contacts` (POST vincula, DELETE desvincula), com `ok()/fail()`,
  Zod, audit (`company.created|updated|deleted|contact_linked|contact_unlinked`), papel
  `agent` para ler e vincular, `manager` para apagar. **Sem rate limit**, como as rotas
  cookie-auth de contatos e leads; entra quando houver caminho Bearer ou importação em massa.

**Vínculo com o Asaas para empresa é ato do humano, não do agente.** O agente na conversa com um
contato de empresa só age se a empresa já está vinculada. Se não está: responde que precisa do
cadastro financeiro da empresa, e o handler abre `charge_unmatched` apontando a empresa (botão
"vincular pelo CNPJ" na Central leva ao `/app/companies/[id]`). Motivo: a conferência "telefone do
customer bate com o do contato" (§5.3) não vale para empresa — o `mobilePhone` do cadastro no Asaas
costuma ser o do escritório, não o de quem está no WhatsApp.

**Webhook e retorno com empresa** (ajusta §8): `payment.customer` → primeiro
`crm_companies.asaas_customer_id`, depois `contacts.asaas_customer_id`. Empresa → matricula **só o
`billing_contact_id`**; pessoa física → o próprio contato. Uma cobrança, uma matrícula
(`asaas_charges.enrollment_id`). `crm_list_contact_charges` para contato de empresa lista as
cobranças da empresa; qualquer contato vinculado pode consultar e reemitir quando aciona (é o que o
dono pediu: mais de um telefone aciona o financeiro). A atividade vai ao lead do contato do turno.

**Testes que a empresa acrescenta:** RLS de `crm_companies` entre 2 orgs (`test:db`); CHECK de
`target_kind` com `company`; resolução titular empresa > contato; empresa sem principal → Central e
ninguém é matriculado; principal que não pertence à empresa é recusado pelo handler; anonimizar o
principal zera o vínculo; E2E na VPS: criar empresa, vincular dois contatos, marcar um como
principal, vincular CNPJ do sandbox, vencer cobrança, **só** o principal recebe, e o segundo
consulta a pendência quando escreve.

### 5.3 Por que o módulo não guarda CPF/CNPJ (pessoa física)

O contato tem `cpf_hash` + `cpf_encrypted` com `CHECK ((cpf_encrypted IS NULL) = (cpf_hash IS
NULL))` (`baseline.sql:1352`), e a RPC `encrypt_cpf` **não existe em nenhuma migration** —
`lib/contacts/cpf.ts` grava só o hash, o que **viola o CHECK numa VPS fresca**. Não há CNPJ no
contato. Casar por hash de documento seria construir sobre coluna que hoje não se preenche, e
consertar o CPF do produto está fora deste módulo (vira issue própria).

Então o módulo casa por **`asaas_customer_id`**, coluna própria (§5.2), e o documento só transita:

1. `contacts.asaas_customer_id` presente → usa.
2. Ausente → a ferramenta devolve `{ needs_document: true }`; o agente pede CPF/CNPJ na conversa e
   chama de novo com `document`. O handler busca `GET /customers?cpfCnpj=`, e **antes de vincular
   confere que o `mobilePhone`/`phone` do customer bate com o telefone do contato do turno**
   (dígitos, variantes BR via `canonicalPhoneBR`). Bateu → grava `asaas_customer_id`, audit
   `asaas.contact_linked` (com o customer id, nunca o documento). Não bateu → não vincula, responde
   "esse documento não confere com o telefone deste atendimento" e abre `charge_unmatched` para o
   operador vincular à mão. Sem essa conferência, qualquer pessoa no WhatsApp digita um CPF alheio e
   lê os boletos do outro.
3. Webhook: `payment.customer` → titular (empresa, depois contato — §5.2a). Não achou →
   `charge_unmatched` na Central com nome do customer, valor e vencimento; o operador escolhe a
   empresa ou o contato e o sistema grava o vínculo por rota própria
   (`POST /api/v1/contacts/[id]/asaas-link` ou `POST /api/v1/companies/[id]/asaas`), com audit —
   nunca pelo PATCH genérico de contato. Sem busca por telefone automática (decisão do
   dono: telefone não é chave).

O parâmetro `document` é adicionado às listas de redação de `lib/mcp/audit.ts` e
`lib/ai/runtime/serialize.ts` (junto com `cpf`, `cnpj`, `cpfCnpj`) — hoje só `cpf` é redigido.

## 6. Ferramentas do agente

Handlers em `lib/mcp/tools/financeiro.ts`; catálogo em `lib/mcp/tools/catalogo/financeiro.ts`.
Texto para o dono sem jargão do gate `catalogo-tools-leigo-friendly` (proíbe, entre outros,
`webhook`, `lead`, `pipeline`, `stage`, `handoff`; "cobrança" e "boleto" são permitidos). Pacote:
`reter` — e o teste `tests/unit/mcp-retencao-tools.test.ts` ("as seis capacidades") é atualizado
para as nove.

| name | category | risco | entra por pacote? | exige |
|---|---|---|---|---|
| `crm_list_contact_charges` | read | `seguro` | **não** | `asaas` |
| `crm_get_charge_payment_info` | read | `seguro` | **não** | `asaas` |
| `crm_link_contact_to_billing` | write | `atencao` | **não** | `asaas` |
| `crm_reissue_overdue_charge` | write | `atencao` | **não** | `asaas:reemitir` (só com a cerca preenchida) |

**Quatro, não três** (revisão do plano): o vínculo por CPF na conversa **grava** (`asaas_customer_id` + audit) e por isso é ferramenta `write` própria, não um ramo da consulta — tool `read` que muta viola a doutrina mesmo quando o gate `tool-read-nao-muta` não enxerga a mutação delegada. E a reemissão só é montada quando a org tem a cerca: o filtro do turno lê um **set de capacidades** (`asaas`, `asaas:reemitir`), não só "provider healthy".

**Nenhuma entra por pacote nem pelo onboarding.** Campo novo na entrada do catálogo
(`McpToolCatalogEntry`, `lib/mcp/tools/catalogo/tipos.ts` — não em `McpToolDefinition`):
`requerIntegracao: 'asaas' | 'asaas:reemitir'`. `entraPorPacote` devolve `false` para entradas com `requerIntegracao`,
como já faz para `critico`. O admin liga as três no agente **depois** de ativar o módulo, e a tela de
capacidades mostra a etiqueta "requer Asaas ativo" (só etiqueta — `TOOL_CATALOG` continua estático,
sem tocar seus 10 consumidores).

**Visibilidade no turno** (é o que faz "desligado = inerte"): `pickToolsFromMcp` é síncrona e não vê
banco; ganha em `PickToolsInput` o campo opcional `capacidadesDeIntegracao?: ReadonlySet<string>`
(ausente = vazio = fechado), e entradas com `requerIntegracao` fora do set são puladas como as
`apenasHumano`. Os dois chamadores
(`lib/ai/runtime/agent.ts` e `lib/agent-engine/edge/crm/mcp-tools.ts`) carregam o set de
`tenant_integrations where status='healthy'` junto com o resto do contexto do turno. Teste que vale:
no `pickToolsFromMcp`, agente com os ids gravados e set vazio → nenhuma das três chega ao modelo.

Todas as três exigem `contact_id` **obrigatório** no schema — é a condição para o runtime injetar o
contato do turno (`lib/ai/runtime/tools.ts:104-115`), e o handler confere que `payment.customer` é o
`asaas_customer_id` desse contato antes de devolver ou alterar qualquer coisa. O Asaas não isola
por contato; nós isolamos.

`crm_list_contact_charges({ contact_id })` → `PENDING` + `OVERDUE` do customer, uma página de 100
por status (limite do Asaas), mais recente primeiro:
`[{ payment_id, status, billing_type, value_cents, due_date, days_overdue, invoice_url }]` e
`has_more` se o Asaas indicar. Sem customer: `{ needs_document: true }`; a `description` instrui a
pedir o CPF e chamar `crm_link_contact_to_billing({ contact_id, document })`, que faz a conferência
de telefone de §5.3 e grava o vínculo (ou recusa como resposta). A `description` também instrui: **se a
lista vier vazia, não fale de pendência** — é o freio contra cobrar quem já pagou.

`crm_get_charge_payment_info({ contact_id, payment_id })` → `{ invoice_url, bank_slip_url,
identification_field, pix_copy_paste, pix_expires_at }`, só os que existem para o `billingType`.

`crm_reissue_overdue_charge({ contact_id, payment_id })`:

1. Cobrança ao vivo. `status !== 'OVERDUE'` → recusa com o status real ("já está paga", "ainda não
   venceu"). Recusa é **resposta**, não exceção (padrão do pacote `reter`).
2. `asaas_charges.reissue_count >= max_por_cobranca` → recusa dizendo quantas foram; a
   `description` orienta a oferecer atendente (`crm_request_human_handoff`).
3. `new_due_date = hoje (fuso da org) + dias`. `PUT /payments/{id}` `{ dueDate }`.
4. `asaas_charge_actions` + `reissue_count++`; atividade no lead via `emitAgentActivityForContact`
   (recebe `pg.Pool`, não `SupabaseClient` — o handler obtém o pool como `lib/leads/veto-activity.ts`
   faz); tipo novo `charge_reissued` em `ActivityType` + `ACTIVITY_LABELS`
   (`lib/leads/activity-vocabulary.ts`); audit `asaas.charge_reissued`.
5. Devolve `{ new_due_date, invoice_url, bank_slip_url, identification_field }`.

Erro do Asaas → `errors[].description` volta ao modelo em `{ error }`; se `code !==
'invalid_action'` (erro nosso), abre `charge_reissue_failed` na Central com o texto.

Tipos de atividade novos (todos em `activity-vocabulary.ts`): `charge_overdue`, `charge_paid`,
`charge_deleted`, `charge_due_changed`, `charge_reissued`, `charge_waiting_slot`.

## 7. Webhook

Rota `app/api/v1/webhooks/asaas/[token]/route.ts`, no molde de `webhooks/in/[token]`:

1. `token` → `tenant_integrations` (`provider='asaas'`, `webhook_path_token=token`). Não achou ou
   `status<>'healthy'` → resposta **200 vazia** sem processar e sem log (como o Nuvemshop faz com
   `tenant_not_found`: o objetivo é o provedor parar de tentar, não punir). A medição 4 de §3 pode
   mudar isso para 404.
2. `asaas-access-token` vs segredo decifrado, `timingSafeEqual`. Diferente → 401 + audit
   `asaas.webhook_invalid_signature`.
3. `checkRateLimit` por token.
4. Zod no envelope (nasce da medição 5 de §3). Evento fora da lista → `webhook_events_log` como
   `processed`, 200.
5. Insert em `webhook_events_log` com `external_id = payment.id + ':' + event`; `23505` no índice
   único de §5.2 → 200 sem novo `event_log`. **Headers gravados sem `asaas-access-token`** (as rotas-
   modelo só stripam `authorization`/`cookie`; aqui o segredo mora noutro header). `raw_body` gravado
   com `cpfCnpj` substituído por `"[redigido]"` antes do insert — desvio consciente do padrão dos
   outros providers, porque este payload carrega documento; `payload_parsed` idem.
6. `emit_event` com `p_event_type` ∈ `asaas.payment_overdue | asaas.payment_received |
   asaas.payment_deleted | asaas.payment_updated`, `p_entity_kind='asaas_webhook'`, payload
   sanitizado (sem `cpfCnpj`, sem `creditCard`).
7. 200. Erro de processamento → `webhook_events_log.status='error'`, nunca 5xx.

`PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` colapsam em `asaas.payment_received`; `PAYMENT_REFUNDED`
em `asaas.payment_deleted` (para o retorno, os dois significam "não há mais o que cobrar").

## 8. Consumidor e retorno

`lib/asaas/consumidor.handler.ts`, registrado em `lib/event-log/register-handlers.ts` (modelo:
`gatilho-caso.handler.ts` — cria e cancela na mesma peça). O consumidor é idempotente por
`asaas_charges` (upsert por `(org, payment_id)` com `last_event_at`), então uma duplicata que
escape do índice único não gera segunda matrícula.

- `asaas.payment_overdue`:
  1. Upsert em `asaas_charges` (`status`, `due_date`, `value_cents`, `customer_id`).
  2. Titular por `asaas_customer_id`: primeiro `crm_companies`, depois `contacts` (§5.2a). Sem
     titular → `charge_unmatched` (1 por customer, `ref_id` = customer id); fim. Grava
     `holder_kind`/`holder_id`.
  3. Destinatário: empresa → `billing_contact_id` (nulo → `charge_overdue_no_flow` com o nome da
     empresa; fim); pessoa física → o próprio contato.
  4. Já existe `enrollment_id` vivo para esta cobrança → nada (reenvio ou reconciliação). Senão
     `enrollFollowupFlow` no `followup_pointer_id` da config, `actorUserId=null`. Antes, o consumidor
     repete a checagem de §5.1 (pointer ativo, kind `webhook`, agente com as tools) — a config pode
     ter apodrecido depois de salva; falhou → `charge_overdue_no_flow` (1 por org por dia).
  5. Resultado `409 conflict` (contato já em outro retorno — o índice `one_live` é por contato na
     org, **não** por fluxo) → atividade `charge_waiting_slot` no lead desse contato,
     `enrollment_id` nulo; o cron de §9 tenta de novo no dia seguinte. **A pendência não expulsa o
     retorno em curso**: o outro
     fluxo pode ser um no-show de consulta marcada, e derrubar isso por um boleto é decisão que o
     produto não toma sozinho.
  6. Exceção de `beginServiceAtOrigin` (`service_channel_not_found`: contato nunca conversou e a org
     não tem canal `WORKING`) → `charge_overdue_no_flow` com o texto real.
  7. Sucesso → `enrollment_id` gravado; atividade `charge_overdue` no lead do contato.
- `asaas.payment_received` / `payment_deleted`:
  1. Upsert do status.
  2. Se a cobrança tem `enrollment_id` vivo: consulta ao vivo `OVERDUE` do customer. **Se a chamada
     ao Asaas falhar, cancela mesmo assim** (o evento diz que pagou; errar para "parar de cobrar" é o
     lado seguro) e registra o erro na atividade. Se restam vencidas, mantém; senão cancela com
     `cancel_reason='charge_settled'`.
  3. Atividade `charge_paid` / `charge_deleted` no lead do contato matriculado.
- `asaas.payment_updated`: se `dueDate` mudou e não há `asaas_charge_actions` com essa
  `new_due_date` → atividade `charge_due_changed` (o dono prorrogou no painel).

**Corrida "cobra quem já pagou":** o envio do retorno sai antes do guard de cancelamento
(`lib/agent-engine/agent/followup-turn.ts:359-371`; o guard de `turn-bridge.ts:88` só descarta o
resultado tardio). Um turno já em voo quando o pagamento chega pode falar. Mitigações, em ordem:
(a) o nó `ai_message` obriga o agente a chamar `crm_list_contact_charges` e a **não falar de
pendência com lista vazia** — é o que fecha a maioria dos casos; (b) `text` fixo é desaconselhado na
tela (§5.1); (c) o residual (pagou entre a consulta e o envio, segundos) fica documentado como
limite conhecido. Não há variável `{{valor}}` em template, e não haverá.

`cancel_on_reply` do gatilho `webhook` cancela só matrícula em `waiting_reply`; em `active` o
inbound acorda o fluxo. Se o cliente escreve antes da primeira mensagem, o fluxo ainda fala — com
as ferramentas ligadas o agente responde ao que o cliente disse e consulta o Asaas ao vivo, então
o comportamento é o do atendimento normal. Aceito.

Janela 7h–22h, throttle e opt-out: os do canal, sem exceção para pendência financeira.

## 9. Cron `asaas-reconcile` (diário)

Linha nova em `docker/scheduler/entrypoint.sh` (gate `cron-routes-scheduled.test.ts`) → **a imagem
`scheduler` é republicada pelo CI**; §13 lista. Para cada org `provider='asaas'` e `status='healthy'`:

1. `GET /payments?status=OVERDUE` paginado. Para cada cobrança sem `asaas_charges.enrollment_id`
   vivo → emite `asaas.payment_overdue` (`p_entity_kind='asaas_reconcile'`). Cobre webhook perdido
   **e** o `409` do dia anterior.
2. `GET /payments?status=RECEIVED&paymentDate[ge]=<ontem>` (medição 1 de §3; se o filtro não
   existir, varre `asaas_charges` com `enrollment_id` vivo e consulta cada `payment_id`) → emite
   `asaas.payment_received` para as que ainda constam `OVERDUE` em `asaas_charges`.
3. `GET /webhooks`: procura o que tem a nossa URL. Ausente → `charge_webhook_paused` ("webhook não
   cadastrado no Asaas; a URL está na tela"), 1 por dia. `interrupted:true` → `PUT /webhooks/{id}`
   `{ interrupted:false }` + `charge_webhook_paused` ("o Asaas pausou os avisos após falhas;
   religado") — o operador precisa saber que perdeu eventos.
4. `401` → `status='error'`, `status_reason`, item na Central. Não insiste até o admin corrigir.

Audita só quando emitiu algo (`cron-audita-so-quando-ha-efeito` varre a rota).

## 10. Central e navegação

- `agent_inbox_items.kind`: `charge_unmatched`, `charge_overdue_no_flow`, `charge_reissue_failed`,
  `charge_webhook_paused`. Cada um entra em `InboxKind` (`lib/agent-engine/db/repository.ts`),
  `KIND_LABEL` (`lib/ai/agent-inbox-copy.ts`, `satisfies Record<InboxKind,string>`) e
  `inbox-destino.ts` (destino: a tela do módulo, ou o contato quando há). `charge_unmatched` tem
  ação na própria Central: "vincular a um contato" (busca por nome/telefone, grava
  `asaas_customer_id`, audit `asaas.contact_linked`).
- `lib/navigation/catalogo.ts`: entrada `/app/integrations/asaas` no grupo **`organizacao`**
  (não existe grupo "integrações"; Nuvemshop vive em `canais` sem sidebar), papel `admin`.
- `lib/navigation/catalogo.ts`: entrada `/app/companies` ("Empresas") no grupo `crm`, ao lado de
  Contatos, `sidebar: true`, papel `agent`.
- `docs/architecture/`: peça `asaas` com arestas para `tenant_integrations`, `event_log`,
  `followup`, `agent_inbox_items`, `mcp_tools`, `asaas_charges`; peça `companies` com arestas para
  `contacts`, `crm_lead_links`, `asaas`.

## 11. Laço de retorno (invariante 7) e o que fica ao desligar

| quando erra | o que o sistema faz |
|---|---|
| chave inválida / revogada | `status='error'` + Central; ferramentas somem do turno; tela mostra o motivo |
| webhook com token errado | 401 + audit; nada entra |
| Asaas pausou a fila | cron religa; Central sabe |
| cobrança vencida sem contato | `charge_unmatched` com botão de vincular |
| documento informado não confere com o telefone | não vincula; `charge_unmatched`; agente diz que não confere |
| reemissão recusada pelo Asaas | texto real ao cliente pelo agente; erro nosso → Central |
| agente tenta reemitir além da cerca | recusa com contagem; oferece humano |
| contato já em outro retorno | `charge_waiting_slot`; cron tenta amanhã |
| contato sem canal para falar | `charge_overdue_no_flow` com o texto real |

**Ao desativar o módulo:** as três ferramentas somem do turno (set de integrações vazio) — os ids
continuam gravados no agente, com a etiqueta "requer Asaas ativo" na tela; o webhook responde 200
sem processar; o cron pula a org. **Matrículas vivas ligadas a cobranças são canceladas** com
`cancel_reason='asaas_disabled'` e atividade no lead — o motor de retorno não sabe de integração
(`lib/followup/engine.ts:425-437`) e mandaria a mensagem; deixá-las rodar com o agente sem as
ferramentas produziria exatamente a alucinação de valor que a spec quer impedir. A tela avisa
quantas vai cancelar antes de confirmar.

## 12. Testes

**Unit (`pnpm test:unit`)**
- `lib/asaas/cliente.test.ts`: URL por ambiente, header, parse de `errors[]` com `code`, timeout,
  nunca loga a chave.
- `lib/asaas/mapeamento.test.ts`: webhook → evento interno; sanitização remove `cpfCnpj`/`creditCard`
  do `raw_body` e do `payload_parsed`; `RECEIVED`/`CONFIRMED` colapsam.
- `lib/mcp/tools/financeiro.test.ts`: `needs_document`; vínculo recusado quando o telefone do
  customer não bate; recusa de reemissão por status, por cerca, por cobrança de outro customer;
  `new_due_date` no fuso da org; atividade emitida com evidência; `document` redigido no audit.
- `lib/asaas/consumidor.test.ts`: uma matrícula para duas vencidas; `409` → `charge_waiting_slot`;
  `service_channel_not_found` → Central; cancela quando não resta vencida **e** quando o Asaas
  falha; `charge_unmatched` quando não casa; `payment_updated` de terceiros vira atividade.
- Rota do webhook: 200 inerte desligado, 401 assinatura, header do segredo ausente do log, 200 em
  erro de processamento.
- `pickToolsFromMcp`: ids gravados + set vazio → nenhuma das três vai ao modelo (o teste que
  mockasse `catalogoComHandler` passaria com a feature quebrada — este é o que vale).
- Cron: emite só o que faltou; audita só com efeito; linha no `entrypoint.sh`.
- Catálogo: `entraPorPacote` recusa `requerIntegracao`; texto passa no gate leigo;
  `mcp-retencao-tools` com nove.
- Tela: `manager` recebe 403; salvar com fluxo cujo agente não tem as tools é recusado.
- `mapas-de-arquitetura`, `navegacao-completude`, `kind-check-migration-x-baseline`,
  `audit-lista-do-painel-e-derivada` verdes com as peças novas.

**Invariantes (`pnpm test:db`)**: RLS de `asaas_charges` e `asaas_charge_actions` entre 2 orgs;
índice único do webhook com **dois INSERTs** iguais (o segundo tem de falhar — um request sequencial
passaria sem índice); CHECKs reconstruídos com todos os valores; baseline `install` e `update`.

**Na VPS (regra da conta: nada local)**: sandbox Asaas; cobrança com `dueDate` no passado; webhook
real no domínio da VPS; agente Lina com as três capacidades ligadas respondendo pelo WhatsApp de
teste: consulta (pede CPF, confere telefone), manda boleto, prorroga, cliente paga no sandbox,
matrícula encerra; desativar o módulo com matrícula viva cancela. Evidência em
`.superpowers/evidence/asaas/`. Sem esse roteiro rodado, o status é **não validado**.

## 13. Entrega

- Tripla de migration `0260` + apêndice + MANIFEST; `lib/database.types.ts` regenerado. A
  migration cobre as duas peças (empresas e Asaas) — é um PR só, mas o código de empresas vive em
  `lib/companies/` + `app/app/companies/` + `app/api/v1/companies/`, sem import de `lib/asaas/`;
  o inverso (Asaas importa empresas) é permitido.
- Gate `tests/unit/empresas-sao-aditivas.test.ts` (§5.2a).
- `.changes/bacco-asaas.md`: `impacto: capacidade_nova`, `secao: adicionado`, `titulo: ...`.
- Linha no `docker/scheduler/entrypoint.sh` → imagem `scheduler` republicada.
- `.env.example` **não muda**: nenhuma env nova.
- `docs/superpowers/specs/asaas-sandbox-medido-crm.md` com as 5 medições de §3.
- Issue própria: `encrypt_cpf` ausente + CHECK `contacts_cpf_consistency` quebra cadastro com CPF
  em VPS fresca (achado do refutador, fora deste módulo).
- Runbook no vault `projetos/bacco-crm/runbooks/asaas.md` com o que só se descobre operando.
