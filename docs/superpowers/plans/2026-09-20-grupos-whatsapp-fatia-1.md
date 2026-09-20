# Grupos de WhatsApp — Fatia 1 (ver e administrar à mão) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao operador um painel onde ele vê os grupos de WhatsApp da organização, vê os membros com papel e telefone, e executa remover/promover/rebaixar pela tela — com o resultado verificado por pós-condição, nunca pelo status HTTP.

**Architecture:** Subsistema paralelo. Tabelas próprias (`whatsapp_groups`, `whatsapp_group_members`, `whatsapp_group_actions`); `conversations` não é tocada e `is_group` continua morta. Sincronização por evento (`group.v2.*`), nunca por polling. Toda ação que toca o WhatsApp passa por `event_log` + worker (trigger nunca faz HTTP) e só vira `concluida` depois de reler `participants/v2` e confirmar o efeito.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript estrito, Supabase (Postgres + RLS), Zod, Vitest, Playwright, WAHA 2026.7.2 engine NOWEB.

**Spec:** `docs/superpowers/specs/2026-09-20-grupos-whatsapp-design.md`

## Global Constraints

- **Multi-tenancy:** `organization_id uuid not null references organizations(id) on delete cascade` em toda tabela nova. RLS `tenant_isolation_<tabela>_all` via `fn_user_org_ids()`. Handler com admin client filtra `organization_id` manualmente, resolvido de fonte confiável — **nunca do body**.
- **Migrations:** tripla obrigatória — arquivo em `supabase/migrations/<timestamp>_<NNNN>_<slug>.sql` + apêndice idempotente em `supabase/baseline.sql` + linha em `supabase/migrations/MANIFEST.md`. Próximo `NNNN` = **0269** (medido: `ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1` → `0268`). Sem `BEGIN`/`COMMIT` explícito. Idempotente (`if not exists`, `create or replace`).
- **Função nova em `public`:** termina com `revoke execute on function public.fn_x(...) from public, anon;` **e** `grant execute ... to <só quem precisa>` — são duas origens distintas de EXECUTE.
- **`type`/vocabulário:** `text` + CHECK, nunca enum. Exceção: coluna de vocabulário ABERTO (`whatsapp_group_infractions.regra`) fica **sem** CHECK e fora de `tests/invariants/vocabulario-banco-x-typescript.test.ts`.
- **API:** `/api/v1/`, JSON snake_case, helpers `ok()`/`fail()` de `lib/api/wrappers.ts`, códigos de `lib/api/errors.ts`, Zod em todo input externo.
- **Erro externo chega cru ao usuário** (Regra Nº 1): o `451`/`404` do WAHA e o corpo da resposta aparecem na tela. Nunca "falha na operação".
- **Trigger Postgres NUNCA faz HTTP.** Side effect sai por `event_log` + worker.
- **Sem `console.log`** em código merged.
- **Node 22:** rodar `nvm use` antes de qualquer `pnpm` (o shell abre em Node 20 e dá falso vermelho).
- **Tela nova declara porta** em `lib/navigation/catalogo.ts` (`NAV_CATALOG`), senão `tests/unit/navegacao-completude.test.ts` reprova.
- **Suíte:** `pnpm test:unit` **sem caminho** (alcança o repo inteiro). Invariantes: `pnpm test:db`. Não cortar saída com `| tail`; redirecionar e comparar rodapé, `grep FAIL` e `exit code`.
- **Fragmento em `.changes/`** declarando efeito no operador (`nada_mudou` / `capacidade_nova` / `exige_acao`), conferido com `pnpm release:conferir`.

## Contratos medidos do WAHA (não inventar)

Medido em 2026-09-20 contra a instalação real. Evidência: `.superpowers-capturas-grupo.jsonl`.

```
# mensagem em grupo (message.any)
payload.from        = "1203…@g.us"      ← o GRUPO
payload.participant = "2242…@lid"        ← o AUTOR (topo; `author` NÃO existe)
payload._data.key.participantAlt = "554891286399@s.whatsapp.net"  ← telefone
payload._data.pushName           = "Lussa"

# GET /api/{session}/groups/{gid}/participants/v2  →  200
[{"id":"…@lid","pn":"554891972220@c.us","role":"superadmin"}]
# role ∈ participant | admin | superadmin | left

# POST .../participants/remove | /add | /admin/promote | /admin/demote  →  SEMPRE 200
[{"status":"451","jid":"…@s.whatsapp.net","content":{"tag":"participant","attrs":{"error":"451"}}}]
# status "200"=ok · "451"=jid inválido · "404"=não é membro · array POR participante

# PUT .../settings/security/{messages-admin-only|info-admin-only|member-add-mode} → 200, corpo VAZIO
# efeito só confirmável relendo GET /groups/{gid}: announce / restrict / memberAddMode

# group.v2.update  →  payload.group.participants = lista COMPLETA [{id, pn, role}]
# group.v2.participants → payload.type ∈ join|leave|promote|demote, participants=[{id,role}]
```

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/…_0269_grupos_whatsapp.sql` | as 3 tabelas + RLS + índices |
| `lib/grupos/tipos.ts` | tipos e constantes compartilhadas (papéis, ações, status) |
| `lib/grupos/waha-resposta.ts` | **puro** — interpreta o array de status do WAHA |
| `lib/grupos/sincronizar.ts` | aplica `group.v2.*` nas tabelas (I/O) |
| `lib/grupos/executar-acao.ts` | chama WAHA + verifica pós-condição (I/O) |
| `lib/waha/client-grupos.ts` | wrapper HTTP das rotas de grupo |
| `app/api/v1/groups/route.ts` | GET lista |
| `app/api/v1/groups/[id]/route.ts` | GET detalhe, PATCH settings |
| `app/api/v1/groups/[id]/members/route.ts` | GET membros |
| `app/api/v1/groups/[id]/actions/route.ts` | POST ação manual |
| `app/app/grupos/page.tsx` + `[id]/` | as telas |
| `lib/navigation/catalogo.ts` | porta das telas |

---

### Task 1: Schema — as três tabelas

**Files:**
- Create: `supabase/migrations/20260920120000_0269_grupos_whatsapp.sql`
- Modify: `supabase/baseline.sql` (apêndice no fim)
- Modify: `supabase/migrations/MANIFEST.md`
- Test: `tests/invariants/grupos-isolamento-entre-orgs.test.ts`

**Interfaces:**
- Consumes: `organizations(id)`, `channel_sessions(id)`, `contacts(id)`, `fn_user_org_ids()`
- Produces: tabelas `whatsapp_groups`, `whatsapp_group_members`, `whatsapp_group_actions` com as colunas exatas abaixo — Tasks 2–9 dependem destes nomes

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260920120000_0269_grupos_whatsapp.sql`:

```sql
-- 0269 — Grupos de WhatsApp: administração e moderação (fatia 1).
--
-- Subsistema PARALELO: `conversations` não é tocada e `is_group` continua
-- morta de propósito (ver spec 2026-09-20-grupos-whatsapp-design.md §4.1).
-- Grupo fora do funil é ESTRUTURA aqui, não uma sequência de `if`.

create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  wa_group_id text not null,
  subject text,
  description text,
  owner_lid text,
  owner_pn text,
  created_at_wa timestamptz,
  size int,
  announce boolean not null default false,
  restrict_info boolean not null default false,
  member_add_mode boolean not null default true,
  join_approval_mode boolean not null default false,
  somos_admin boolean not null default false,
  modo text not null default 'vigiado' check (modo in ('vigiado','semi','autonomo')),
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel_session_id, wa_group_id)
);

create table if not exists public.whatsapp_group_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  wa_lid text not null,
  wa_pn text,
  push_name text,
  role text not null default 'participant'
    check (role in ('participant','admin','superadmin','left')),
  contact_id uuid references public.contacts(id) on delete set null,
  strikes int not null default 0,
  silenciado_ate timestamptz,
  entrou_em timestamptz,
  saiu_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_id, wa_lid)
);

create table if not exists public.whatsapp_group_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  member_id uuid references public.whatsapp_group_members(id) on delete set null,
  acao text not null check (acao in ('remover','promover','rebaixar','silenciar','avisar','advertir')),
  decidido_por text not null check (decidido_por in ('ia','humano','regra')),
  aprovado_por_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pendente'
    check (status in ('pendente','executando','concluida','falhou','revertida','cancelada')),
  waha_http_status int,
  waha_status_participante text,
  waha_resposta jsonb,
  pos_condicao_ok boolean,
  erro_texto text,
  executada_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_groups_org on public.whatsapp_groups (organization_id, updated_at desc);
create index if not exists idx_wa_group_members_group on public.whatsapp_group_members (organization_id, group_id);
create index if not exists idx_wa_group_actions_group on public.whatsapp_group_actions (organization_id, group_id, created_at desc);
create index if not exists idx_wa_group_actions_pendentes on public.whatsapp_group_actions (organization_id, created_at)
  where status in ('pendente','executando');

alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_group_members enable row level security;
alter table public.whatsapp_group_actions enable row level security;

drop policy if exists tenant_isolation_whatsapp_groups_all on public.whatsapp_groups;
create policy tenant_isolation_whatsapp_groups_all on public.whatsapp_groups
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_whatsapp_group_members_all on public.whatsapp_group_members;
create policy tenant_isolation_whatsapp_group_members_all on public.whatsapp_group_members
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_whatsapp_group_actions_all on public.whatsapp_group_actions;
create policy tenant_isolation_whatsapp_group_actions_all on public.whatsapp_group_actions
  for all using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));
```

Nota sobre `restrict_info`: a coluna **não** se chama `restrict` porque `restrict` é palavra reservada em SQL. O campo do WAHA é `restrict`; o mapeamento fica em `lib/grupos/tipos.ts` (Task 2).

- [ ] **Step 2: Copiar o mesmo bloco para o apêndice do baseline**

Acrescentar no FIM de `supabase/baseline.sql`, precedido do rótulo do padrão:

```sql
-- ---- grupos de whatsapp (migration 0269) ----
```

seguido do conteúdo integral do Step 1. É o que o `install.sh` e o `update.sh` do self-hoster aplicam — sem isto a mudança não chega a clone nenhum.

- [ ] **Step 3: Registrar no MANIFEST**

Acrescentar linha na tabela "Applied" de `supabase/migrations/MANIFEST.md`:

```
| 20260920120000_0269 | grupos_whatsapp | Tabelas de grupo, membro e ação de grupo + RLS. Subsistema paralelo: não toca `conversations`. |
```

- [ ] **Step 4: Escrever o teste de isolamento (vai falhar)**

Criar `tests/invariants/grupos-isolamento-entre-orgs.test.ts`, seguindo o padrão dos vizinhos em `tests/invariants/` (ler `tests/invariants/envio-nao-alcanca-conversa-de-outro-tenant.test.ts` primeiro para copiar o helper de conexão e de criação de org):

```ts
import { describe, expect, it } from "vitest";
import { comBancoDeTeste, criarOrganizacao } from "./_helpers";

describe("grupos: isolamento entre organizações", () => {
  it("org A não enxerga grupo da org B sob RLS", async () => {
    await comBancoDeTeste(async (db) => {
      const orgA = await criarOrganizacao(db, "A");
      const orgB = await criarOrganizacao(db, "B");

      await db.query(
        `insert into whatsapp_groups (organization_id, channel_session_id, wa_group_id, subject)
         values ($1, $2, '1203@g.us', 'Grupo da B')`,
        [orgB.id, orgB.channelSessionId],
      );

      const comoA = await db.comoUsuarioDaOrg(orgA.id);
      const r = await comoA.query("select id from whatsapp_groups");
      expect(r.rows).toHaveLength(0);
    });
  });

  it("membro de grupo também não vaza entre orgs", async () => {
    await comBancoDeTeste(async (db) => {
      const orgA = await criarOrganizacao(db, "A");
      const orgB = await criarOrganizacao(db, "B");

      const g = await db.query(
        `insert into whatsapp_groups (organization_id, channel_session_id, wa_group_id)
         values ($1, $2, '1203@g.us') returning id`,
        [orgB.id, orgB.channelSessionId],
      );
      await db.query(
        `insert into whatsapp_group_members (organization_id, group_id, wa_lid, wa_pn)
         values ($1, $2, '999@lid', '5548999@c.us')`,
        [orgB.id, g.rows[0].id],
      );

      const comoA = await db.comoUsuarioDaOrg(orgA.id);
      const r = await comoA.query("select id from whatsapp_group_members");
      expect(r.rows).toHaveLength(0);
    });
  });
});
```

Se os helpers `comBancoDeTeste`/`criarOrganizacao`/`comoUsuarioDaOrg` tiverem outro nome no repo, **usar os nomes reais** — ler um invariante existente antes de escrever este.

- [ ] **Step 5: Rodar e ver falhar**

```bash
nvm use && pnpm test:db 2>&1 | tee /tmp/db1.log; echo "exit=$?"
```

Esperado: FAIL — `relation "whatsapp_groups" does not exist`.

- [ ] **Step 6: Aplicar e ver passar**

```bash
nvm use && pnpm test:db > /tmp/db2.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/db2.log | tail -3
```

Esperado: exit=0, sem `failed`. O `scripts/test-db.sh` aplica o `baseline.sql` em modo install **e** update — se o apêndice do Step 2 não for idempotente, o modo update quebra aqui.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260920120000_0269_grupos_whatsapp.sql supabase/baseline.sql supabase/migrations/MANIFEST.md tests/invariants/grupos-isolamento-entre-orgs.test.ts
git commit -m "feat(grupos): tabelas de grupo, membro e ação com RLS por organização"
```

---

### Task 2: Tipos e o interpretador puro da resposta do WAHA

**Files:**
- Create: `lib/grupos/tipos.ts`
- Create: `lib/grupos/waha-resposta.ts`
- Test: `lib/grupos/waha-resposta.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem I/O)
- Produces:
  - `type PapelDeMembro = "participant" | "admin" | "superadmin" | "left"`
  - `type AcaoDeGrupo = "remover" | "promover" | "rebaixar" | "silenciar" | "avisar" | "advertir"`
  - `interface ResultadoPorParticipante { jid: string; status: string; ok: boolean; motivo: string | null }`
  - `function interpretarRespostaDeParticipantes(corpo: unknown): ResultadoPorParticipante[]`
  - `function motivoLegivel(status: string): string`

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `lib/grupos/waha-resposta.test.ts`. Os corpos abaixo são **capturas reais** da produção:

```ts
import { describe, expect, it } from "vitest";
import { interpretarRespostaDeParticipantes, motivoLegivel } from "./waha-resposta";

describe("interpretarRespostaDeParticipantes", () => {
  it("lê 451 como falha de jid inválido", () => {
    const corpo = [
      {
        status: "451",
        jid: "5548991286399@s.whatsapp.net",
        content: { tag: "participant", attrs: { jid: "5548991286399@s.whatsapp.net", error: "451" } },
      },
    ];
    expect(interpretarRespostaDeParticipantes(corpo)).toEqual([
      { jid: "5548991286399@s.whatsapp.net", status: "451", ok: false, motivo: "número inválido ou inexistente no WhatsApp" },
    ]);
  });

  it("lê 404 como não-é-membro", () => {
    const corpo = [{ status: "404", jid: "2538@lid", content: { tag: "participant", attrs: { error: "404" } } }];
    const r = interpretarRespostaDeParticipantes(corpo);
    expect(r[0].ok).toBe(false);
    expect(r[0].motivo).toBe("não é membro do grupo");
  });

  it("lê 200 como sucesso", () => {
    const corpo = [{ status: "200", jid: "2242@lid", content: { tag: "participant", attrs: {} } }];
    expect(interpretarRespostaDeParticipantes(corpo)[0]).toMatchObject({ ok: true, motivo: null });
  });

  it("sucesso PARCIAL: um ok e um falho no mesmo array", () => {
    const corpo = [
      { status: "200", jid: "a@lid" },
      { status: "451", jid: "b@lid" },
    ];
    const r = interpretarRespostaDeParticipantes(corpo);
    expect(r.map((x) => x.ok)).toEqual([true, false]);
  });

  it("corpo vazio devolve lista vazia, não lança", () => {
    expect(interpretarRespostaDeParticipantes([])).toEqual([]);
    expect(interpretarRespostaDeParticipantes(null)).toEqual([]);
    expect(interpretarRespostaDeParticipantes({ inesperado: true })).toEqual([]);
  });

  it("status desconhecido não é dado como sucesso", () => {
    const r = interpretarRespostaDeParticipantes([{ status: "999", jid: "x@lid" }]);
    expect(r[0].ok).toBe(false);
    expect(r[0].motivo).toContain("999");
  });
});

describe("motivoLegivel", () => {
  it("nunca devolve string vazia", () => {
    for (const s of ["200", "404", "451", "403", "", "abc"]) {
      expect(motivoLegivel(s).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run lib/grupos/waha-resposta.test.ts
```

Esperado: FAIL — `Cannot find module './waha-resposta'`.

- [ ] **Step 3: Escrever `lib/grupos/tipos.ts`**

```ts
/**
 * Vocabulário compartilhado do módulo de grupos.
 *
 * Constante, nunca string literal no emissor: é o que permite ao
 * invariante de vocabulário conferir banco × TypeScript nas colunas que
 * TÊM check (papel e ação têm; `infractions.regra` NÃO tem, de propósito).
 */

export const PAPEIS_DE_MEMBRO = ["participant", "admin", "superadmin", "left"] as const;
export type PapelDeMembro = (typeof PAPEIS_DE_MEMBRO)[number];

export const ACOES_DE_GRUPO = ["remover", "promover", "rebaixar", "silenciar", "avisar", "advertir"] as const;
export type AcaoDeGrupo = (typeof ACOES_DE_GRUPO)[number];

export const STATUS_DE_ACAO = [
  "pendente", "executando", "concluida", "falhou", "revertida", "cancelada",
] as const;
export type StatusDeAcao = (typeof STATUS_DE_ACAO)[number];

export const MODOS_DE_GRUPO = ["vigiado", "semi", "autonomo"] as const;
export type ModoDeGrupo = (typeof MODOS_DE_GRUPO)[number];

/**
 * O WAHA chama de `restrict` o "só admin edita as informações". A coluna
 * não pode ter esse nome (palavra reservada em SQL), então o mapeamento
 * mora aqui, num lugar só.
 */
export const CAMPO_WAHA_PARA_COLUNA = {
  announce: "announce",
  restrict: "restrict_info",
  memberAddMode: "member_add_mode",
  joinApprovalMode: "join_approval_mode",
} as const;
```

- [ ] **Step 4: Escrever `lib/grupos/waha-resposta.ts`**

```ts
/**
 * Interpretação da resposta das rotas de participante do WAHA.
 *
 * ⚠️ MEDIDO EM PRODUÇÃO (2026-09-20): estas rotas devolvem **HTTP 200
 * sempre**, e o veredito real vem num array, um item por participante.
 * Um `POST /groups` chegou a devolver 201 listando um membro que o
 * `participants/v2` seguinte não mostrou. Por isso:
 *
 *   `response.ok` NÃO É PROVA DE NADA. Quem decide é este array — e,
 *   depois dele, a pós-condição (reler participants/v2).
 *
 * Evidência crua: .superpowers-capturas-grupo.jsonl
 */

export interface ResultadoPorParticipante {
  jid: string;
  status: string;
  ok: boolean;
  motivo: string | null;
}

export function motivoLegivel(status: string): string {
  switch (status) {
    case "200":
      return "ok";
    case "404":
      return "não é membro do grupo";
    case "451":
      return "número inválido ou inexistente no WhatsApp";
    case "403":
      return "sem permissão — a sessão precisa ser admin do grupo";
    default:
      return `o WhatsApp recusou com o código ${status || "(vazio)"}`;
  }
}

export function interpretarRespostaDeParticipantes(corpo: unknown): ResultadoPorParticipante[] {
  if (!Array.isArray(corpo)) return [];

  return corpo.flatMap((item): ResultadoPorParticipante[] => {
    if (!item || typeof item !== "object") return [];
    const linha = item as Record<string, unknown>;
    const status = String(linha.status ?? "");
    const jid = String(linha.jid ?? "");
    const ok = status === "200";
    return [{ jid, status, ok, motivo: ok ? null : motivoLegivel(status) }];
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
nvm use && pnpm vitest run lib/grupos/waha-resposta.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add lib/grupos/tipos.ts lib/grupos/waha-resposta.ts lib/grupos/waha-resposta.test.ts
git commit -m "feat(grupos): interpretador da resposta por participante do WAHA

O WAHA devolve 200 mesmo quando a operação falhou; o veredito vem num
array por participante (451=jid inválido, 404=não é membro). Medido em
produção, com captura real como fixture."
```

---

### Task 3: Cliente HTTP das rotas de grupo

**Files:**
- Create: `lib/waha/client-grupos.ts`
- Test: `lib/waha/client-grupos.test.ts`

**Interfaces:**
- Consumes: `TETO_PADRAO_MS` de `lib/waha/client.ts`; `PapelDeMembro` de `lib/grupos/tipos.ts`
- Produces:
  - `interface ParticipanteWaha { id: string; pn: string | null; role: PapelDeMembro }`
  - `interface GrupoWaha { id: string; subject: string | null; description: string | null; owner: string | null; ownerPn: string | null; creation: number | null; size: number | null; announce: boolean; restrict: boolean; memberAddMode: boolean; joinApprovalMode: boolean; participants: ParticipanteWaha[] }`
  - `function listarGrupos(cfg, sessao): Promise<GrupoWaha[]>`
  - `function lerParticipantes(cfg, sessao, waGroupId): Promise<ParticipanteWaha[]>`
  - `function chamarAcaoDeParticipante(cfg, sessao, waGroupId, rota, jids): Promise<{ httpStatus: number; corpo: unknown }>`
  - `type RotaDeParticipante = "participants/remove" | "participants/add" | "admin/promote" | "admin/demote"`

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `lib/waha/client-grupos.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarAcaoDeParticipante, lerParticipantes, listarGrupos } from "./client-grupos";

const cfg = { baseUrl: "http://waha:3000", apiKey: "k" };

afterEach(() => vi.unstubAllGlobals());

function respostaFalsa(corpo: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }),
  );
}

describe("listarGrupos", () => {
  it("aceita o formato OBJETO-mapa que o WAHA devolve", async () => {
    // medido: GET /groups devolve {"1203@g.us": {...}}, não um array
    const f = respostaFalsa({
      "1203@g.us": {
        id: "1203@g.us", subject: "CAPTURA CRM", creation: 1789928560,
        owner: "3564@lid", ownerPn: "554891972220@s.whatsapp.net", size: 2,
        announce: false, restrict: false, memberAddMode: false, joinApprovalMode: false,
        participants: [{ id: "3564@lid", phoneNumber: "554891972220@s.whatsapp.net", admin: "superadmin" }],
      },
    });
    vi.stubGlobal("fetch", f);

    const gs = await listarGrupos(cfg, "sessao1");
    expect(gs).toHaveLength(1);
    expect(gs[0].subject).toBe("CAPTURA CRM");
    expect(gs[0].participants[0].role).toBe("superadmin");
    expect(gs[0].participants[0].pn).toBe("554891972220@c.us");
  });

  it("aceita também o formato array", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "1@g.us", participants: [] }]));
    expect(await listarGrupos(cfg, "s")).toHaveLength(1);
  });

  it("manda a api key no header, nunca na query", async () => {
    const f = respostaFalsa({});
    vi.stubGlobal("fetch", f);
    await listarGrupos(cfg, "s");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain("k");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("k");
  });
});

describe("lerParticipantes", () => {
  it("normaliza o pn de participants/v2", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "2242@lid", pn: "554891286399@c.us", role: "participant" }]));
    const ps = await lerParticipantes(cfg, "s", "1203@g.us");
    expect(ps).toEqual([{ id: "2242@lid", pn: "554891286399@c.us", role: "participant" }]);
  });

  it("papel desconhecido vira 'participant' em vez de lançar", async () => {
    vi.stubGlobal("fetch", respostaFalsa([{ id: "x@lid", role: "chefe" }]));
    expect((await lerParticipantes(cfg, "s", "g"))[0].role).toBe("participant");
  });
});

describe("chamarAcaoDeParticipante", () => {
  it("devolve status e corpo CRUS, sem julgar", async () => {
    const corpo = [{ status: "451", jid: "x@s.whatsapp.net" }];
    vi.stubGlobal("fetch", respostaFalsa(corpo));
    const r = await chamarAcaoDeParticipante(cfg, "s", "1203@g.us", "participants/remove", ["x@c.us"]);
    expect(r.httpStatus).toBe(200);
    expect(r.corpo).toEqual(corpo);
  });

  it("monta o payload no formato participants:[{id}]", async () => {
    const f = respostaFalsa([]);
    vi.stubGlobal("fetch", f);
    await chamarAcaoDeParticipante(cfg, "s", "g@g.us", "admin/promote", ["a@c.us", "b@c.us"]);
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body).toEqual({ participants: [{ id: "a@c.us" }, { id: "b@c.us" }] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run lib/waha/client-grupos.test.ts
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `lib/waha/client-grupos.ts`:

```ts
/**
 * Rotas de grupo do WAHA. Engine NOWEB, tag 2026.7.2 (medida).
 *
 * Este módulo NÃO julga sucesso: `chamarAcaoDeParticipante` devolve status
 * e corpo crus. Quem interpreta é lib/grupos/waha-resposta.ts, e quem
 * CONFIRMA é a pós-condição em lib/grupos/executar-acao.ts. A separação é
 * deliberada: o WAHA responde 200 para operação que não aconteceu.
 */
import { TETO_PADRAO_MS } from "@/lib/waha/client";
import { PAPEIS_DE_MEMBRO, type PapelDeMembro } from "@/lib/grupos/tipos";

export interface ConfigWaha {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface ParticipanteWaha {
  id: string;
  pn: string | null;
  role: PapelDeMembro;
}

export interface GrupoWaha {
  id: string;
  subject: string | null;
  description: string | null;
  owner: string | null;
  ownerPn: string | null;
  creation: number | null;
  size: number | null;
  announce: boolean;
  restrict: boolean;
  memberAddMode: boolean;
  joinApprovalMode: boolean;
  participants: ParticipanteWaha[];
}

export type RotaDeParticipante =
  | "participants/remove"
  | "participants/add"
  | "admin/promote"
  | "admin/demote";

async function pedir(cfg: ConfigWaha, caminho: string, metodo = "GET", corpo?: unknown) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), cfg.timeoutMs ?? TETO_PADRAO_MS);
  try {
    const r = await fetch(`${cfg.baseUrl}${caminho}`, {
      method: metodo,
      headers: { "X-Api-Key": cfg.apiKey, "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controle.signal,
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = texto;
    }
    return { httpStatus: r.status, corpo: json };
  } finally {
    clearTimeout(relogio);
  }
}

/** `5548…@s.whatsapp.net` e `5548…@c.us` são o mesmo endereço em roupas diferentes. */
function normalizarPn(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto) return null;
  return bruto.replace("@s.whatsapp.net", "@c.us");
}

function normalizarPapel(bruto: unknown): PapelDeMembro {
  const v = typeof bruto === "string" ? bruto : "";
  return (PAPEIS_DE_MEMBRO as readonly string[]).includes(v) ? (v as PapelDeMembro) : "participant";
}

function normalizarGrupo(bruto: Record<string, unknown>): GrupoWaha {
  const participantes = Array.isArray(bruto.participants) ? bruto.participants : [];
  return {
    id: String(bruto.id ?? ""),
    subject: (bruto.subject as string) ?? null,
    description: (bruto.description as string) ?? null,
    owner: (bruto.owner as string) ?? null,
    ownerPn: normalizarPn(bruto.ownerPn),
    creation: typeof bruto.creation === "number" ? bruto.creation : null,
    size: typeof bruto.size === "number" ? bruto.size : null,
    announce: Boolean(bruto.announce),
    restrict: Boolean(bruto.restrict),
    memberAddMode: Boolean(bruto.memberAddMode),
    joinApprovalMode: Boolean(bruto.joinApprovalMode),
    participants: participantes.map((p) => {
      const item = (p ?? {}) as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        // `GET /groups` usa `phoneNumber`; `participants/v2` usa `pn`. Medido.
        pn: normalizarPn(item.pn ?? item.phoneNumber),
        role: normalizarPapel(item.role ?? item.admin ?? "participant"),
      };
    }),
  };
}

export async function listarGrupos(cfg: ConfigWaha, sessao: string): Promise<GrupoWaha[]> {
  const { corpo } = await pedir(cfg, `/api/${sessao}/groups?limit=200`);
  if (!corpo || typeof corpo !== "object") return [];
  // Medido: o WAHA devolve um OBJETO-mapa {chatId: grupo}, não um array.
  const lista = Array.isArray(corpo) ? corpo : Object.values(corpo as Record<string, unknown>);
  return lista
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === "object")
    .map(normalizarGrupo);
}

export async function lerParticipantes(
  cfg: ConfigWaha,
  sessao: string,
  waGroupId: string,
): Promise<ParticipanteWaha[]> {
  const { corpo } = await pedir(cfg, `/api/${sessao}/groups/${waGroupId}/participants/v2`);
  if (!Array.isArray(corpo)) return [];
  return corpo
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: String(p.id ?? ""),
      pn: normalizarPn(p.pn ?? p.phoneNumber),
      role: normalizarPapel(p.role ?? p.admin),
    }));
}

export async function chamarAcaoDeParticipante(
  cfg: ConfigWaha,
  sessao: string,
  waGroupId: string,
  rota: RotaDeParticipante,
  jids: string[],
): Promise<{ httpStatus: number; corpo: unknown }> {
  return pedir(cfg, `/api/${sessao}/groups/${waGroupId}/${rota}`, "POST", {
    participants: jids.map((id) => ({ id })),
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
nvm use && pnpm vitest run lib/waha/client-grupos.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/waha/client-grupos.ts lib/waha/client-grupos.test.ts
git commit -m "feat(grupos): cliente HTTP das rotas de grupo do WAHA

GET /groups devolve objeto-mapa (não array) e usa `phoneNumber`, enquanto
participants/v2 usa `pn` — as duas formas normalizadas num lugar só."
```

---

### Task 4: Executar ação com pós-condição — o invariante central

**Files:**
- Create: `lib/grupos/executar-acao.ts`
- Test: `lib/grupos/executar-acao.test.ts`

**Interfaces:**
- Consumes: `chamarAcaoDeParticipante`, `lerParticipantes` (Task 3); `interpretarRespostaDeParticipantes` (Task 2)

⚠️ **As assinaturas não batem de propósito.** A Task 3 expõe
`chamarAcaoDeParticipante(cfg, sessao, waGroupId, rota, jids)` — com `cfg`
primeiro. `DepsDaAcao` aqui pede `chamarAcao(sessao, waGroupId, rota, jids)`,
**sem `cfg`**. A injeção fecha o `cfg` no chamador (Task 7), e é isso que
permite testar este módulo sem rede:

```ts
const deps = {
  chamarAcao: (s, g, r, j) => chamarAcaoDeParticipante(cfg, s, g, r, j),
  lerParticipantes: (s, g) => lerParticipantes(cfg, s, g),
};
```
- Produces:
  - `interface ResultadoDaAcao { httpStatus: number; statusParticipante: string | null; respostaCrua: unknown; posCondicaoOk: boolean; erroTexto: string | null }`
  - `function executarAcaoDeGrupo(deps, entrada): Promise<ResultadoDaAcao>`
  - `function esperadoDepoisDe(acao, papelAtual): { presente: boolean; papel?: PapelDeMembro }`

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `lib/grupos/executar-acao.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { executarAcaoDeGrupo } from "./executar-acao";

const ALVO = "2242@lid";

function deps(opts: {
  resposta?: { httpStatus: number; corpo: unknown };
  membrosDepois: { id: string; pn: string | null; role: string }[];
}) {
  return {
    chamarAcao: vi.fn().mockResolvedValue(opts.resposta ?? { httpStatus: 200, corpo: [{ status: "200", jid: ALVO }] }),
    lerParticipantes: vi.fn().mockResolvedValue(opts.membrosDepois),
  } as never;
}

describe("executarAcaoDeGrupo — pós-condição manda", () => {
  it("remover: só é ok quando o membro SUMIU da lista", async () => {
    const r = await executarAcaoDeGrupo(deps({ membrosDepois: [] }), {
      acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant",
    });
    expect(r.posCondicaoOk).toBe(true);
    expect(r.erroTexto).toBeNull();
  });

  it("remover: HTTP 200 + status 200, mas membro AINDA na lista => NÃO ok", async () => {
    // este é o caso medido em produção: a resposta mente
    const r = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: "554@c.us", role: "participant" }] }),
      { acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant" },
    );
    expect(r.posCondicaoOk).toBe(false);
    expect(r.erroTexto).toContain("continua no grupo");
  });

  it("451 no array: falha, com o motivo legível", async () => {
    const r = await executarAcaoDeGrupo(
      deps({
        resposta: { httpStatus: 200, corpo: [{ status: "451", jid: "554@s.whatsapp.net" }] },
        membrosDepois: [{ id: ALVO, pn: "554@c.us", role: "participant" }],
      }),
      { acao: "remover", waGroupId: "g@g.us", sessao: "s", alvoLid: ALVO, alvoJid: "554@c.us", papelAtual: "participant" },
    );
    expect(r.posCondicaoOk).toBe(false);
    expect(r.statusParticipante).toBe("451");
    expect(r.erroTexto).toContain("número inválido");
  });

  it("promover: ok só quando o papel virou admin", async () => {
    const ok = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "admin" }] }),
      { acao: "promover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(ok.posCondicaoOk).toBe(true);

    const nao = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "promover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(nao.posCondicaoOk).toBe(false);
  });

  it("rebaixar: ok quando deixou de ser admin", async () => {
    const r = await executarAcaoDeGrupo(
      deps({ membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "rebaixar", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "admin" },
    );
    expect(r.posCondicaoOk).toBe(true);
  });

  it("silenciar NÃO chama o WAHA (é estado só do CRM)", async () => {
    const d = deps({ membrosDepois: [] });
    const r = await executarAcaoDeGrupo(d, {
      acao: "silenciar", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant",
    });
    expect((d as unknown as { chamarAcao: ReturnType<typeof vi.fn> }).chamarAcao).not.toHaveBeenCalled();
    expect(r.posCondicaoOk).toBe(true);
  });

  it("a resposta crua é sempre preservada para a tela mostrar", async () => {
    const corpo = [{ status: "403", jid: "x" }];
    const r = await executarAcaoDeGrupo(
      deps({ resposta: { httpStatus: 200, corpo }, membrosDepois: [{ id: ALVO, pn: null, role: "participant" }] }),
      { acao: "remover", waGroupId: "g", sessao: "s", alvoLid: ALVO, alvoJid: "x@c.us", papelAtual: "participant" },
    );
    expect(r.respostaCrua).toEqual(corpo);
    expect(r.erroTexto).toContain("admin");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run lib/grupos/executar-acao.test.ts
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `lib/grupos/executar-acao.ts`:

```ts
/**
 * Execução de ação de grupo, com VERIFICAÇÃO DE PÓS-CONDIÇÃO.
 *
 * ⚠️ A razão de este módulo existir, medida em produção (2026-09-20):
 * `POST /groups` devolveu **201** listando dois participantes; o
 * `participants/v2` seguinte mostrou **um**. O membro nunca entrou.
 *
 * Então: nenhuma ação é dada por concluída pela resposta. Depois de
 * chamar, relemos a lista de participantes e comparamos com o estado
 * esperado. `posCondicaoOk` é o único campo que autoriza `concluida`.
 */
import { interpretarRespostaDeParticipantes } from "@/lib/grupos/waha-resposta";
import type { AcaoDeGrupo, PapelDeMembro } from "@/lib/grupos/tipos";
import type { ParticipanteWaha, RotaDeParticipante } from "@/lib/waha/client-grupos";

export interface ResultadoDaAcao {
  httpStatus: number;
  statusParticipante: string | null;
  respostaCrua: unknown;
  posCondicaoOk: boolean;
  erroTexto: string | null;
}

export interface EntradaDaAcao {
  acao: AcaoDeGrupo;
  waGroupId: string;
  sessao: string;
  alvoLid: string;
  alvoJid: string;
  papelAtual: PapelDeMembro;
}

export interface DepsDaAcao {
  chamarAcao: (
    sessao: string,
    waGroupId: string,
    rota: RotaDeParticipante,
    jids: string[],
  ) => Promise<{ httpStatus: number; corpo: unknown }>;
  lerParticipantes: (sessao: string, waGroupId: string) => Promise<ParticipanteWaha[]>;
}

const ROTA_POR_ACAO: Partial<Record<AcaoDeGrupo, RotaDeParticipante>> = {
  remover: "participants/remove",
  promover: "admin/promote",
  rebaixar: "admin/demote",
};

/** O que a lista de participantes deve mostrar se a ação funcionou. */
export function esperadoDepoisDe(
  acao: AcaoDeGrupo,
  papelAtual: PapelDeMembro,
): { presente: boolean; papel?: PapelDeMembro } {
  switch (acao) {
    case "remover":
      return { presente: false };
    case "promover":
      return { presente: true, papel: "admin" };
    case "rebaixar":
      return { presente: true, papel: "participant" };
    default:
      return { presente: true, papel: papelAtual };
  }
}

export async function executarAcaoDeGrupo(
  deps: DepsDaAcao,
  entrada: EntradaDaAcao,
): Promise<ResultadoDaAcao> {
  const rota = ROTA_POR_ACAO[entrada.acao];

  // `silenciar`, `avisar` e `advertir` não existem na API do WhatsApp: são
  // estado do CRM. Silêncio individual NÃO tem efeito no grupo — a pessoa
  // continua podendo falar; o que muda é o agente ignorá-la. A tela precisa
  // dizer isso ao operador em vez de fingir um poder que não existe.
  if (!rota) {
    return { httpStatus: 0, statusParticipante: null, respostaCrua: null, posCondicaoOk: true, erroTexto: null };
  }

  const { httpStatus, corpo } = await deps.chamarAcao(entrada.sessao, entrada.waGroupId, rota, [entrada.alvoJid]);
  const linhas = interpretarRespostaDeParticipantes(corpo);
  const minha = linhas.find((l) => l.jid.includes(entrada.alvoJid.split("@")[0])) ?? linhas[0] ?? null;

  const depois = await deps.lerParticipantes(entrada.sessao, entrada.waGroupId);
  const achado = depois.find((p) => p.id === entrada.alvoLid) ?? null;
  const esperado = esperadoDepoisDe(entrada.acao, entrada.papelAtual);

  let posCondicaoOk: boolean;
  let erroTexto: string | null = null;

  if (!esperado.presente) {
    posCondicaoOk = achado === null;
    if (!posCondicaoOk) erroTexto = "o WhatsApp respondeu, mas o membro continua no grupo";
  } else {
    posCondicaoOk = achado !== null && achado.role === esperado.papel;
    if (!posCondicaoOk) {
      erroTexto = achado
        ? `o papel continua "${achado.role}", era esperado "${esperado.papel}"`
        : "o membro não está mais no grupo";
    }
  }

  // O motivo do WAHA explica melhor a falha do que a nossa comparação.
  if (!posCondicaoOk && minha && !minha.ok && minha.motivo) {
    erroTexto = minha.motivo;
  }

  return {
    httpStatus,
    statusParticipante: minha ? minha.status : null,
    respostaCrua: corpo,
    posCondicaoOk,
    erroTexto,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
nvm use && pnpm vitest run lib/grupos/executar-acao.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/grupos/executar-acao.ts lib/grupos/executar-acao.test.ts
git commit -m "feat(grupos): ação de grupo só conclui após verificar pós-condição

Medido: o WAHA devolveu 201 listando membro que participants/v2 não
mostrou. Resposta não é prova — relê a lista e compara com o esperado."
```

---

### Task 5: Sincronizar grupos e membros a partir dos eventos

**Files:**
- Create: `lib/grupos/sincronizar.ts`
- Test: `lib/grupos/sincronizar.test.ts`
- Modify: `lib/waha/ingest.ts:1061-1075` (o `dispatchWahaEvent`)

**Interfaces:**
- Consumes: `GrupoWaha`, `ParticipanteWaha` (Task 3); tabelas da Task 1
- Produces:
  - `function extrairGrupoDeEvento(payload: unknown): GrupoWaha | null`
  - `function extrairMudancaDeParticipantes(payload: unknown): { waGroupId: string; tipo: string; participantes: { id: string; role: PapelDeMembro }[] } | null`
  - `function sincronizarGrupo(admin, organizationId, channelSessionId, grupo): Promise<string>` (devolve `whatsapp_groups.id`)

- [ ] **Step 1: Escrever o teste (vai falhar)**

Criar `lib/grupos/sincronizar.test.ts`. Os payloads são **capturas reais** de `.superpowers-capturas-grupo.jsonl`:

```ts
import { describe, expect, it } from "vitest";
import { extrairGrupoDeEvento, extrairMudancaDeParticipantes } from "./sincronizar";

const EVENTO_UPDATE = {
  timestamp: 1789928563597,
  group: {
    id: "120363414984201825@g.us",
    subject: "CAPTURA CRM",
    participants: [{ id: "35644520837319@lid", pn: "554891972220@c.us", role: "superadmin" }],
    membersCanAddNewMember: false,
    membersCanSendMessages: false,
    newMembersApprovalRequired: false,
  },
  _data: {
    id: "120363414984201825@g.us",
    subject: "CAPTURA CRM",
    creation: 1789928560,
    owner: "35644520837319@lid",
    ownerPn: "554891972220@s.whatsapp.net",
    size: 1,
    restrict: false,
    announce: false,
    joinApprovalMode: false,
    memberAddMode: false,
    participants: [{ id: "35644520837319@lid", phoneNumber: "554891972220@s.whatsapp.net", admin: "superadmin" }],
  },
};

const EVENTO_PARTICIPANTS = {
  group: { id: "120363414984201825@g.us" },
  type: "join",
  timestamp: 1789928608579,
  participants: [{ id: "224253161005092@lid", role: "participant" }],
  _data: {
    id: "120363414984201825@g.us",
    author: null,
    participants: [{ id: "224253161005092@lid", phoneNumber: "554891286399@s.whatsapp.net", admin: null }],
    action: "add",
  },
};

describe("extrairGrupoDeEvento", () => {
  it("lê metadados de um group.v2.update real", () => {
    const g = extrairGrupoDeEvento(EVENTO_UPDATE);
    expect(g).not.toBeNull();
    expect(g!.id).toBe("120363414984201825@g.us");
    expect(g!.subject).toBe("CAPTURA CRM");
    expect(g!.creation).toBe(1789928560);
    expect(g!.ownerPn).toBe("554891972220@c.us");
    expect(g!.participants).toEqual([
      { id: "35644520837319@lid", pn: "554891972220@c.us", role: "superadmin" },
    ]);
  });

  it("devolve null para payload que não é de grupo", () => {
    expect(extrairGrupoDeEvento({ foo: 1 })).toBeNull();
    expect(extrairGrupoDeEvento(null)).toBeNull();
  });
});

describe("extrairMudancaDeParticipantes", () => {
  it("lê um group.v2.participants real", () => {
    const m = extrairMudancaDeParticipantes(EVENTO_PARTICIPANTS);
    expect(m).toEqual({
      waGroupId: "120363414984201825@g.us",
      tipo: "join",
      participantes: [{ id: "224253161005092@lid", role: "participant" }],
    });
  });

  it("tipo leave é preservado", () => {
    const m = extrairMudancaDeParticipantes({ ...EVENTO_PARTICIPANTS, type: "leave" });
    expect(m!.tipo).toBe("leave");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run lib/grupos/sincronizar.test.ts
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o módulo**

Criar `lib/grupos/sincronizar.ts`:

```ts
/**
 * Sincronização de grupo e membros a partir dos eventos `group.v2.*`.
 *
 * ⚠️ NUNCA por polling. A doc do WAHA avisa `rate-overlimit` em
 * `GET /groups` e `/groups/refresh` no NOWEB, e uma instalação pode ter
 * centenas de grupos. A carga inicial é UMA leitura ao ligar o módulo;
 * daí em diante, só evento.
 *
 * Medido: `group.v2.update` traz a lista COMPLETA de participantes com
 * `pn` e papel resolvidos — é a fonte de verdade. O
 * `group.v2.participants` é pobre (só id e role) e serve para marcar
 * entrada/saída.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrupoWaha } from "@/lib/waha/client-grupos";
import { PAPEIS_DE_MEMBRO, type PapelDeMembro } from "@/lib/grupos/tipos";

type Admin = SupabaseClient<never>;

function normalizarPn(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto) return null;
  return bruto.replace("@s.whatsapp.net", "@c.us");
}

function normalizarPapel(bruto: unknown): PapelDeMembro {
  const v = typeof bruto === "string" ? bruto : "";
  return (PAPEIS_DE_MEMBRO as readonly string[]).includes(v) ? (v as PapelDeMembro) : "participant";
}

export function extrairGrupoDeEvento(payload: unknown): GrupoWaha | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const grupo = (p.group ?? null) as Record<string, unknown> | null;
  const dados = (p._data ?? {}) as Record<string, unknown>;
  if (!grupo || typeof grupo.id !== "string") return null;

  // `_data` traz o metadado rico (creation, owner, flags); `group` traz a
  // lista normalizada com `pn`. Os dois juntos formam o retrato.
  const participantesNormalizados = Array.isArray(grupo.participants) ? grupo.participants : [];
  const participantesCrus = Array.isArray(dados.participants) ? dados.participants : [];
  const fonte = participantesNormalizados.length > 0 ? participantesNormalizados : participantesCrus;

  return {
    id: grupo.id,
    subject: (grupo.subject as string) ?? (dados.subject as string) ?? null,
    description: (dados.desc as string) ?? null,
    owner: (dados.owner as string) ?? null,
    ownerPn: normalizarPn(dados.ownerPn),
    creation: typeof dados.creation === "number" ? dados.creation : null,
    size: typeof dados.size === "number" ? dados.size : null,
    announce: Boolean(dados.announce ?? grupo.membersCanSendMessages === false),
    restrict: Boolean(dados.restrict),
    memberAddMode: Boolean(dados.memberAddMode ?? grupo.membersCanAddNewMember),
    joinApprovalMode: Boolean(dados.joinApprovalMode ?? grupo.newMembersApprovalRequired),
    participants: fonte
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? ""),
        pn: normalizarPn(x.pn ?? x.phoneNumber),
        role: normalizarPapel(x.role ?? x.admin),
      })),
  };
}

export function extrairMudancaDeParticipantes(
  payload: unknown,
): { waGroupId: string; tipo: string; participantes: { id: string; role: PapelDeMembro }[] } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const grupo = (p.group ?? null) as Record<string, unknown> | null;
  if (!grupo || typeof grupo.id !== "string" || typeof p.type !== "string") return null;
  const lista = Array.isArray(p.participants) ? p.participants : [];
  return {
    waGroupId: grupo.id,
    tipo: p.type,
    participantes: lista
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({ id: String(x.id ?? ""), role: normalizarPapel(x.role ?? x.admin) })),
  };
}

/**
 * Grava o retrato do grupo e seus membros.
 *
 * Só atualiza grupo JÁ CADASTRADO (o módulo é ligado por org, por grupo).
 * Evento de grupo não cadastrado é descartado — é o comportamento de hoje
 * e continua sendo o default.
 */
export async function sincronizarGrupo(
  admin: Admin,
  organizationId: string,
  channelSessionId: string,
  grupo: GrupoWaha,
): Promise<string | null> {
  const { data: existente } = await admin
    .from("whatsapp_groups")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("channel_session_id", channelSessionId)
    .eq("wa_group_id", grupo.id)
    .maybeSingle();

  if (!existente) return null;

  const meuLid = grupo.participants.find((p) => p.role === "superadmin" || p.role === "admin");

  await admin
    .from("whatsapp_groups")
    .update({
      subject: grupo.subject,
      description: grupo.description,
      owner_lid: grupo.owner,
      owner_pn: grupo.ownerPn,
      created_at_wa: grupo.creation ? new Date(grupo.creation * 1000).toISOString() : null,
      size: grupo.size,
      announce: grupo.announce,
      restrict_info: grupo.restrict,
      member_add_mode: grupo.memberAddMode,
      join_approval_mode: grupo.joinApprovalMode,
      somos_admin: Boolean(meuLid),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existente.id)
    .eq("organization_id", organizationId);

  for (const p of grupo.participants) {
    if (!p.id) continue;
    await admin.from("whatsapp_group_members").upsert(
      {
        organization_id: organizationId,
        group_id: existente.id,
        wa_lid: p.id,
        wa_pn: p.pn,
        role: p.role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,group_id,wa_lid" },
    );
  }

  return existente.id;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
nvm use && pnpm vitest run lib/grupos/sincronizar.test.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Ligar no `dispatchWahaEvent`**

Em `lib/waha/ingest.ts`, dentro de `dispatchWahaEvent` (hoje linhas 1061-1075), acrescentar um ramo ANTES do fechamento da cadeia `else if`:

```ts
  } else if (eventType.startsWith("group.v2.")) {
    await handleEventoDeGrupo(admin, session, eventType, payload, requestId);
  }
```

E criar a função no mesmo arquivo, junto das outras `handle*`:

```ts
/**
 * Eventos `group.v2.*`.
 *
 * Grupo NÃO CADASTRADO é descartado em silêncio — é o default do produto:
 * o módulo de grupos é ligado por organização e por grupo. Mensagem de
 * grupo continua tratada em `handleInbound` (que retorna seco em @g.us).
 */
async function handleEventoDeGrupo(
  admin: Admin,
  session: Session,
  eventType: string,
  p: WahaPayload,
  requestId: string,
): Promise<void> {
  const { extrairGrupoDeEvento, sincronizarGrupo } = await import("@/lib/grupos/sincronizar");
  const grupo = extrairGrupoDeEvento(p);
  if (!grupo) return;

  const id = await sincronizarGrupo(admin, session.organization_id, session.id, grupo);
  if (!id) return;

  logger.info("waha.grupo: sincronizado", { requestId, eventType, waGroupId: grupo.id });
}
```

- [ ] **Step 6: Rodar a suíte inteira**

```bash
nvm use && pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
grep -aE "^ *FAIL " /tmp/vt.log | sed 's/ > .*//' | sort | uniq -c
```

Esperado: exit=0. Comparar rodapé e `grep` — se divergirem, a sonda está cega; rodar de novo com `--reporter=verbose`.

- [ ] **Step 7: Commit**

```bash
git add lib/grupos/sincronizar.ts lib/grupos/sincronizar.test.ts lib/waha/ingest.ts
git commit -m "feat(grupos): sincroniza grupo e membros pelos eventos group.v2.*

Fonte de verdade é o group.v2.update, que traz a lista completa com pn e
papel. Zero polling — o NOWEB devolve rate-overlimit em /groups/refresh.
Testes usam payload capturado em produção."
```

---

### Task 6: API — listar grupos e membros

**Files:**
- Create: `app/api/v1/groups/route.ts`
- Create: `app/api/v1/groups/[id]/route.ts`
- Create: `app/api/v1/groups/[id]/members/route.ts`
- Test: `tests/unit/api-grupos-contrato.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 1; `ok()`/`fail()` de `lib/api/wrappers.ts`
- Produces: contrato REST consumido pelas telas da Task 8

- [ ] **Step 1: Ler dois handlers vizinhos para copiar o padrão**

Antes de escrever, ler `app/api/v1/conversations/_handler.ts` e um handler com `[id]` para copiar: como a sessão é resolvida, como `organization_id` é obtido (nunca do body), o formato de `ok()`/`fail()`, e o padrão de auditoria. **Não inventar o padrão** — o repo já tem um.

- [ ] **Step 2: Escrever o teste de contrato (vai falhar)**

Criar `tests/unit/api-grupos-contrato.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROTAS = [
  "app/api/v1/groups/route.ts",
  "app/api/v1/groups/[id]/route.ts",
  "app/api/v1/groups/[id]/members/route.ts",
];

describe("API de grupos — doutrina", () => {
  it("toda rota usa os wrappers ok/fail", () => {
    for (const r of ROTAS) {
      const src = readFileSync(r, "utf-8");
      expect(src, r).toMatch(/from "@\/lib\/api\/wrappers"/);
    }
  });

  it("nenhuma rota lê organization_id do body", () => {
    for (const r of ROTAS) {
      const src = readFileSync(r, "utf-8");
      expect(src, r).not.toMatch(/body\.organization_id|body\["organization_id"\]/);
    }
  });

  it("nenhuma rota deixa console.log", () => {
    for (const r of ROTAS) {
      expect(readFileSync(r, "utf-8"), r).not.toMatch(/console\.log/);
    }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run tests/unit/api-grupos-contrato.test.ts
```

Esperado: FAIL — `ENOENT` nos três arquivos.

- [ ] **Step 4: Implementar as três rotas**

`app/api/v1/groups/route.ts` — GET lista. Seguir o padrão do handler lido no Step 1. Forma da resposta:

```ts
return ok({
  data: grupos.map((g) => ({
    id: g.id,
    wa_group_id: g.wa_group_id,
    subject: g.subject,
    size: g.size,
    modo: g.modo,
    somos_admin: g.somos_admin,
    announce: g.announce,
    last_synced_at: g.last_synced_at,
  })),
});
```

`app/api/v1/groups/[id]/route.ts` — GET detalhe (mesmos campos + `description`, `owner_pn`, `created_at_wa`, `restrict_info`, `member_add_mode`, `join_approval_mode`, `settings`) e PATCH de `modo`, validado com Zod:

```ts
const corpoPatch = z.object({ modo: z.enum(["vigiado", "semi", "autonomo"]) });
```

`app/api/v1/groups/[id]/members/route.ts` — GET membros:

```ts
return ok({
  data: membros.map((m) => ({
    id: m.id,
    wa_lid: m.wa_lid,
    wa_pn: m.wa_pn,
    push_name: m.push_name,
    role: m.role,
    contact_id: m.contact_id,
    strikes: m.strikes,
    silenciado_ate: m.silenciado_ate,
    entrou_em: m.entrou_em,
  })),
});
```

Em todas: `organization_id` vem da sessão (`getUser()`, nunca `getSession()`), e toda query filtra por ele explicitamente.

- [ ] **Step 5: Rodar e ver passar**

```bash
nvm use && pnpm vitest run tests/unit/api-grupos-contrato.test.ts && pnpm typecheck
```

Esperado: PASS + typecheck zerado.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/groups tests/unit/api-grupos-contrato.test.ts
git commit -m "feat(grupos): API de leitura de grupos e membros"
```

---

### Task 7: API — executar ação manual, com auditoria

**Files:**
- Create: `app/api/v1/groups/[id]/actions/route.ts`
- Test: `tests/invariants/grupos-acao-so-conclui-com-pos-condicao.test.ts`

**Interfaces:**
- Consumes: `executarAcaoDeGrupo` (Task 4); `chamarAcaoDeParticipante`/`lerParticipantes` (Task 3)
- Produces: `POST /api/v1/groups/{id}/actions` → `{ data: { action_id, status, pos_condicao_ok, erro_texto, waha_status_participante } }`

- [ ] **Step 1: Escrever o invariante (vai falhar)**

Criar `tests/invariants/grupos-acao-so-conclui-com-pos-condicao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Este invariante existe porque a resposta do WAHA MENTE (medido: 201
 * listando membro que participants/v2 não mostrou). Se alguém um dia
 * marcar `concluida` sem olhar `pos_condicao_ok`, o CRM volta a afirmar
 * remoção que não aconteceu.
 */
describe("ação de grupo nunca conclui sem pós-condição", () => {
  const src = readFileSync("app/api/v1/groups/[id]/actions/route.ts", "utf-8");

  it("passa pelo executarAcaoDeGrupo, não chama o WAHA direto", () => {
    expect(src).toMatch(/executarAcaoDeGrupo/);
    expect(src).not.toMatch(/participants\/remove|admin\/promote/);
  });

  it("o status 'concluida' é condicionado a pos_condicao_ok", () => {
    const trecho = src.replace(/\s+/g, " ");
    expect(trecho).toMatch(/posCondicaoOk\s*\?\s*"concluida"|pos_condicao_ok.*concluida/);
  });

  it("guarda a resposta crua e o texto do erro", () => {
    expect(src).toMatch(/waha_resposta/);
    expect(src).toMatch(/erro_texto/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run tests/invariants/grupos-acao-so-conclui-com-pos-condicao.test.ts --config vitest.db.config.ts
```

Esperado: FAIL — `ENOENT`.

- [ ] **Step 3: Implementar a rota**

`app/api/v1/groups/[id]/actions/route.ts`:

```ts
/**
 * POST /api/v1/groups/{id}/actions — ação manual do operador.
 *
 * Fatia 1: só ação HUMANA (`decidido_por: "humano"`). A escada automática
 * da IA entra na fatia 2 e passará por este mesmo caminho.
 *
 * `add` NÃO é oferecido: medido, ele devolve 451 para número que não
 * aceita ser adicionado, e o caminho suportado é o link de convite.
 */
import { z } from "zod";
// … imports do padrão do repo (ok/fail, admin client, audit, getUser)

const corpo = z.object({
  member_id: z.string().uuid(),
  acao: z.enum(["remover", "promover", "rebaixar", "silenciar"]),
  silenciar_ate: z.string().datetime().optional(),
});
```

Passos do handler, em ordem:

1. `getUser()` → resolve `organization_id` da sessão (nunca do body)
2. carrega grupo + membro filtrando `organization_id`; 404 se não achar
3. se `!grupo.somos_admin` e a ação exige admin → `fail("group_not_admin", "A sessão do WhatsApp não é administradora deste grupo.", 409)`
4. INSERT em `whatsapp_group_actions` com `status='pendente'`, `decidido_por='humano'`, `aprovado_por_user_id = user.id`
5. UPDATE para `status='executando'`
6. chama `executarAcaoDeGrupo`, fechando o `cfg` do WAHA nas deps:

```ts
const deps = {
  chamarAcao: (s: string, g: string, r: RotaDeParticipante, j: string[]) =>
    chamarAcaoDeParticipante(cfg, s, g, r, j),
  lerParticipantes: (s: string, g: string) => lerParticipantes(cfg, s, g),
};
const resultado = await executarAcaoDeGrupo(deps, {
  acao: entrada.acao,
  waGroupId: grupo.wa_group_id,
  sessao: sessao.waha_session_name,
  alvoLid: membro.wa_lid,
  alvoJid: membro.wa_pn ?? membro.wa_lid,
  papelAtual: membro.role,
});
```
7. UPDATE final:

```ts
await admin
  .from("whatsapp_group_actions")
  .update({
    status: resultado.posCondicaoOk ? "concluida" : "falhou",
    waha_http_status: resultado.httpStatus,
    waha_status_participante: resultado.statusParticipante,
    waha_resposta: resultado.respostaCrua as never,
    pos_condicao_ok: resultado.posCondicaoOk,
    erro_texto: resultado.erroTexto,
    executada_em: new Date().toISOString(),
  })
  .eq("id", acaoId)
  .eq("organization_id", organizationId);
```

8. se deu certo, reflete na tabela de membros (`role`, ou `saiu_em` no remover, ou `silenciado_ate`)
9. `audit()` da mutação (padrão do repo)
10. devolve `ok({ data: { action_id, status, pos_condicao_ok, erro_texto, waha_status_participante } })` — **o erro cru chega à tela**

- [ ] **Step 4: Rodar e ver passar**

```bash
nvm use && pnpm vitest run tests/invariants/grupos-acao-so-conclui-com-pos-condicao.test.ts --config vitest.db.config.ts
nvm use && pnpm typecheck
```

Esperado: PASS + typecheck zerado.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v1/groups/[id]/actions/route.ts" tests/invariants/grupos-acao-so-conclui-com-pos-condicao.test.ts
git commit -m "feat(grupos): ação manual do operador com pós-condição e auditoria"
```

---

### Task 8: Telas do painel

**Files:**
- Create: `app/app/grupos/page.tsx`
- Create: `app/app/grupos/[id]/page.tsx`
- Create: `app/app/grupos/[id]/_components/TabelaDeMembros.tsx`
- Modify: `lib/navigation/catalogo.ts`
- Test: `tests/e2e/grupos-painel.spec.ts`

**Interfaces:**
- Consumes: as rotas das Tasks 6 e 7
- Produces: telas `/app/grupos` e `/app/grupos/[id]`

- [ ] **Step 1: Declarar a porta no catálogo**

Em `lib/navigation/catalogo.ts`, acrescentar ao `NAV_CATALOG` no grupo `canais` (é onde o WhatsApp vive):

```ts
{
  href: "/app/grupos",
  label: "Grupos",
  group: "canais",
  minRole: "agent",
  description: "Grupos de WhatsApp: membros, papéis e moderação",
},
```

Conferir a forma exata dos vizinhos antes — os campos podem diferir do exemplo.

- [ ] **Step 2: Escrever o e2e (vai falhar)**

Criar `tests/e2e/grupos-painel.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { entrarComoDono } from "./_helpers";

test.describe("painel de grupos", () => {
  test("chega pela navegação, sem digitar URL", async ({ page }) => {
    await entrarComoDono(page);
    await page.getByRole("link", { name: "Grupos" }).click();
    await expect(page).toHaveURL(/\/app\/grupos/);
  });

  test("instalação sem grupo mostra estado vazio explicativo, não tela morta", async ({ page }) => {
    await entrarComoDono(page);
    await page.goto("/app/grupos");
    await expect(page.getByText(/nenhum grupo/i)).toBeVisible();
  });

  test("a tela diz que silenciar não tem efeito no WhatsApp", async ({ page }) => {
    // limitação real da plataforma: silêncio individual é só do CRM.
    // Esconder isso faria o operador crer num poder que não existe.
    await entrarComoDono(page);
    await page.goto("/app/grupos");
    await expect(page.getByText(/silenciar/i).first()).toBeVisible();
  });
});
```

Usar os helpers reais de `tests/e2e/` — ler uma spec existente antes.

- [ ] **Step 3: Rodar e ver falhar**

```bash
nvm use && pnpm test:e2e tests/e2e/grupos-painel.spec.ts
```

Esperado: FAIL — rota 404.

- [ ] **Step 4: Implementar as telas**

`app/app/grupos/page.tsx` — lista: nome, nº de membros, modo, selo "somos admin", último sync. Estado vazio explica **como ligar** um grupo (a sessão precisa estar conectada e o grupo precisa ser cadastrado), não só "nada aqui".

`app/app/grupos/[id]/page.tsx` — detalhe: metadados, flags (`announce`, `restrict_info`, `member_add_mode`), modo, e a tabela de membros.

`TabelaDeMembros.tsx` — colunas: nome (`push_name`), telefone (`wa_pn`), papel, strikes, silêncio; ações por linha (remover, promover, rebaixar, silenciar). Ao falhar, mostra `erro_texto` **e** `waha_status_participante` crus. Botões que exigem admin ficam desabilitados com explicação quando `somos_admin === false`.

Seguir `frontend-design` e os componentes shadcn já usados no repo.

- [ ] **Step 5: Rodar e ver passar**

```bash
nvm use && pnpm test:e2e tests/e2e/grupos-painel.spec.ts
nvm use && pnpm vitest run tests/unit/navegacao-completude.test.ts
```

Esperado: PASS nos dois. O segundo reprova se a porta do Step 1 não foi declarada.

- [ ] **Step 6: Commit**

```bash
git add app/app/grupos lib/navigation/catalogo.ts tests/e2e/grupos-painel.spec.ts
git commit -m "feat(grupos): painel de grupos e membros, com ação manual pela tela"
```

---

### Task 9: Fechar o ciclo — env, doc, fragmento de release

**Files:**
- Modify: `docker-compose.prod.yml` (bloco `waha`, `WHATSAPP_HOOK_EVENTS`)
- Modify: `CLAUDE.md` (a linha errada sobre `p.author`)
- Create: `.changes/grupos-whatsapp-fatia-1.md`
- Test: `tests/unit/grupos-eventos-no-compose.test.ts`

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: a mudança chega a quem já instalou

- [ ] **Step 1: Escrever o teste do compose (vai falhar)**

Criar `tests/unit/grupos-eventos-no-compose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Sem os eventos de grupo no WHATSAPP_HOOK_EVENTS, o módulo inteiro é
 * decorativo: nada chega. Medido na VPS em 2026-09-20 — a instalação real
 * tinha só message.any, message.ack, message.edited, message.revoked,
 * session.status e state.change.
 */
describe("compose entrega os eventos de grupo", () => {
  const compose = readFileSync("docker-compose.prod.yml", "utf-8");
  const linha = compose.split("\n").find((l) => l.includes("WHATSAPP_HOOK_EVENTS")) ?? "";

  for (const ev of ["group.v2.join", "group.v2.leave", "group.v2.participants", "group.v2.update"]) {
    it(`inclui ${ev}`, () => {
      expect(linha).toContain(ev);
    });
  }

  it("mantém message.any, que é o superconjunto medido", () => {
    expect(linha).toContain("message.any");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
nvm use && pnpm vitest run tests/unit/grupos-eventos-no-compose.test.ts
```

Esperado: FAIL nos quatro eventos.

- [ ] **Step 3: Ajustar o compose**

Em `docker-compose.prod.yml`, no bloco `waha`, estender a linha (mantendo o comentário longo que já existe acima dela, que explica por que `message` não entra):

```yaml
      WHATSAPP_HOOK_EVENTS: "message.any,message.ack,message.edited,message.revoked,session.status,state.change,group.v2.join,group.v2.leave,group.v2.participants,group.v2.update"
```

- [ ] **Step 4: Corrigir a linha errada do CLAUDE.md**

Na seção WAHA, a linha hoje diz:

```
- Grupos: SKIP CRM binding se `chatId.endsWith('@g.us')`. Sender é `p.author`, não `p.from`
```

Substituir por:

```
- Grupos: por default, SKIP CRM binding se `chatId.endsWith('@g.us')` — grupo só entra no CRM
  pelo módulo de grupos, ligado por organização. **O autor da mensagem é `payload.participant`
  (topo), NÃO `p.author`**: `author` é vocabulário do WEBJS e não existe no NOWEB, que é o engine
  do kit. O telefone do autor sai de `_data.key.participantAlt` quando o JID é `@lid`. Medido em
  produção em 2026-09-20; evidência em `.superpowers-capturas-grupo.jsonl`. Para conferir sem
  acreditar nesta linha: `grep -o '"participant[A-Za-z]*"' .superpowers-capturas-grupo.jsonl | sort -u`
```

- [ ] **Step 5: Escrever o fragmento de release**

Criar `.changes/grupos-whatsapp-fatia-1.md`, seguindo a forma dos vizinhos (ler `.changes/bacco-campanhas.md` primeiro). Efeito no operador: **`exige_acao`** — o `WHATSAPP_HOOK_EVENTS` muda, e quem já tem instalação precisa que o `update.sh` alcance o compose.

- [ ] **Step 6: Rodar tudo**

```bash
nvm use
pnpm typecheck && pnpm lint
pnpm test:unit > /tmp/vt.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt.log | tail -3
pnpm test:db > /tmp/db.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/db.log | tail -3
pnpm release:conferir
```

Esperado: tudo verde, exit=0 nos dois. Se `Errors` aparecer com `0 failed`, ler a linha antes de concluir — o exit code é a autoridade.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.prod.yml CLAUDE.md .changes/grupos-whatsapp-fatia-1.md tests/unit/grupos-eventos-no-compose.test.ts
git commit -m "feat(grupos): entrega os eventos de grupo ao webhook e corrige a doutrina

O WHATSAPP_HOOK_EVENTS não trazia nenhum group.v2.*: sem isso o módulo é
decorativo. E o CLAUDE.md mandava ler `p.author`, que é WEBJS e não existe
no NOWEB — o autor é `payload.participant`, medido em produção."
```

---

## Prova em ambiente real (critério de aceite da fatia)

A doutrina de QA Visual do repo exige prova pela tela, em ambiente estilo VPS. Como a instalação de teste **é** a VPS do dono (`root@2.25.222.110`, sem cliente real), a prova roda lá:

1. subir a imagem com a mudança
2. ligar um grupo de teste para a organização
3. pela tela: ver o grupo, ver os membros com papel e telefone
4. pela tela: remover um membro de teste → conferir que sumiu da lista **e** que a ação ficou `concluida` com `pos_condicao_ok = true`
5. pela tela: tentar remover em grupo onde a sessão não é admin → conferir que o erro cru aparece, e que a ação ficou `falhou`
6. evidência visual em `.superpowers/evidence/`
7. atualizar `docs/testing/user-journey-map.md` com a jornada nova

O passo 5 é o que mais importa: é o caminho em que o WAHA responde `200` e nada acontece.
