# Bacco Adega CRM — Plano 3: Enforcement da suspensão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a suspensão de um tenant PARAR o produto para aquela organização — API, MCP, agente, follow-up e automações —, e não só redirecionar a tela, mantendo intacto tudo que já funciona.

**Architecture:** Três pontos de código, cada um o funil de uma família de superfícies, mais um consumidor de evento. Sessão de navegador entra por `requireRole`, que já resolve a organização ativa numa consulta que traz nome e idioma — `status` passa a vir no mesmo join, e o gate fecha em 403 antes da RPC de papel. Token `dsk_` entra por `validateBearerToken`, e como `resolveAuthDual` e o endpoint MCP chamam **a mesma função**, um ponto cobre as duas linhas da matriz. Agente, follow-up, automações e crons não têm ponto único de produção (a fila tem cinco produtores), mas têm ponto único de **consumo**: `CLAIM_SQL`, chamado só pelo `agent-worker`. Filtrar ali desliga as quatro linhas de uma vez, sem tocar em nenhum produtor. Por fim, os eventos `tenant.suspended` e `tenant.reactivated` — hoje emitidos e consumidos por ninguém — ganham UM consumidor que impede o efeito colateral mais perigoso da reativação: a fila represada disparando toda de uma vez. São dois eventos, e não um, porque os produtores continuam enfileirando durante a suspensão: limpar só na suspensão deixaria entrar tudo o que chega depois.

**Tech Stack:** Next.js 16 App Router, TypeScript estrito, Supabase (Postgres 15) com RLS, `pg` direto no worker da fila, Vitest (unidade) e Vitest+Postgres efêmero (invariantes, via `scripts/test-db.sh`).

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` §6a (matriz de suspensão e a decisão do dono de 2026-09-15: código de enforcement na v1, checagem central de `organizations.status`, teste por linha, inbound guardado sem despachar agente, reativação sem perda e sem reenvio em massa).

## Global Constraints

- **Não quebrar o que já funciona.** Decisão do dono, verbatim: *"precisamos planejar tudo para não quebrarmos oque ja funciona pois o sistema esta muito bem construido e funcional"*. Toda mudança é aditiva; nenhum caminho existente muda de forma.
- **`fn_user_org_ids()` NÃO é tocada.** Ver "Opção recusada" abaixo.
- **Sem mudança de schema.** Nenhuma migration, nenhum apêndice de baseline, nenhuma linha no MANIFEST. Se algum step precisar de schema, ele PARA e vira decisão — não improvisa.
- **Platform admin nunca é bloqueado.** É quem reativa; bloqueá-lo tranca a chave dentro do carro.
- **Testes locais só `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `pnpm test:db`.** App e e2e só na VPS (memória do dono: [[testes-na-vps-nao-local]]).
- **Node 22 obrigatório** para qualquer comando de teste: `export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH` antes. No Node 20 o Vitest quebra com `webidl.util.markAsUncloneable is not a function`.
- **Prova em tela ANTES da tag**, na VPS, como manda a doutrina de QA Visual.
- **Uma linha da matriz, uma prova.** Nenhuma linha fica "coberta por inspeção".
- Branch `bacco`; push `--no-tags origin bacco:main`; tag anotada manual depois do CI verde.

## A matriz, e o que cada linha custa neste plano

Medido no código em 2026-09-16, não lido da spec:

| Superfície | Hoje | Exigido suspensa | Onde entra | Task |
|---|---|---|---|---|
| Telas `app/app/*` | redirect, **inclusive para quem acompanha** | redirect, menos o acompanhamento só-leitura | `app/app/layout.tsx:109` — uma condição a mais (Step 8-A) | 1 |
| API `/api/v1/*` com cookie | responde | 403 | `lib/auth/require-role.ts` | 1 |
| API/MCP com token `dsk_` | responde | 403 | `lib/mcp/auth.ts` (um ponto, duas superfícies) | 2 |
| Webhook WAHA inbound | ingere | ingere e guarda, sem despachar | **nada a fazer na rota** — ela só grava `webhook_events_log`; o despacho nasce no drain e morre no claim | 3 |
| Agente (`inbound_turn`) | responde | não responde | `CLAIM_SQL` | 3 |
| Follow-up, automações, crons | disparam | não disparam | `CLAIM_SQL` (mesmo ponto) | 3 |
| Envio humano pela inbox | envia | bloqueado | coberto pela Task 1 (a rota de mensagens passa por `requireRole`) | 1 |
| Campanhas / disparo em massa | — | — | **superfície não existe no produto** — declarada, com prova | 5 |
| Reativação | — | tudo volta, sem reenvio em massa | consumidor de `tenant.suspended` | 4 |

## Opção recusada (e por que ela parece a melhor e não é)

**Filtrar `organizations.status` dentro de `fn_user_org_ids()`.** Ela é a função que 224 lugares do `baseline.sql` usam; mudá-la desligaria a suspensão em toda a RLS de uma vez, o que soa como o conserto mais econômico do mundo. É armadilha por três motivos medidos:

1. **Quebraria a própria suspensão.** `/account-suspended` e as telas de admin leem dados da organização; sem linhas, a tela de suspensão não renderiza e a reativação some.
2. **Não cobriria o que mais importa.** O inbound é gravado por service role, que passa **por cima** da RLS. A linha "ingere e guarda" continuaria igual.
3. **É irreversível na prática.** Um erro ali é invisível em teste de unidade e aparece como "sumiram os dados do cliente".

Custo de errar esta decisão: o sistema inteiro passa a depender de uma função que ninguém ousa mexer de novo.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/api/errors.ts` | **Modify** — código canônico `tenant_suspended` |
| `lib/auth/types.ts` | **Modify** — `status` em `ActiveOrg`, `organization_status` em `UserOrgMembership` |
| `lib/auth/server.ts` | **Modify** — `status` no join que já existe; repassado a `resolveActiveOrg` |
| `lib/auth/require-role.ts` | **Modify** — gate de suspensão, depois do bypass de platform admin |
| `lib/auth/require-role-suspensao.test.ts` | **Create** — prova da linha "API com cookie" |
| `lib/mcp/auth.ts` | **Modify** — `status` no select do token; 403 `-32002` |
| `lib/mcp/auth-suspensao.test.ts` | **Create** — prova das linhas "API com token" e "MCP" |
| `lib/agent-engine/queue/queue.ts` | **Modify** — `CLAIM_SQL` ignora job de org suspensa |
| `tests/invariants/suspensao-nao-roda-job.test.ts` | **Create** — prova em Postgres real das linhas do agente, follow-up e crons |
| `app/api/v1/contacts/route.ts` | **Modify** — o catch inline de Bearer também propaga `apiCode` |
| `lib/tenancy/limpar-fila-represada.ts` | **Create** — a limpeza em si, chamada pela rota de reativação **e** pelo consumidor |
| `lib/tenancy/limpar-fila-represada.test.ts` | **Create** — prova da QUERY real (o teste do handler mocka este módulo) |
| `app/api/v1/admin/tenants/[id]/reactivate/route.ts` | **Modify** — limpa a fila **antes** de devolver o status a `active` |
| `lib/tenancy/fila-da-suspensao.handler.ts` | **Create** — consumidor de `tenant.suspended` **e** `tenant.reactivated`; limpa na suspensão, avisa nos dois |
| `lib/tenancy/fila-da-suspensao.handler.test.ts` | **Create** — prova da linha "reativação sem reenvio em massa", inclusive o registro no dispatcher |
| `lib/event-log/register-handlers.ts` | **Modify** — registra o consumidor |
| `tests/unit/suspensao-campanha-nao-existe.test.ts` | **Create** — congela a linha declarada inexistente |
| `docs/architecture/enforcement-da-suspensao.architecture.json` | **Create** — mapa vivo |
| `docs/architecture/README.md` | **Modify** — linha do mapa |
| `.changes/bacco-enforcement-da-suspensao.md` | **Create** — fragmento de release |
| `tests/e2e/bacco-suspensao.spec.ts` | **Create** — prova em tela na VPS |

---

### Task 1: A suspensão fecha a API de sessão

**Files:**
- Modify: `lib/api/errors.ts`
- Modify: `lib/auth/types.ts:66-79` e `lib/auth/types.ts:139-176`
- Modify: `lib/auth/server.ts:23-35`, `:166-174`, `:209-220`, `:262-275`
- Modify: `lib/auth/require-role.ts:88-92`
- Test: `lib/auth/require-role-suspensao.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ApiErrorCodes.tenant_suspended` (string `"tenant_suspended"`), `UserOrgMembership.organization_status?: string | null`, `ActiveOrg.status?: string | null`. A Task 6 usa o código na prova em tela.

- [ ] **Step 1: Escrever o teste que falha**

Crie `lib/auth/require-role-suspensao.test.ts`. O estilo de mock é o de `lib/auth/require-role.test.ts` (mesmos três `vi.mock`):

```ts
/**
 * A suspensão do tenant fecha a API de sessão — não só a tela.
 *
 * Antes deste teste, `organizations.status` era lido em UM lugar do produto
 * (`app/app/layout.tsx:109`, um redirect). Layout não roda em rota de API: a
 * mesma sessão que via a tela de "conta suspensa" seguia chamando
 * `/api/v1/*` normalmente — inclusive enviar mensagem pela inbox.
 *
 * Platform admin NÃO é bloqueado de propósito: é quem reativa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: vi.fn(),
  resolveActiveOrg: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function sessao(status: string | null, platformAdmin = false): void {
  const user: AuthUser = {
    id: USER_ID,
    email: "quem@invariant.test",
    full_name: null,
    avatar_url: null,
    is_platform_admin: platformAdmin,
    idioma: "pt-BR" as const,
    organizations: [
      {
        organization_id: ORG_ID,
        organization_name: "Vinícola",
        role: "admin",
        organization_status: status,
      },
    ],
  };
  const org: ActiveOrg = { orgId: ORG_ID, name: "Vinícola", role: "admin", status };
  vi.mocked(loadAuthUser).mockResolvedValue(user);
  vi.mocked(resolveActiveOrg).mockResolvedValue(org);
  vi.mocked(createClient).mockResolvedValue({
    rpc: vi.fn(async () => ({ data: "admin", error: null })),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireRole sob organização suspensa", () => {
  it("fecha em 403 tenant_suspended", async () => {
    sessao("suspended");
    const r = await requireRole("agent", { requestId: "req-1", resource: "messages" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    const corpo = await r.response.json();
    expect(corpo.error.code).toBe("tenant_suspended");
  });

  it("registra a recusa na auditoria, com o motivo", async () => {
    sessao("suspended");
    await requireRole("agent", { requestId: "req-2", resource: "messages" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        organizationId: ORG_ID,
        metadata: expect.objectContaining({ reason: "tenant_suspended" }),
      }),
    );
  });

  it("não atrapalha organização ativa", async () => {
    sessao("active");
    const r = await requireRole("agent", { requestId: "req-3" });
    expect(r.ok).toBe(true);
  });

  it("não atrapalha quando o status não veio (sessão de acompanhamento)", async () => {
    sessao(null);
    const r = await requireRole("agent", { requestId: "req-4" });
    expect(r.ok).toBe(true);
  });

  it("platform admin com opt-in passa — é quem reativa", async () => {
    sessao("suspended", true);
    const r = await requireRole("admin", { requestId: "req-5", allowPlatformAdmin: true });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/auth/require-role-suspensao.test.ts
```

Esperado: vermelho. Os dois primeiros casos falham porque `requireRole` hoje devolve `ok: true`; o `organization_status` e o `status` nem existem nos tipos, então o TypeScript do teste também reclama.

- [ ] **Step 3: Declarar o código de erro**

Em `lib/api/errors.ts`, no bloco dos 403, logo depois de `forbidden_tenant`:

```ts
  forbidden_tenant: "forbidden_tenant",
  // Organização SUSPENSA pelo operador da plataforma. Código próprio e não
  // `forbidden_tenant` porque as duas situações pedem telas diferentes: aquela
  // é "você não tem organização ativa" (resolve trocando de org), esta é "esta
  // organização está suspensa" (só o operador resolve). Uma integração que lê
  // o código precisa distinguir para parar de tentar.
  tenant_suspended: "tenant_suspended",
```

- [ ] **Step 4: Levar o status pelos tipos**

Em `lib/auth/types.ts`, dentro de `UserOrgMembership`, depois de `locale`:

```ts
  /**
   * `organizations.status` — vem do MESMO join que já trazia nome e idioma.
   *
   * Não é campo decorativo: é a fonte do gate de suspensão em `requireRole`.
   * Buscá-lo numa consulta própria seria uma segunda ida ao banco em TODA
   * rota autenticada para responder o que a primeira já tinha em mãos.
   */
  organization_status?: string | null;
```

E dentro de `ActiveOrg`, depois de `role`:

```ts
  /**
   * `organizations.status` da organização ativa.
   *
   * Opcional porque a sessão de ACOMPANHAMENTO (`support`) resolve a
   * organização por outro caminho, que não passa por `user_organizations` e
   * portanto não tem o campo. Ausente significa "não sei", e não sei NÃO
   * bloqueia — quem acompanha é o lado da plataforma, que precisa entrar
   * justamente quando algo está errado.
   */
  status?: string | null;
```

- [ ] **Step 5: Trazer o status no join que já existe**

Em `lib/auth/server.ts`, na interface `OrgJoin` (linha ~32):

```ts
interface OrgJoin {
  display_name: string;
  locale: string | null;
  status: string | null;
}
```

No `select` das memberships (linha ~168), acrescente `status` ao embed:

```ts
        .select(
          "organization_id, role, interface_settings, accepted_at, organizations(display_name, locale, status)",
        )
```

No `map` que monta `memberships` (linha ~213), acrescente o campo:

```ts
      locale: org?.locale ?? null,
      organization_status: org?.status ?? null,
```

E no retorno de `resolveActiveOrg` (linha ~270), acrescente:

```ts
  return {
    orgId: ativo.organization_id,
    name: ativo.organization_name,
    role: ativo.role,
    interface_settings: ativo.interface_settings,
    status: ativo.organization_status ?? null,
  };
```

- [ ] **Step 5-A: Fechar o ramo do override de organização**

`resolveActiveOrg` cobre a org ATIVA do cookie. Mas `requireRole` tem um segundo caminho: quando
`opts.organizationId` é passado, `org` é montado à mão (`lib/auth/require-role.ts:65-77`) e nasce
**sem `status`** — o gate do Step 6 ficaria cego justamente nas rotas que autorizam pela org do
RECURSO (o padrão do LGPD anonymize).

Medido: hoje o parâmetro só aparece em `lib/auth/require-role.test.ts` (3 ocorrências, todas em
teste), então não há regressão em produção. Mas a frase "um ponto, uma família de superfícies" não
valeria para ele, e o buraco ficaria pronto para o primeiro chamador real.

No ramo de `membership`, leve o campo junto:

```ts
      : membership
      ? {
          orgId: membership.organization_id,
          name: membership.organization_name,
          role: membership.role,
          status: membership.organization_status ?? null,
        }
```

**Limite declarado, e é dos dois outros ramos.** O ramo de `support` e o de `allowPlatformAdmin`
montam `org` sem passar por `user_organizations` — não existe `membership` de onde tirar o status,
e os dois ficam com `status` ausente. É o comportamento desejado nos dois casos: quem acompanha e
quem administra a plataforma precisam entrar numa organização suspensa. Custo se errado: se um dia
uma rota usar `organizationId` com `allowPlatformAdmin` para um usuário COMUM, ela não bloqueia —
por isso o caso de teste abaixo fixa o contrato.

Acrescente ao teste do Step 1:

```ts
  it("o override de organização também fecha em 403", async () => {
    sessao("suspended");
    const r = await requireRole("agent", { requestId: "req-6", organizationId: ORG_ID });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    expect((await r.response.json()).error.code).toBe("tenant_suspended");
  });
```

- [ ] **Step 6: Fechar o gate**

Em `lib/auth/require-role.ts`, **depois** do retorno antecipado do platform admin (hoje linhas 88-90) e **antes** da RPC de papel:

```ts
  if (allowPlatformAdmin && user.is_platform_admin && !user.support) {
    return { ok: true, user, org };
  }

  // SUSPENSÃO É GATE DE ACESSO, NÃO DE PAPEL.
  //
  // Fica aqui, e não no início, por duas razões que não são estilo:
  //   - DEPOIS do bypass de platform admin, porque é ele quem reativa. Um gate
  //     antes trancaria a chave dentro do carro.
  //   - ANTES da RPC de papel, porque quem está suspenso não precisa ter o
  //     papel resolvido: é uma ida ao banco a menos numa resposta que já está
  //     decidida.
  //
  // `status` ausente não bloqueia — ver o comentário em `ActiveOrg.status`.
  if (org.status === "suspended") {
    void audit({
      action: "authz.denied",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: resource ?? null,
      requestId,
      metadata: { reason: "tenant_suspended" },
    });
    return {
      ok: false,
      response: fail("tenant_suspended", t("Conta suspensa"), 403, { requestId }),
    };
  }
```

`t("Conta suspensa")` reusa chave que **já existe** no dicionário com espanhol (`lib/i18n/dicionario.ts:5648`) — nenhuma entrada nova, nenhum risco no gate de i18n.

- [ ] **Step 7: Rodar o teste e ver passar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/auth/require-role-suspensao.test.ts lib/auth/require-role.test.ts
```

Esperado: os dois arquivos verdes. O antigo prova que nada regrediu.

- [ ] **Step 8: Sabotar para provar que o teste vigia**

Comente o `if (org.status === "suspended")` do Step 6, rode de novo e confirme **2 casos vermelhos**. Descomente. Um teste que não fica vermelho quando a regra some não é prova.

- [ ] **Step 8-A: Alinhar a tela ao gate — o acompanhamento entra**

A matriz dizia "tela: nada a fazer, o redirect já existe". Medindo a linha vizinha, não é bem
assim: `app/app/layout.tsx:108` exclui a sessão de acompanhamento do redirect de onboarding
(`&& !user.support`), e `:109` **não** a exclui do redirect de suspensão. Ou seja, hoje a tela
expulsa quem está acompanhando uma organização suspensa, enquanto os gates novos das Tasks 1 e 2 a
deixam passar (o `status` não chega pelo caminho do `support`). Os dois lados discordam.

**O fato que muda a decisão, e que um `!user.support` solto ignoraria.** Acompanhamento tem DOIS
modos: `lib/impersonate/support.ts:9` declara `access_mode: z.enum(["full","support_readonly"])`, e
`lib/auth/require-role.ts:68` mapeia `full → role "admin"`. Um `!user.support` genérico no layout
deixaria entrar, numa organização que o operador desligou, uma sessão com **papel de administrador e
escrita** — não "leitura para diagnosticar". Dizer que "o acesso read_only continua valendo" seria
falso: quem decide o modo é quem abriu o acompanhamento, não a tela.

**Decisão: entra o acompanhamento SÓ-LEITURA; `full` continua sendo expulso.** Preserva o motivo da
mudança — diagnosticar uma organização suspensa sem ficar às cegas — sem abrir escrita numa
organização desligada por inadimplência. Custo se errado: quem abriu um acompanhamento `full` para
resolver o problema precisa reabrir como `support_readonly` para ver as telas, um atrito real e
visível. O contrário — escrita silenciosa numa organização suspensa — seria invisível.

```ts
    if (orgRow && !orgRow.onboarded_at && !user.support) redirect("/onboarding");
    // A sessão de acompanhamento SÓ-LEITURA entra: é para diagnosticar, e
    // "suspensa por inadimplência" é dos motivos mais comuns de pedir suporte.
    // `full` NÃO entra — `require-role.ts:68` mapeia esse modo para papel
    // `admin`, e isso seria escrita numa organização que o operador desligou.
    if (
      orgRow?.status === "suspended" &&
      user.support?.access_mode !== "support_readonly"
    ) {
      redirect("/account-suspended");
    }
```

**Limite declarado, do lado da API.** O gate da Task 1 lê `org.status`, e o ramo do acompanhamento
monta a organização sem esse campo (`require-role.ts:68` não tem de onde tirá-lo sem uma ida extra ao
banco). Então, pela API, as duas sessões de acompanhamento passam — inclusive a `full`. Quem
distingue os modos é a TELA, que é onde o diagnóstico acontece. Custo se errado: um acompanhamento
`full` consegue chamar `/api/v1/*` numa organização suspensa; mitigado porque toda a sessão é
consentida, tem prazo e fica registrada. Fechar isso exigiria buscar o status na resolução do
`support` — mais uma consulta em todo request de acompanhamento —, e fica como decisão própria.

A prova é uma catraca de texto, porque `layout.tsx` é Server Component e não se monta em unidade —
e sem ela a linha volta ao estado antigo no primeiro refactor, em silêncio:

```ts
  it("o redirect de suspensão deixa passar só o acompanhamento de leitura", () => {
    const layout = readFileSync(join(process.cwd(), "app", "app", "layout.tsx"), "utf8");
    const bloco = layout.slice(
      Math.max(0, layout.indexOf('redirect("/account-suspended")') - 400),
      layout.indexOf('redirect("/account-suspended")') + 60,
    );
    expect(bloco, "o redirect de suspensão existe").toContain("/account-suspended");
    // A distinção é o ponto todo: `!user.support` solto deixaria entrar o modo
    // `full`, que `require-role.ts:68` mapeia para papel `admin`.
    expect(bloco).toContain("support_readonly");
    expect(bloco).not.toMatch(/&&\s*!user\.support\s*\)\s*redirect\("\/account-suspended"\)/);
  });
```

Ponha esse caso em `lib/auth/require-role-suspensao.test.ts`, junto do gate que ele espelha
(importando `readFileSync`/`join` no topo), para que os dois lados da decisão vivam no mesmo arquivo.

- [ ] **Step 9: Gates e commit**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm typecheck && pnpm lint && pnpm test:unit > /tmp/vt1.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt1.log | tail -3
git add lib/api/errors.ts lib/auth/types.ts lib/auth/server.ts lib/auth/require-role.ts lib/auth/require-role-suspensao.test.ts
git commit -m "feat(bacco): a suspensão do tenant fecha a API de sessão"
```

O rodapé é a autoridade; a linha `Errors` precisa vir vazia (o Vitest sai 1 com erro não tratado mesmo com 0 falhas).

---

### Task 2: A suspensão fecha o token e o MCP

**Files:**
- Modify: `lib/mcp/auth.ts:100-138`
- Modify: `lib/api/auth-dual.ts:83-91` (Step 4-A — propaga o `apiCode` no envelope REST)
- Modify: `app/api/v1/contacts/route.ts:62-70` (catch inline próprio, a rota-bandeira da auth dual)
- Test: `lib/mcp/auth-suspensao.test.ts`
- Test: `app/api/v1/contacts/route.test.ts` (já existe — o caso novo entra nele)

**Interfaces:**
- Consumes: nada da Task 1 (caminho independente).
- Produces: `validateBearerToken` passa a lançar `McpAuthError(-32002, 403, "Organization suspended.")` com `apiCode: "tenant_suspended"`. `resolveAuthDual` passa a propagar esse `apiCode` no envelope REST.

**Correção de uma afirmação que este plano trazia errada.** A versão anterior dizia que `resolveAuthDual` converte 403 em `fail("forbidden_role", …)`. Medido em `lib/api/auth-dual.ts:84-90`: o catch faz `err.httpStatus === 401 ? "unauthenticated" : "forbidden"` — o código é **`forbidden`**, genérico, e o mesmo vale para `app/api/v1/contacts/route.ts:66-68`.

**Decisão: fechar, em vez de aceitar o genérico.** O Step 3 da Task 1 justifica o código próprio dizendo que "uma integração que lê o código precisa distinguir para parar de tentar" — aceitar `forbidden` no ramo do token contradiria a própria justificativa, e é justamente o ramo das integrações. O conserto é um campo opcional em `McpAuthError` e um `??` no catch (Step 4-A), não um `if` por rota. Custo se errado: rotas que hoje respondem `forbidden` para token suspenso passam a responder `tenant_suspended` — mudança de contrato que só alcança um caso que **ainda não existe** (hoje token de org suspensa responde 200), então nenhum cliente depende do valor antigo.

`api_tokens.organization_id` tem FK para `organizations(id)` (`api_tokens_organization_id_fkey`, `on delete cascade`, `supabase/baseline.sql:3427`), então o embed do PostgREST resolve. **Conferido antes de escrever este plano** — sem a FK, `organizations(status)` falharia em runtime com o gate verde.

- [ ] **Step 1: Escrever o teste que falha**

```ts
/**
 * Token de servidor de organização suspensa não trabalha.
 *
 * UM ponto cobre DUAS linhas da matriz: `resolveAuthDual`
 * (`/api/v1/*` com `Authorization: Bearer`) e `app/api/mcp/route.ts:41`
 * chamam a mesma `validateBearerToken`. Sem isto, a organização suspensa
 * seguia operando o CRM inteiro por integração — inclusive escrevendo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const TOKEN = "dsk_abc_segredo";
const ORG = "22222222-2222-4222-8222-222222222222";

function bancoComStatus(status: string | null) {
  const linha = {
    id: "33333333-3333-4333-8333-333333333333",
    organization_id: ORG,
    scopes: ["mcp:read"],
    revoked_at: null,
    expires_at: null,
    organizations: { status },
  };
  const update = { eq: vi.fn(async () => ({ error: null })) };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: linha, error: null })) })),
      })),
      update: vi.fn(() => update),
    })),
  } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => vi.clearAllMocks());

describe("validateBearerToken sob organização suspensa", () => {
  it("recusa com 403 e código MCP -32002", async () => {
    bancoComStatus("suspended");
    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toMatchObject({
      httpStatus: 403,
      mcpCode: -32002,
    });
    await expect(validateBearerToken(`Bearer ${TOKEN}`)).rejects.toBeInstanceOf(McpAuthError);
  });

  it("não atrapalha organização ativa", async () => {
    bancoComStatus("active");
    const r = await validateBearerToken(`Bearer ${TOKEN}`);
    expect(r.organizationId).toBe(ORG);
  });

  it("não atrapalha quando o embed vem vazio", async () => {
    bancoComStatus(null);
    const r = await validateBearerToken(`Bearer ${TOKEN}`);
    expect(r.organizationId).toBe(ORG);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/mcp/auth-suspensao.test.ts
```

Esperado: o primeiro caso falha — hoje a função devolve o token normalmente.

- [ ] **Step 3: Trazer o status no select do token**

Em `lib/mcp/auth.ts`, linha ~101:

```ts
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, organization_id, scopes, revoked_at, expires_at, organizations(status)")
    .eq("token_hash", hashLiteral)
    .maybeSingle();
```

- [ ] **Step 4: Recusar o token da organização suspensa**

No mesmo arquivo, **depois** da checagem de `expires_at` e **antes** de `parseScopes`:

```ts
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new McpAuthError(-32001, 401, "Token expired.");
  }

  // Organização suspensa não opera por integração. `-32002`/403 é o par que o
  // vizinho `ensureRole` já usa para "autenticou, não pode" — 401 diria ao
  // cliente que o token está errado, e ele tentaria de novo para sempre.
  //
  // O embed vem objeto ou array conforme a inferência do PostgREST; tratar só
  // um dos dois é o jeito silencioso de o gate nunca disparar.
  const orgJoin = data.organizations as
    | { status: string | null }
    | { status: string | null }[]
    | null;
  const orgStatus = Array.isArray(orgJoin) ? (orgJoin[0]?.status ?? null) : (orgJoin?.status ?? null);
  if (orgStatus === "suspended") {
    throw new McpAuthError(-32002, 403, "Organization suspended.", "tenant_suspended");
  }
```

- [ ] **Step 4-A: Deixar o REST distinguir suspensão de falta de permissão**

Sem este step, `resolveAuthDual` transforma QUALQUER 403 vindo do token em `forbidden` genérico
(`lib/api/auth-dual.ts:84-90`) — e a integração não consegue saber que deve parar de tentar, que é
a justificativa escrita do código próprio na Task 1.

Em `lib/mcp/auth.ts`, na classe `McpAuthError`, um quarto parâmetro opcional:

```ts
export class McpAuthError extends Error {
  constructor(
    public readonly mcpCode: number,
    public readonly httpStatus: number,
    message: string,
    /**
     * Código canônico do envelope REST (`lib/api/errors.ts`), quando existe um
     * mais específico que o genérico. Opcional de propósito: os erros de token
     * (ausente, inválido, revogado, expirado) continuam sem ele, e o
     * `resolveAuthDual` segue devolvendo o que sempre devolveu.
     */
    public readonly apiCode?: string,
  ) {
    super(message);
    this.name = "McpAuthError";
  }
}
```

⚠️ O `this.name = "McpAuthError"` já está lá (`lib/mcp/auth.ts:38`) — ele aparece acima porque o bloco
é colável inteiro. Perdê-lo troca o nome do erro em todo log e breadcrumb do Sentry.

⚠️ Confira a assinatura real da classe antes de editar (`grep -n "class McpAuthError" -A 12 lib/mcp/auth.ts`)
e acrescente **apenas** o parâmetro novo, preservando o que já estiver lá.

Em `lib/api/auth-dual.ts`, no catch que hoje escolhe entre `unauthenticated` e `forbidden`:

```ts
        return {
          ok: false,
          response: fail(
            err.apiCode ?? (err.httpStatus === 401 ? "unauthenticated" : "forbidden"),
            err.message,
            err.httpStatus,
            { requestId },
          ),
        };
```

O `??` é o ponto todo: quem não traz `apiCode` segue pelo caminho antigo, byte por byte.

Acrescente ao teste do Step 1 o caso que mede isso pela API, e não pela exceção:

```ts
  it("o envelope REST diz tenant_suspended, não forbidden genérico", async () => {
    bancoComStatus("suspended");
    const { resolveAuthDual } = await import("@/lib/api/auth-dual");
    const req = new Request("https://x/api/v1/contacts", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }) as unknown as import("next/server").NextRequest;
    const r = await resolveAuthDual(req, {
      requestId: "req-t",
      resource: "contacts",
      role: "agent",
      scope: "mcp:read",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(403);
    expect((await r.response.json()).error.code).toBe("tenant_suspended");
  });
```

- [ ] **Step 4-B: A rota que motivou o step acima também precisa dele**

`resolveAuthDual` não é o único lugar que traduz `McpAuthError` em envelope REST. Medido: há **quatro**
capturas de `McpAuthError` no repositório, e elas não são iguais —

| Onde | O que faz | Precisa de `apiCode`? |
|---|---|---|
| `lib/api/auth-dual.ts:83-91` | envelope REST | **sim** (Step 4-A) |
| `app/api/v1/contacts/route.ts:62-70` | envelope REST, catch **inline próprio** | **sim** — este step |
| `app/api/mcp/route.ts:43` | JSON-RPC, usa `mcpCode` | não |
| `lib/ai/runtime/tools.ts:207` | vira recusa para o modelo | não |

`/api/v1/contacts` é a rota-bandeira da auth dual — o módulo `auth-dual.ts` nasceu dela, e ela ficou
com a cópia inline. Corrigir só o módulo deixaria justamente a rota que o Step 4-A cita como
justificativa devolvendo `forbidden` genérico. É o modo de falha que a doutrina chama de consertar o
sintoma: mesma lógica em dois lugares, um conserto.

```ts
      if (err instanceof McpAuthError) {
        return {
          ok: false,
          response: fail(
            err.apiCode ?? (err.httpStatus === 401 ? "unauthenticated" : "forbidden"),
            err.message,
            err.httpStatus,
            { requestId },
          ),
        };
      }
```

O caso vai em `app/api/v1/contacts/route.test.ts`, que **já existe**, já mocka `validateBearerToken` e
já tem o bloco `describe("GET /api/v1/contacts — Bearer (integrações externas)")` — entra ao lado do
caso de token revogado, no mesmo estilo:

```ts
  it("Bearer de organização suspensa → 403 tenant_suspended, não forbidden genérico", async () => {
    vi.mocked(validateBearerToken).mockRejectedValue(
      new McpAuthError(-32002, 403, "Organization suspended.", "tenant_suspended"),
    );
    const { GET } = await import("./route");
    const res = await GET(req("http://localhost/api/v1/contacts", { authorization: "Bearer dsk_abc_def" }));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("tenant_suspended");
    expect(listContactsHandler).not.toHaveBeenCalled();
  });
```

Sabotagem deste step: tire o `err.apiCode ??` da rota e confirme que este caso — e **só** ele — fica
vermelho, com `forbidden` no lugar de `tenant_suspended`.

- [ ] **Step 5: Rodar, sabotar, rodar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/mcp/auth-suspensao.test.ts lib/mcp/auth-ator.test.ts app/api/v1/contacts/route.test.ts
```

Esperado: verde. Depois comente o `if (orgStatus === "suspended")`, rode de novo e confirme 1 vermelho; descomente.

- [ ] **Step 6: Gates e commit**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm typecheck && pnpm lint && pnpm test:unit > /tmp/vt2.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt2.log | tail -3
git add lib/mcp/auth.ts lib/mcp/auth-suspensao.test.ts
git commit -m "feat(bacco): token e MCP de organização suspensa recebem 403"
```

---

### Task 3: A fila não entrega trabalho de organização suspensa

**Files:**
- Modify: `lib/agent-engine/queue/queue.ts:126-149` (`CLAIM_SQL`)
- Test: `tests/invariants/suspensao-nao-roda-job.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `claimJobs` passa a ignorar job cuja organização está `suspended`. A Task 4 depende desse comportamento: é ele que permite descartar a fila represada sem correr atrás de worker em voo.

**Por que aqui, e não nos produtores.** `job_queue` tem **cinco** produtores (`lib/agent-engine/edge/crm/drain.ts:461`, `app/api/v1/ai/cases/[id]/reply/route.ts:199`, `app/api/v1/cron/followup-flow-worker/route.ts:47` — que tem uma função `enqueueJob` **homônima** e faz insert direto —, `lib/followup/aplicar-inbound.ts:38` e `lib/relogio/executar.ts:30`) e **um** consumidor: `claimJobs`, chamado só em `workers/agent-worker/main.ts:500`. Tapar cinco produtores é o jeito clássico de deixar o sexto quebrado; o conserto de raiz é no funil de saída.

**Por que `= 'suspended'` e não `<> 'active'`.** O CHECK da coluna aceita `active`, `suspended`, `redacted` e `archived`. Exigir `= 'active'` desligaria a fila também para `redacted`/`archived` — provavelmente desejável, e fora do escopo desta spec. Mudança calada de comportamento em organização que ninguém suspendeu é exatamente o que a restrição do dono proíbe. Custo se errado: uma organização arquivada segue processando job; visível, reversível, e assunto de outra decisão.

**Índice:** nenhum novo. O `NOT EXISTS` é lookup por chave primária de `organizations` sobre as linhas que o `idx_job_queue_claim` já selecionou. Medido na VPS em 2026-09-16: a fila real tem **2 jobs**. Teto declarado: se a fila passar a dezenas de milhares de `pending`, o lookup por linha candidata vira custo — o caminho é um índice parcial `(organization_id) where status='pending'`, e aí é a tripla completa de migration.

- [ ] **Step 1: Escrever o invariante que falha**

Crie `tests/invariants/suspensao-nao-roda-job.test.ts`. Ele roda contra o Postgres efêmero do `scripts/test-db.sh`, como o vizinho `queue-relogio.test.ts`:

```ts
/**
 * ORGANIZAÇÃO SUSPENSA NÃO RECEBE TRABALHO — e o trabalho não se perde.
 *
 * Quatro linhas da matriz de suspensão (§6a) morrem no MESMO ponto: agente
 * (`inbound_turn`), follow-up (`followup_turn`), automações e crons. Não
 * porque alguém as desligou uma a uma — a fila tem cinco produtores —, mas
 * porque o claim é o único caminho de SAÍDA.
 *
 * Invariante e não unidade porque o que pode quebrar é SQL: um predicado com
 * a polaridade trocada continua compilando, e o modo de falha é uma vinícola
 * suspensa cujo agente segue respondendo no WhatsApp.
 *
 * A segunda asserção é o outro lado, e é o que impede o conserto de virar
 * perda: o job da organização suspensa continua `pending` no banco. Quem o
 * descarta (e por quê) é o consumidor de `tenant.suspended`, com aviso.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { claimJobs } from "@/lib/agent-engine/queue/queue";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const ORG_ATIVA = "aaaaaaaa-5000-4000-8000-000000000001";
const ORG_SUSPENSA = "bbbbbbbb-5000-4000-8000-000000000002";
const CONTATO_ATIVO = "aaaaaaaa-5001-4000-8000-000000000001";
const CONTATO_SUSPENSO = "bbbbbbbb-5001-4000-8000-000000000002";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number(process.env.TEST_DB_PORT ?? 54329),
    user: "postgres",
    // `password` NÃO é opcional: `scripts/test-db.sh` sobe o container com
    // `POSTGRES_PASSWORD=postgres` e SEM `POSTGRES_HOST_AUTH_METHOD=trust`, e
    // nada exporta `PGPASSWORD`. Os 78 pools de tests/invariants/ passam
    // `postgres:postgres` — omitir aqui é erro de conexão, não de lógica.
    password: "postgres",
    database: "postgres",
  });
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name, status)
     values ($1, 'susp-inv-ativa', 'Ativa', 'Ativa', 'active'),
            ($2, 'susp-inv-susp', 'Suspensa', 'Suspensa', 'suspended')
     on conflict (id) do nothing`,
    [ORG_ATIVA, ORG_SUSPENSA],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name)
     values ($1, $3, 'Contato Ativo'), ($2, $4, 'Contato Suspenso')
     on conflict (id) do nothing`,
    [CONTATO_ATIVO, CONTATO_SUSPENSO, ORG_ATIVA, ORG_SUSPENSA],
  );
  await pool.query(
    `insert into job_queue (organization_id, contact_id, kind, payload)
     values ($1, $3, 'inbound_turn', '{}'::jsonb),
            ($2, $4, 'inbound_turn', '{}'::jsonb)`,
    [ORG_ATIVA, ORG_SUSPENSA, CONTATO_ATIVO, CONTATO_SUSPENSO],
  );
});

afterAll(async () => {
  await pool.query(`delete from job_queue where organization_id in ($1, $2)`, [
    ORG_ATIVA,
    ORG_SUSPENSA,
  ]);
  await pool.end();
});

describe("claim sob organização suspensa", () => {
  it("entrega o job da organização ativa e ignora o da suspensa", async () => {
    const jobs = await claimJobs(pool, { workerId: "invariante-suspensao", maxConcurrency: 10 });
    const orgs = jobs.map((j) => j.organization_id);
    expect(orgs).toContain(ORG_ATIVA);
    expect(orgs).not.toContain(ORG_SUSPENSA);
  });

  it("o job da suspensa continua pendente — não foi perdido nem consumido", async () => {
    const { rows } = await pool.query<{ status: string }>(
      `select status from job_queue where organization_id = $1`,
      [ORG_SUSPENSA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm test:db 2>&1 | tail -25
```

Esperado: `suspensao-nao-roda-job.test.ts` vermelho no primeiro caso — hoje o claim entrega os dois jobs.

- [ ] **Step 3: Filtrar no claim**

Em `lib/agent-engine/queue/queue.ts`, na etapa `dedup` do `CLAIM_SQL`:

A constante passa a ser **exportada**. Não é gosto: sem isso o teste do Step 3-B teria de copiar o SQL,
e é exatamente assim que `queue-relogio.test.ts` acabou medindo uma consulta que já não existe. A
exportação existe para o teste medir **o que roda em produção**, e o comentário diz isso.

```ts
/** Exportado só para o invariante medir o plano de execução do SQL real (Step 3-B). */
export const CLAIM_SQL = `
  with dedup as (
    -- etapa (a): no máximo 1 job por lane por lote; lane sem lead = o próprio id
    select distinct on (coalesce(j.contact_id, j.id)) j.id
    from job_queue j
    where j.status = 'pending' and j.run_after <= now()
      -- SUSPENSÃO: a fila tem CINCO produtores e UM consumidor. O gate mora no
      -- consumo porque é o único ponto por onde todo job passa — tapar produtor
      -- a produtor é como o sexto fica quebrado sem ninguém ver.
      -- `= 'suspended'` e não `<> 'active'` de propósito: o CHECK aceita também
      -- 'redacted' e 'archived', e desligar a fila para eles seria mudança de
      -- comportamento que esta spec não pediu.
      and not exists (select 1 from organizations o
                      where o.id = j.organization_id and o.status = 'suspended')
      and (j.contact_id is null
           or not exists (select 1 from job_queue r
                          where r.contact_id = j.contact_id and r.status = 'running'))
    order by coalesce(j.contact_id, j.id), j.priority, j.run_after
  ),
```

O restante do `CLAIM_SQL` (etapas `runnable` e `update`) fica **exatamente** como está.

- [ ] **Step 3-A: Calar o relógio também**

Filtrar só o claim deixa um defeito de ritmo: `faltaParaOProximoJob`
(`lib/agent-engine/queue/queue.ts:194-211`) pergunta `min(run_after)` com `where status = 'pending'`
e **sem nenhum filtro de organização**. Com backlog de organização suspensa, o relógio manda o
worker acordar, o claim devolve zero, e o laço volta ao ritmo curto — CPU de banco a cada poucos
segundos, para sempre, por trabalho que nunca vai sair.

No `where` daquela consulta, o mesmo predicado do claim:

```sql
       from job_queue
      where status = 'pending'
        and not exists (select 1 from organizations o
                        where o.id = job_queue.organization_id and o.status = 'suspended')
```

- [ ] **Step 3-B: Medir o custo do claim, que ninguém media**

`tests/invariants/queue-relogio.test.ts` é invariante **congelado** e mede a consulta do relógio,
não o `CLAIM_SQL` — a versão anterior deste plano afirmava o contrário. Como o Step 3 declara um
teto de custo para o claim, o teto ganha instrumento aqui, no arquivo NOVO:

Dois casos, e os dois medem **o código do módulo** — nada de SQL copiado para dentro do teste:

```ts
  it("o relógio não acorda o worker por trabalho de organização suspensa", async () => {
    // Comportamento, não plano de execução: com APENAS job de org suspensa
    // pendente, a função tem de dizer "não há nada". Se o NOT EXISTS do
    // Step 3-A sumir, ela devolve um prazo e o laço volta ao ritmo curto.
    await pool.query(`delete from job_queue where organization_id = $1`, [ORG_ATIVA]);
    const falta = await faltaParaOProximoJob(pool);
    expect(falta).toBeNull();
  });

  it("o CLAIM_SQL real segue sob o índice parcial, com o NOT EXISTS", async () => {
    // 5.000 linhas mortas: sem índice, o plano vira Seq Scan e o custo migra
    // para a CPU do banco numa tabela que nada no produto poda.
    await pool.query(
      `insert into job_queue (organization_id, contact_id, kind, payload, status, run_after)
       select $1, null, 'watchdog', '{}'::jsonb, 'done', now() from generate_series(1, 5000)`,
      [ORG_ATIVA],
    );
    await pool.query("analyze job_queue");
    await pool.query("analyze organizations");

    // `explain (analyze)` EXECUTA — e o CLAIM_SQL é um UPDATE. Por isso vai
    // dentro de uma transação que termina em rollback: mede o plano real sem
    // deixar job nenhum marcado como `running`.
    await pool.query("begin");
    const { rows } = await pool.query<{ "QUERY PLAN": string }>(
      `explain (analyze, buffers) ${CLAIM_SQL}`,
      [10, "invariante-explain"],
    );
    await pool.query("rollback");

    const plano = rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plano).toContain("idx_job_queue_claim");
    expect(plano).not.toContain("Seq Scan on job_queue");
  });
```

O import cresce para trazer os dois:

```ts
import { CLAIM_SQL, claimJobs, faltaParaOProximoJob } from "@/lib/agent-engine/queue/queue";
```

O que se espera ver: o `idx_job_queue_claim` selecionando as poucas linhas `pending` e o `NOT EXISTS`
resolvido por busca na chave primária de `organizations` — nunca uma varredura de `job_queue`. Se o
plano de execução mudar (fila com dezenas de milhares de `pending`), o caminho é o índice parcial
`(organization_id) where status='pending'`, e aí é a tripla completa de migration, fora desta release.

- [ ] **Step 4: Rodar e ver passar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm test:db 2>&1 | tail -25
```

Esperado: a suíte inteira verde, inclusive `queue-relogio.test.ts`.

⚠️ **Não confunda o que aquele teste mede.** `tests/invariants/queue-relogio.test.ts:150-165` roda `explain` sobre `select … from job_queue where status = 'pending'` — a consulta do **relógio**, **escrita à mão dentro do próprio teste** e que já diverge da real (`queue.ts:194-211` usa `case … greatest(extract(… least(…)), 0)::int`, o teste usa `least(greatest(…), 86400000)`). Ele **não** mede o `CLAIM_SQL`, e nunca mediu. Quem mede os dois de verdade é o Step 3-B, que importa o SQL e a função do módulo. Aquele arquivo é invariante existente e fica **congelado** (regra de `tests/invariants/README.md`: adicione, não edite) — é justamente por isso que a cópia dele não pode ser a nossa prova.

- [ ] **Step 5: Sabotar**

Troque `and o.status = 'suspended'` por `and o.status = 'nada'`, rode `pnpm test:db` e confirme o primeiro caso vermelho. Restaure.

- [ ] **Step 6: Commit**

```bash
git add lib/agent-engine/queue/queue.ts tests/invariants/suspensao-nao-roda-job.test.ts
git commit -m "feat(bacco): a fila não entrega trabalho de organização suspensa"
```

---

### Task 4: A reativação não vira enxurrada

**Files:**
- Create: `lib/tenancy/limpar-fila-represada.ts`
- Create: `lib/tenancy/limpar-fila-represada.test.ts`
- Create: `lib/tenancy/fila-da-suspensao.handler.ts`
- Create: `lib/tenancy/fila-da-suspensao.handler.test.ts`
- Modify: `app/api/v1/admin/tenants/[id]/reactivate/route.ts`
- Modify: `lib/event-log/register-handlers.ts`

**Interfaces:**
- Consumes: o comportamento da Task 3 (job de org suspensa não é claimado, então limpar não corre com worker em voo).
- Produces: `limparFilaRepresada(admin, organizationId)` → `{ descartados: number }` ou lança; `filaDaSuspensaoHandler: EventHandler` com `key = "fila-da-suspensao.v1"` e `events = ["tenant.suspended", "tenant.reactivated"]`.

**A decisão, e o conflito aparente na spec.** A spec pede "reativação **sem perda** e **sem reenvio em massa**". Se os jobs pendentes ficarem parados, a reativação os libera todos de uma vez — que é a enxurrada. Descartá-los parece "perda". Não é a mesma perda: o que a spec protege são os **dados** (conversas, contatos, mensagens, follow-ups configurados), que ninguém toca. O que se descarta é trabalho **datado**: responder hoje a uma mensagem de semanas atrás é pior que não responder, e disparar de uma vez todas as cadências represadas é exatamente o dano que a frase proíbe. E o descarte não é silencioso — abre aviso na Central.

**Por que DOIS eventos, e não só `tenant.suspended`.** Limpar a fila só no instante da suspensão **não evita a enxurrada**, e esta é a correção mais importante que este plano recebeu. O handler roda uma vez; os produtores continuam inserindo depois. Medido: `lib/agent-engine/edge/crm/drain.ts:488` (o laço do próprio worker segue drenando eventos e enfileirando turnos) e `app/api/v1/cron/followup-flow-worker/route.ts:45-52` (`insert into job_queue` sem **nenhum** filtro de status), agendado a cada minuto em `docker/scheduler/entrypoint.sh:61`. Com o claim já ignorando a organização (Task 3), tudo que chega durante a suspensão empilha `pending` — e sairia junto no primeiro claim depois de reativar.

O conserto não é tapar os cinco produtores (o sexto nasceria quebrado, que é o argumento da Task 3 invertido).

**E não basta consumir `tenant.reactivated`.** Esta é a segunda correção deste plano, e ela desfaz uma
suposição da primeira. Medido em `app/api/v1/admin/tenants/[id]/reactivate/route.ts`: o
`await admin.from("organizations").update({ status: "active" })` **comita**, e só então vem o
`void admin.from("event_log").insert(...)` (o `event_type` está em `:114`). O drain de eventos é cron
`* * * * *` (`docker/scheduler/entrypoint.sh:62`), enquanto o `agent-worker` claima num laço contínuo
(`workers/agent-worker/main.ts:500`). Ou seja: no instante do commit o `CLAIM_SQL` volta a enxergar a
organização e drena o backlog inteiro **antes de o consumidor sequer existir**. A janela não é de
milissegundos — é de até um minuto, a plena velocidade de claim.

**Então a limpeza da reativação mora DENTRO da rota, antes do `UPDATE`** — enquanto a organização
ainda está `suspended` e o claim ainda a ignora. O evento continua tendo consumidor, mas para o que
ele serve de verdade: **avisar**. Custo se errado: se a limpeza falhar, a rota recusa a reativação
com 500 em vez de reativar com a fila cheia — o operador tenta de novo, e isso é melhor que semanas
de cadências disparando juntas.

**Decisão sobre os jobs em HOLD (`run_after = 'infinity'`): ficam.** O `session-watchdog` marca job como `pending` com `run_after = 'infinity'` para segurar o turno enquanto a sessão de WhatsApp está fora do ar (`lib/agent-engine/queue/queue.ts:182-190`). O claim nunca os entrega, por causa do `run_after <= now()` que sempre existiu — então eles **não** participam da enxurrada, e descartá-los apagaria o marcador de estado de sessão que o watchdog usa para reconciliar quando a conexão volta. Hold não é trabalho datado, é estado. Custo se errado: um hold órfão fica `pending` para sempre numa organização suspensa — que é exatamente o que já acontece hoje numa organização ativa com sessão morta, e tem dono próprio (o watchdog), não este handler.

`agent_inbox_items.kind` é vocabulário fechado, e o CHECK **em vigor** é o do apêndice (`supabase/baseline.sql:10043`), não a lista curta do DDL original: hoje são 20+ valores, incluindo `appointment_outcome_required`, `routing_unassigned`, `followup_dead`, `snooze_expired`, `reactivation_expired`, `capabilities_missing`, além de `qr_rescan`, `job_dead`, `event_dead`, `budget_exceeded`, `handoff`, `promotion_review`, `judge_unaligned` e `other`. Nenhum descreve suspensão.

Usamos **`job_dead`**. Os dois candidatos mais próximos foram descartados com motivo: `followup_dead` nomearia só uma das quatro famílias de job descartadas (o `followup_turn`), deixando de fora `inbound_turn`, `watchdog` e `flywheel`; e `reactivation_expired` fala de reativação de LEAD (o cadenciamento que expirou), não de reativação de tenant — reusá-lo confundiria duas coisas que aparecem na mesma Central. `job_dead` é o rótulo honesto (os jobs morreram mesmo) e evita mudança de schema, que esta release não faz.

⚠️ `job_dead` já é emitido pelo reaper (`lib/agent-engine/queue/queue.ts:317` e `:416`), então o mesmo `kind` passa a ter dois motivos. O que distingue é o `title`, e é por isso que ele diz explicitamente "pela suspensão". Custo se errado: quem filtra a Central por `kind` vê os dois juntos. A alternativa — `kind` novo — é migration, e a restrição desta release é não mexer em schema.

- [ ] **Step 1: Escrever o teste que falha**

```ts
/**
 * Suspender guarda os dados e descarta o trabalho DATADO.
 *
 * Sem este consumidor, `tenant.suspended` era emitido
 * (`app/api/v1/admin/tenants/[id]/suspend/route.ts:109`) e ninguém escutava —
 * o anti-pattern nº 3 da doutrina, evento sem consumer. O efeito prático
 * aparecia só na REATIVAÇÃO: toda a fila represada saía de uma vez, que é o
 * "reenvio em massa" que a spec proíbe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { filaDaSuspensaoHandler } from "@/lib/tenancy/fila-da-suspensao.handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegisteredHandlers } from "@/lib/event-log/dispatcher";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/tenancy/limpar-fila-represada", () => ({ limparFilaRepresada: vi.fn() }));

function banco() {
  const inseridos: Record<string, unknown>[] = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => ({
      insert: vi.fn(async (linha: Record<string, unknown>) => {
        inseridos.push(linha);
        return { error: null };
      }),
    })),
  } as unknown as ReturnType<typeof createAdminClient>);
  return inseridos;
}

function evento(
  tipo: "tenant.suspended" | "tenant.reactivated",
  payload: Record<string, unknown> = {},
) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: ORG,
    event_type: tipo,
    payload: { tenant_id: ORG, reason: "inadimplência", ...payload },
  } as Parameters<typeof filaDaSuspensaoHandler.handle>[0];
}

beforeEach(() => vi.clearAllMocks());

describe("consumidor da fila represada por suspensão", () => {
  it("na SUSPENSÃO limpa a fila e abre UM aviso com a contagem", async () => {
    const inseridos = banco();
    vi.mocked(limparFilaRepresada).mockResolvedValue({ descartados: 2 });
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.suspended"));
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("descartados=2");
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({
      organization_id: ORG,
      kind: "job_dead",
      severity: "warn",
    });
  });

  it("na REATIVAÇÃO não limpa nada — quem limpou foi a rota, antes do UPDATE", async () => {
    // Este é o caso que registra a correção mais cara deste plano. Limpar aqui
    // seria tarde: o `update({status:"active"})` da rota comita e o claim volta
    // a enxergar a organização IMEDIATAMENTE, enquanto este handler só roda no
    // próximo tick do cron do drain (`* * * * *`) — até 60s depois, com o
    // worker claimando em laço contínuo. O backlog já teria saído.
    const inseridos = banco();
    const r = await filaDaSuspensaoHandler.handle(
      evento("tenant.reactivated", { jobs_descartados: 3 }),
    );
    expect(limparFilaRepresada).not.toHaveBeenCalled();
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("descartados=3");
    expect(inseridos[0]).toMatchObject({ kind: "job_dead" });
  });

  it("sem fila represada, não abre aviso nenhum", async () => {
    const inseridos = banco();
    vi.mocked(limparFilaRepresada).mockResolvedValue({ descartados: 0 });
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.suspended"));
    expect(r.status).toBe("skipped");
    expect(inseridos).toHaveLength(0);
  });

  it("reativação sem contagem no payload é silenciosa, não um aviso de zero", async () => {
    const inseridos = banco();
    const r = await filaDaSuspensaoHandler.handle(evento("tenant.reactivated"));
    expect(r.status).toBe("skipped");
    expect(inseridos).toHaveLength(0);
  });

  it("consome os dois eventos do ciclo, e só eles", () => {
    expect(filaDaSuspensaoHandler.events).toEqual([
      "tenant.suspended",
      "tenant.reactivated",
    ]);
  });

  it("está REGISTRADO no dispatcher — senão nada disto roda em produção", () => {
    // Declarar `events` não registra nada. Sem este caso, esquecer o Step 4
    // deixaria a suíte inteira verde com os dois eventos ainda sem consumidor,
    // que é o defeito que esta task existe para fechar.
    ensureHandlersRegistered();
    const chaves = getRegisteredHandlers().map((h) => h.key);
    expect(chaves).toContain(FILA_DA_SUSPENSAO_HANDLER_KEY);
  });

  // Catraca de ORDEM. O risco central desta task não é a query, é QUANDO ela
  // roda: o `update` do status comita e o `agent-worker` claima em laço
  // contínuo, enquanto o drain do event_log é cron de um minuto. Nenhuma prova
  // de comportamento alcança isso numa unidade — então vigia-se o texto.
  it("a rota limpa ANTES de virar o status — a ordem é a task inteira", () => {
    const rota = readFileSync(
      join(process.cwd(), "app", "api", "v1", "admin", "tenants", "[id]", "reactivate", "route.ts"),
      "utf8",
    );
    const limpeza = rota.indexOf("limparFilaRepresada(");
    const virada = rota.indexOf('status: "active"');

    expect(limpeza, "a rota de reativação chama a limpeza").toBeGreaterThan(-1);
    expect(virada, "a rota de reativação vira o status").toBeGreaterThan(-1);
    expect(
      limpeza,
      "limpar DEPOIS do update não adianta: no commit o claim volta a enxergar a organização e drena a fila antes de o drain rodar",
    ).toBeLessThan(virada);
  });
});
```

O import da chave entra junto dos demais, no topo do arquivo:

```ts
import {
  FILA_DA_SUSPENSAO_HANDLER_KEY,
  filaDaSuspensaoHandler,
} from "@/lib/tenancy/fila-da-suspensao.handler";
import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/tenancy/fila-da-suspensao.handler.test.ts
```

Esperado: falha de import — o módulo não existe.

- [ ] **Step 3: Escrever a limpeza, num módulo só, e ligá-la à rota de reativação**

A limpeza é a mesma nos dois lados, então mora num lugar só — e é chamada de dois:

```ts
/**
 * Descarta o trabalho represado de uma organização suspensa.
 *
 * Um módulo, dois chamadores, porque o INSTANTE de limpar é diferente em cada
 * ponta e só um deles pode ser um consumidor de evento:
 *
 *  - na SUSPENSÃO, quem chama é o handler de `tenant.suspended`. Pode ser
 *    assíncrono: quando o evento é drenado, o status já é `suspended` e o
 *    claim já ignora a organização, então nada corre com worker em voo.
 *  - na REATIVAÇÃO, quem chama é a PRÓPRIA ROTA, antes do `update` do status.
 *    Aqui não dá para esperar o evento: o `update` comita e o claim volta a
 *    enxergar a organização na hora, enquanto o drain é cron de um minuto.
 *
 * `run_after` finito exclui os jobs em HOLD sem depender de o PostgREST
 * entender o literal `infinity`: o session-watchdog usa `run_after='infinity'`
 * para segurar o turno enquanto a sessão de WhatsApp está fora do ar, o claim
 * nunca os entrega (`run_after <= now()`), e matá-los apagaria o marcador que o
 * watchdog usa para reconciliar. Hold é estado de sessão, não trabalho datado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Qualquer data real é menor que esta; `infinity` não é. */
const LIMITE_FINITO = "9999-12-31T00:00:00.000Z";

export async function limparFilaRepresada(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ descartados: number }> {
  const { data, error } = await admin
    .from("job_queue")
    .update({ status: "dead", last_error: "organização suspensa" })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("run_after", LIMITE_FINITO)
    .select("id");

  if (error) throw new Error(`limparFilaRepresada: ${error.message}`);
  return { descartados: data?.length ?? 0 };
}
```

Em `app/api/v1/admin/tenants/[id]/reactivate/route.ts`, **antes** do `update` que já existe:

```ts
  // ANTES de virar o status, e não depois: enquanto a organização ainda está
  // `suspended`, o claim a ignora e a limpeza não corre com worker em voo. Um
  // milissegundo depois do commit, o `agent-worker` já estaria drenando tudo.
  let jobsDescartados = 0;
  try {
    ({ descartados: jobsDescartados } = await limparFilaRepresada(admin, tenantId));
  } catch (err) {
    // Reativar com a fila cheia é o dano que esta task existe para impedir —
    // então a reativação FALHA e o operador tenta de novo.
    return fail(
      "internal_error",
      `Failed to clear queued work: ${err instanceof Error ? err.message : String(err)}`,
      500,
      { requestId },
    );
  }
```

e a contagem viaja no evento que a rota já emite (o `event_type` está em `:114`), para o aviso poder
dizer quantos:

```ts
    payload: {
      tenant_id: tenantId,
      reactivated_by: adminCtx.user.id,
      reason: body.reason,
      jobs_descartados: jobsDescartados,
    },
```

- [ ] **Step 3-B: O teste do módulo, que faltava — sem ele a sabotagem nº 1 mente**

O teste do Step 1 **mocka** `limparFilaRepresada`, e isso está certo lá: ele prova o handler, não a
query. Mas então a query real fica sem prova nenhuma, e a sabotagem nº 1 do Step 5 — trocar
`pending` por `running` — **não ficaria vermelha**, porque quem roda naquele arquivo é o dublê. É o
terceiro caso de prova vácua que este plano pagou; o conserto é um arquivo próprio, com um dublê
que **registra os filtros** em vez de só devolver linhas.

Crie `lib/tenancy/limpar-fila-represada.test.ts`:

```ts
/**
 * A QUERY da limpeza, medida.
 *
 * O teste do handler mocka este módulo de propósito — lá o que se prova é o
 * consumidor. Sem ESTE arquivo, os filtros não teriam prova alguma e uma troca
 * de `pending` por `running` passaria verde: o descarte silenciosamente não
 * descartaria nada, e a enxurrada voltaria na reativação seguinte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";

const ORG = "22222222-2222-4222-8222-222222222222";

/** Dublê que REGISTRA o que foi filtrado — é o filtro que está sob teste. */
function clienteQueRegistra(resultado: {
  data: { id: string }[] | null;
  error: { message: string } | null;
}) {
  const chamadas = {
    tabela: "",
    patch: {} as Record<string, unknown>,
    filtros: [] as [string, string, unknown][],
  };
  const cadeia = {
    update(patch: Record<string, unknown>) {
      chamadas.patch = patch;
      return cadeia;
    },
    eq(coluna: string, valor: unknown) {
      chamadas.filtros.push(["eq", coluna, valor]);
      return cadeia;
    },
    lt(coluna: string, valor: unknown) {
      chamadas.filtros.push(["lt", coluna, valor]);
      return cadeia;
    },
    select: vi.fn(async () => resultado),
  };
  const admin = {
    from(tabela: string) {
      chamadas.tabela = tabela;
      return cadeia;
    },
  };
  return { admin, chamadas };
}

beforeEach(() => vi.clearAllMocks());

describe("limparFilaRepresada", () => {
  it("descarta só o pendente da organização certa, e devolve a contagem", async () => {
    const { admin, chamadas } = clienteQueRegistra({
      data: [{ id: "j1" }, { id: "j2" }],
      error: null,
    });

    const r = await limparFilaRepresada(admin as never, ORG);

    expect(r.descartados).toBe(2);
    expect(chamadas.tabela).toBe("job_queue");
    expect(chamadas.filtros).toContainEqual(["eq", "organization_id", ORG]);
    // É ESTE expect que a sabotagem nº 1 do Step 5 derruba.
    expect(chamadas.filtros).toContainEqual(["eq", "status", "pending"]);
  });

  it("deixa o hold do watchdog em paz", async () => {
    const { admin, chamadas } = clienteQueRegistra({ data: [], error: null });

    await limparFilaRepresada(admin as never, ORG);

    const lt = chamadas.filtros.find(([op, coluna]) => op === "lt" && coluna === "run_after");
    expect(lt, "o hold sai do descarte por um limite finito de run_after").toBeDefined();
    expect(String(lt?.[2])).toMatch(/^9999-/);
  });

  it("marca dead com o motivo, para a Central não mentir sobre a causa", async () => {
    const { admin, chamadas } = clienteQueRegistra({ data: [{ id: "j1" }], error: null });

    await limparFilaRepresada(admin as never, ORG);

    expect(chamadas.patch).toMatchObject({
      status: "dead",
      last_error: "organização suspensa",
    });
  });

  it("erro do banco sobe com o texto real, nunca engolido", async () => {
    const { admin } = clienteQueRegistra({ data: null, error: { message: "deadlock detected" } });

    await expect(limparFilaRepresada(admin as never, ORG)).rejects.toThrow(/deadlock detected/);
  });
});
```

Rodar:

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/tenancy/limpar-fila-represada.test.ts
```

- [ ] **Step 3-A: Escrever o consumidor, que agora é o AVISO**

```ts
/**
 * O aviso da fila represada — nos DOIS eventos do ciclo.
 *
 * As duas rotas emitem seus eventos desde sempre
 * (`admin/tenants/[id]/suspend/route.ts:109` e `.../reactivate/route.ts:114`)
 * e até aqui ninguém escutava nenhum dos dois — o anti-pattern nº 3 da
 * doutrina, evento sem consumer, em dobro.
 *
 * O que ele faz em cada um é diferente, e essa assimetria é o conserto:
 *
 *  - `tenant.suspended`: limpa e avisa. Assíncrono serve, porque o status já
 *    está gravado e o claim já ignora a organização.
 *  - `tenant.reactivated`: só avisa, lendo `payload.jobs_descartados`. A
 *    limpeza já aconteceu DENTRO da rota, antes do `update` — se fosse aqui,
 *    chegaria até um minuto tarde (drain é cron `* * * * *`) e o backlog já
 *    teria saído no claim, que roda em laço contínuo.
 *
 * Por que descartar não é "perda": os dados ficam inteiros (conversas,
 * contatos, mensagens, fluxos). O que se descarta é trabalho DATADO, e é
 * anunciado — o aviso na Central diz quantos e por quê.
 *
 * `kind: 'job_dead'` porque o vocabulário de `agent_inbox_items` é CHECK
 * fechado e não tem valor de suspensão; e é o rótulo honesto: os jobs
 * morreram mesmo. O `title` é o que distingue do `job_dead` do reaper.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { limparFilaRepresada } from "@/lib/tenancy/limpar-fila-represada";

export const FILA_DA_SUSPENSAO_HANDLER_KEY = "fila-da-suspensao.v1";

export const filaDaSuspensaoHandler: EventHandler = {
  key: FILA_DA_SUSPENSAO_HANDLER_KEY,
  events: ["tenant.suspended", "tenant.reactivated"],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const orgId = row.organization_id;
      const naReativacao = row.event_type === "tenant.reactivated";

      const quantos = naReativacao
        ? Number((row.payload as { jobs_descartados?: number } | null)?.jobs_descartados ?? 0)
        : (await limparFilaRepresada(admin, orgId)).descartados;

      if (quantos === 0) {
        return {
          consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
          status: "skipped",
          detail: `descartados=0 (fila vazia em ${row.event_type})`,
        };
      }

      // UM aviso com a contagem, não um por job: 300 alertas idênticos é o
      // mesmo que nenhum — foi o que a VPS já pagou com o `job_dead` do reaper.
      const { error: erroAviso } = await admin.from("agent_inbox_items").insert({
        organization_id: orgId,
        kind: "job_dead",
        severity: "warn",
        title: naReativacao
          ? "Trabalho acumulado descartado antes de reativar"
          : "Trabalho pendente descartado pela suspensão",
        body: naReativacao
          ? `${quantos} job(s) que se acumularam enquanto a organização estava ` +
            `suspensa foram descartados agora, para que a reativação não ` +
            `dispare tudo de uma vez. Os dados não foram tocados; o atendimento ` +
            `recomeça do que chegar a partir de agora.`
          : `${quantos} job(s) pendentes foram descartados quando a organização ` +
            `foi suspensa. Os dados não foram tocados. Na reativação, nada será ` +
            `reenviado em massa — o atendimento recomeça do que chegar depois.`,
      });

      if (erroAviso) {
        return {
          consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
          status: "error",
          detail: `fila limpa (${quantos}) mas o aviso falhou: ${erroAviso.message}`,
        };
      }

      return {
        consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY,
        status: "ok",
        detail: `descartados=${quantos} (${row.event_type})`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: FILA_DA_SUSPENSAO_HANDLER_KEY, status: "error", detail };
    }
  },
};
```

**Janela declarada, agora medida.** Com a limpeza dentro da rota, a única brecha é entre o
`limparFilaRepresada` e o `UPDATE` da linha seguinte: um produtor que enfileire exatamente aí escapa.
São milissegundos entre duas instruções do mesmo handler, e o pior caso é **um** job — contra a janela
anterior, de até 60 segundos de claim contínuo. Fechá-la de vez exigiria transação entre a rota e o
worker, que não existe neste desenho e não vale o acoplamento.

- [ ] **Step 4: Registrar o consumidor**

Em `lib/event-log/register-handlers.ts`, o import junto dos demais:

```ts
import { filaDaSuspensaoHandler } from "@/lib/tenancy/fila-da-suspensao.handler";
```

e o registro, **antes** do `conversaoDeVendaHandler` (que a própria função declara como "por último"):

```ts
  registerHandler(webPushInboundHandler);
  // Suspensão é administrativa e não depende de rede de terceiro — entra antes
  // do consumidor mais externo, que é o de conversão.
  registerHandler(filaDaSuspensaoHandler);
```

O caso "está REGISTRADO no dispatcher" do Step 1 é o que reprova esquecer este step.

- [ ] **Step 5: Rodar, sabotar, rodar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run lib/tenancy/fila-da-suspensao.handler.test.ts
```

Verde nos dois arquivos:

```bash
pnpm vitest run lib/tenancy/limpar-fila-represada.test.ts
```

Depois **quatro** sabotagens, uma por buraco que esta task fecha. Como agora são DOIS arquivos de
teste, cada uma diz onde fica vermelha — e essa distinção é o ponto:

1. em `limpar-fila-represada.ts`, troque `.eq("status", "pending")` por `.eq("status", "running")` → vermelho em **`limpar-fila-represada.test.ts`** ("descarta só o pendente…"). No arquivo do handler **nada muda**, porque lá o módulo é dublê: era exatamente esse o buraco que o Step 3-B fechou;
2. no handler, faça a reativação também chamar `limparFilaRepresada` → vermelho em **`fila-da-suspensao.handler.test.ts`** ("na REATIVAÇÃO não limpa nada"), que é o que impede a regressão de voltar ao desenho tardio;
3. tire `"tenant.reactivated"` de `events` → vermelho em **`fila-da-suspensao.handler.test.ts`** (os casos da reativação e do registro);
4. na rota, mova a chamada de `limparFilaRepresada` para **depois** do `update` do status → vermelho em **`fila-da-suspensao.handler.test.ts`** ("a rota limpa ANTES de virar o status"), pela catraca de ordem do Step 1.

Restaure as quatro. Um teste que não fica vermelho quando a regra some não é prova.

⚠️ **O que a catraca da nº 4 NÃO cobre.** Ela lê o TEXTO da rota e compara posições: pega a
inversão de ordem, que é o modo de falha real, mas não pega um `await` esquecido, uma limpeza que
roda antes e falha em silêncio, nem alguém que chame o módulo de um terceiro lugar. Para isso valem
os outros casos e a prova em tela da Task 6.

- [ ] **Step 6: Gates e commit**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm typecheck && pnpm lint && pnpm test:unit > /tmp/vt4.log 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " /tmp/vt4.log | tail -3
git add lib/tenancy/ lib/event-log/register-handlers.ts "app/api/v1/admin/tenants/[id]/reactivate/route.ts"
git commit -m "feat(bacco): a fila represada é limpa antes de reativar, e o descarte vira aviso"
```

---

### Task 5: A linha que não vira código, o mapa e o fragmento

**Files:**
- Create: `tests/unit/suspensao-campanha-nao-existe.test.ts`
- Create: `docs/architecture/enforcement-da-suspensao.architecture.json`
- Modify: `docs/architecture/README.md`
- Create: `.changes/bacco-enforcement-da-suspensao.md`

**Interfaces:**
- Consumes: os nomes de arquivo das Tasks 1-4 (o mapa cita cada um).
- Produces: nada que outra task consuma.

- [ ] **Step 1: Congelar a linha "campanhas"**

A matriz da spec tem uma linha para campanhas. Medido: **a superfície não existe** — zero tabela `campaign*`/`campanha*` no `baseline.sql`; `app/api/v1/ads/meta/campaigns` é leitura de campanha de ANÚNCIO do Meta e `app/api/v1/leads/bulk` é importação de leads, nenhum dos dois envia mensagem. Escrever gate para superfície inexistente é código que não protege nada; o que protege é um teste que **avisa quando ela nascer**:

```ts
/**
 * A linha "campanhas" da matriz de suspensão (§6a) não virou código porque a
 * superfície NÃO EXISTE — e este teste é o que garante que essa afirmação não
 * apodreça em silêncio.
 *
 * No dia em que alguém criar disparo em massa, este teste fica vermelho e
 * obriga a decidir o que a suspensão faz com ele. Sem isto, a linha seguiria
 * "coberta" num documento enquanto o produto ganhava exatamente o canal que
 * uma organização suspensa não pode ter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("superfície de campanha", () => {
  it("não existe no schema — se passar a existir, a suspensão precisa decidir sobre ela", () => {
    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    // O prefixo `public.` é OPCIONAL no regex de propósito. O dump do Supabase
    // emite `CREATE TABLE "public"."x"`, mas o APÊNDICE idempotente — que é
    // onde o fork Bacco cria tabela — emite `create table if not exists x (`,
    // sem schema. Exigir o literal `public` alcança 83 das 137 `create table`
    // do baseline e deixa o apêndice inteiro invisível: uma tabela `campanhas`
    // nascida ali passaria batida, com o teste verde.
    const tabelas = [
      ...baseline.matchAll(/create table\s+(?:if not exists\s+)?(?:"?public"?\.)?"?([a-z_]+)"?/gi),
    ].map((m) => m[1]!.toLowerCase());
    // Controle da RÉGUA: se a contagem cair, o regex parou de enxergar parte do
    // arquivo e o `toEqual([])` abaixo vira falso verde.
    //
    // 136 é o que este regex casa hoje (131 nomes únicos — o baseline recria
    // algumas tabelas no apêndice). NÃO recontar de cabeça; o número sai de:
    //   node -e 'const s=require("fs").readFileSync("supabase/baseline.sql","utf8");
    //     console.log([...s.matchAll(/create table\s+(?:if not exists\s+)?(?:"?public"?\.)?"?([a-z_]+)"?/gi)].length)'
    expect(tabelas.length).toBeGreaterThanOrEqual(136);
    const suspeitas = tabelas.filter((t) => t.includes("campaign") || t.includes("campanha"));
    expect(suspeitas).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run tests/unit/suspensao-campanha-nao-existe.test.ts
```

Esperado: verde já na primeira rodada (é um congelamento de estado, não TDD). Se o `toBeGreaterThanOrEqual`
reprovar, a régua envelheceu — rode o comando do comentário e atualize o número, **nunca** o baixe no chute.

- [ ] **Step 3: Escrever o mapa vivo**

`docs/architecture/enforcement-da-suspensao.architecture.json` — a forma é a que `tests/unit/mapas-de-arquitetura.test.ts` valida: `lanes`, `nodes` com `id`/`lane`/`col`/`type`/`label`, `edges` com `id`/`from`/`to`/`label`, e `mainPath` só com ids existentes. Nenhum node órfão.

```json
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "meta": {
    "title": "Enforcement da suspensão",
    "subtitle": "Um status, três funis de superfície e um consumidor que evita a enxurrada",
    "output": "enforcement-da-suspensao.html",
    "quality_profile": "standard"
  },
  "lanes": [
    { "id": "admin", "label": "Plataforma" },
    { "id": "codigo", "label": "Código" },
    { "id": "superficie", "label": "Superfícies" },
    { "id": "banco", "label": "Banco" }
  ],
  "mainPath": ["rota_suspender", "status", "require_role", "api_cookie", "handler", "fila"],
  "nodes": [
    { "id": "rota_suspender", "lane": "admin", "col": 0, "type": "route", "label": "POST /api/v1/admin/tenants/:id/suspend: grava o status e emite o evento" },
    { "id": "rota_reativar", "lane": "admin", "col": 0, "type": "route", "label": "POST /api/v1/admin/tenants/:id/reactivate: status volta a 'active'" },
    { "id": "status", "lane": "banco", "col": 1, "type": "table", "label": "organizations.status: 'active' | 'suspended' | 'redacted' | 'archived'" },
    { "id": "evento", "lane": "banco", "col": 1, "type": "table", "label": "event_log 'tenant.suspended': emitido na suspensão" },
    { "id": "evento_reativar", "lane": "banco", "col": 1, "type": "table", "label": "event_log 'tenant.reactivated': emitido na reativação" },
    { "id": "require_role", "lane": "codigo", "col": 2, "type": "lib", "label": "lib/auth/require-role.ts: 403 tenant_suspended antes da RPC de papel" },
    { "id": "bearer", "lane": "codigo", "col": 2, "type": "lib", "label": "lib/mcp/auth.ts: validateBearerToken recusa com -32002/403" },
    { "id": "claim", "lane": "codigo", "col": 2, "type": "lib", "label": "lib/agent-engine/queue/queue.ts: CLAIM_SQL ignora job de org suspensa" },
    { "id": "handler", "lane": "codigo", "col": 2, "type": "lib", "label": "lib/tenancy/fila-da-suspensao.handler.ts: descarta a fila represada nos dois eventos e avisa" },
    { "id": "layout", "lane": "superficie", "col": 3, "type": "page", "label": "app/app/layout.tsx: redireciona para /account-suspended" },
    { "id": "api_cookie", "lane": "superficie", "col": 3, "type": "route", "label": "/api/v1/* com sessão de navegador — inclui o envio humano pela inbox" },
    { "id": "api_token", "lane": "superficie", "col": 3, "type": "route", "label": "/api/v1/* com Bearer e /api/mcp" },
    { "id": "fila", "lane": "superficie", "col": 3, "type": "worker", "label": "agent-worker: agente, follow-up, automações e crons" },
    { "id": "aviso", "lane": "superficie", "col": 3, "type": "page", "label": "Central: aviso job_dead com a contagem descartada" }
  ],
  "edges": [
    { "id": "suspender-status", "from": "rota_suspender", "to": "status", "label": "status = 'suspended'" },
    { "id": "suspender-evento", "from": "rota_suspender", "to": "evento", "label": "emite tenant.suspended" },
    { "id": "reativar-status", "from": "rota_reativar", "to": "status", "label": "status = 'active'; nada é reenviado" },
    { "id": "reativar-evento", "from": "rota_reativar", "to": "evento_reativar", "label": "emite tenant.reactivated" },
    { "id": "eventoreativar-handler", "from": "evento_reativar", "to": "handler", "label": "limpa o que empilhou durante a suspensão" },
    { "id": "status-requirerole", "from": "status", "to": "require_role", "label": "vem no join que já trazia nome e idioma" },
    { "id": "status-bearer", "from": "status", "to": "bearer", "label": "embed organizations(status) no select do token" },
    { "id": "status-claim", "from": "status", "to": "claim", "label": "NOT EXISTS por chave primária no claim" },
    { "id": "evento-handler", "from": "evento", "to": "handler", "label": "registrado em register-handlers.ts" },
    { "id": "requirerole-api", "from": "require_role", "to": "api_cookie", "label": "403 tenant_suspended" },
    { "id": "requirerole-layout", "from": "require_role", "to": "layout", "label": "a tela já redirecionava; o gate cobre a API" },
    { "id": "bearer-apitoken", "from": "bearer", "to": "api_token", "label": "403 nas duas superfícies, de um ponto só" },
    { "id": "claim-fila", "from": "claim", "to": "fila", "label": "cinco produtores, um consumidor" },
    { "id": "handler-fila", "from": "handler", "to": "fila", "label": "marca os pendentes como dead" },
    { "id": "handler-aviso", "from": "handler", "to": "aviso", "label": "um aviso com a contagem, não um por job" },
    { "id": "status-layout", "from": "status", "to": "layout", "label": "o Server Component lê organizations.status direto" },
    { "id": "layout-apicookie", "from": "layout", "to": "api_cookie", "label": "a MESMA sessão que a tela redireciona seguia chamando a API — é o defeito que o gate fecha" },
    { "id": "apitoken-fila", "from": "api_token", "to": "fila", "label": "o que a integração escrevia virava evento e job; com o 403, nada entra" },
    { "id": "aviso-reativar", "from": "aviso", "to": "rota_reativar", "label": "a contagem descartada é o que o operador lê antes de reativar" }
  ]
}
```

- [ ] **Step 4: Linha no README dos mapas**

Em `docs/architecture/README.md`, na tabela `| arquivo | escopo |`:

```markdown
| `enforcement-da-suspensao.architecture.json` | suspensão que PARA o produto (Plano 3) — 14 peças, 19 arestas; o status lido nos três funis de superfície (sessão, token/MCP, claim da fila), por que o gate fica depois do bypass de platform admin, e o consumidor de `tenant.suspended` **e** `tenant.reactivated` que impede a reativação de virar enxurrada |
```

- [ ] **Step 5: Validar o mapa**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm vitest run tests/unit/mapas-de-arquitetura.test.ts
```

Esperado: verde. Ele reprova aresta para id inexistente, node órfão, lane inexistente e `mainPath` com id morto.

- [ ] **Step 6: Fragmento de release**

`.changes/bacco-enforcement-da-suspensao.md`:

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Suspender uma organização agora para o atendimento, não só a tela
---

Até aqui, suspender uma organização redirecionava quem entrava pelo navegador e mais nada: a API
seguia respondendo, o token de integração e o MCP continuavam trabalhando, e o agente de IA seguia
conversando no WhatsApp. Agora a suspensão vale em todas as portas — sessão, token, MCP, agente,
follow-ups e automações — e o trabalho que estava na fila é descartado com aviso na Central, para
que a reativação não dispare semanas de mensagens de uma vez. Os dados não são tocados: conversas,
contatos e configurações continuam inteiros, e reativar devolve o sistema como estava.
```

- [ ] **Step 7: Conferir e commitar**

```bash
export PATH=/home/lussandro/.nvm/versions/node/v22.23.2/bin:$PATH
pnpm release:conferir
git add tests/unit/suspensao-campanha-nao-existe.test.ts docs/architecture/ .changes/bacco-enforcement-da-suspensao.md
git commit -m "docs(bacco): mapa vivo, fragmento e a linha de campanha declarada inexistente"
```

---

### Task 6: CI, release e prova em tela na VPS

**Files:**
- Create: `tests/e2e/bacco-suspensao.spec.ts`
- Modify: `.github/workflows/e2e.yml` (entrada em `FORA_DO_CI`, com motivo)

**Interfaces:**
- Consumes: tudo das Tasks 1-5.
- Produces: a release.

**⚠️ Esta task suspende a organização de QA numa VPS de produção.** É reversível (a reativação acontece no mesmo teste), toca só a org QA — "Vinícola Serra Alta (QA)", medida em 2026-09-16 com 0 conversas e 0 contatos — e **precisa de autorização explícita do dono antes da primeira suspensão**. Se ele não autorizar, a prova em tela não acontece e a tag não sai: a doutrina de QA Visual não tem exceção por conveniência.

- [ ] **Step 1: Push e CI**

```bash
git push --no-tags origin bacco:main
gh run list -R lussandro/bacco-adega-crm --limit 5 --json headSha,name,status,conclusion \
  --jq '.[]|[(.headSha[0:8]),.name,.status,.conclusion//"-"]|@tsv'
```

`gh` sem `-R` neste diretório responde pelo **upstream** `melgarafael/DeskcommCRM` — o run do fork não aparece e parece que nada rodou.

- [ ] **Step 2: Subir a candidata móvel na VPS**

O script **não existe** na VPS — medido em 2026-09-16, lá só há `/root/release-2694.sh`. Crie antes de chamar, e por arquivo: num `ssh ... bash -s <<EOF` o `read` do caminho de backup do `update.sh` engole o resto do script.

```bash
ssh -i ~/.ssh/bacco-support root@2.25.222.110 'cat > /root/release-candidata.sh' <<"SH"
set -e
cd /opt/bacco-adega-crm
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
export SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres"
bash hostgator-setup-kit/update.sh --to main --force > /root/bacco-update-candidata.log 2>&1
SH
ssh -i ~/.ssh/bacco-support root@2.25.222.110 'bash /root/release-candidata.sh; echo "exit=$?"; tail -5 /root/bacco-update-candidata.log' </dev/null
```

O `--force` é necessário e seguro aqui: o `update.sh` compara `main` como número de versão e **recusa** achando que é downgrade (`"versão main é ANTERIOR"`). A recusa é a proteção contra downgrade funcionando; forçar só é legítimo porque a candidata É o topo da `main`.

- [ ] **Step 3: Escrever a spec da prova**

`tests/e2e/bacco-suspensao.spec.ts` dirige o navegador contra a VPS, com a conta de QA, e mede **cada linha da matriz**:

```ts
import { expect, test } from "@playwright/test";

/**
 * A suspensão vista pela tela, na VPS, com recursos reais.
 *
 * Mede as linhas da matriz §6a que um teste de unidade não alcança: a tela
 * redirecionando, a API da MESMA sessão recusando, e a volta ao normal depois
 * da reativação. Suspende e reativa a organização de QA — nunca a de produção.
 */
const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";

/**
 * A SUSPENSÃO NÃO É FEITA POR HTTP, e isso não é atalho.
 *
 * `POST /api/v1/admin/tenants/:id/suspend` chama `requirePlatformAdmin()`, que
 * resolve a identidade por `createClient()` — cookie de sessão, nunca header
 * (`lib/auth/requirePlatformAdmin.ts:21,35,39`). Um `request.post` do Playwright
 * com `Authorization: Bearer` chega sem cookie e recebe 403, jamais 200. E a
 * conta de QA não é platform admin, então nem a sessão dela serve.
 *
 * Quem vira a chave é o banco — que é o que um operador de self-host faria. E
 * quem fala com o banco é ESTA SPEC, não um humano num terminal ao lado: uma
 * prova que depende de alguém colar um comando no meio do `expect.poll` não é
 * reproduzível, não dá "1 passed" e não sobrevive à segunda rodada. O contêiner
 * do Playwright roda na bridge do Docker da VPS e alcança o Postgres em
 * `172.17.0.1:5432`, o mesmo endereço que o `.env` do CRM usa.
 */
import pg from "pg";

const ORG_QA = "vinicola-serra-alta-qa";
const DB_URL = process.env.SUPABASE_DB_ADMIN_URL ?? "";

async function virarAChave(alvo: "suspended" | "active") {
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query(
      alvo === "suspended"
        ? `update organizations
              set status = 'suspended', suspended_at = now(),
                  suspended_reason = 'prova em tela do Plano 3'
            where slug = $1`
        : `update organizations
              set status = 'active', suspended_at = null,
                  suspended_reason = null, suspended_by = null
            where slug = $1`,
      [ORG_QA],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Espera a consequência VISÍVEL, não um `sleep` nem o banco.
 *
 * O `update` acima comita na hora, mas quem observa é o produto: a API da
 * sessão passa a responder 403 `tenant_suspended`, ou volta a 200. Medir o
 * efeito em vez do instante é o que evitou três falsos positivos na prova das
 * jornadas.
 */
async function esperarStatus(page: import("@playwright/test").Page, alvo: "suspended" | "active") {
  const esperado = alvo === "suspended" ? 403 : 200;
  await expect
    .poll(async () => (await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`)).status(), {
      message: `a API devia responder ${esperado} depois de ${alvo}`,
      timeout: 60_000,
      intervals: [1_000],
    })
    .toBe(esperado);
}

// FAIL-SAFE: a organização de QA NUNCA fica suspensa porque a prova quebrou no
// meio. Roda mesmo com o teste vermelho.
test.afterAll(async () => {
  await virarAChave("active");
});

test("organização suspensa para, e reativada volta", async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#email").fill(QA_EMAIL);
  await page.locator("#password").fill(QA_SENHA);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });

  // ANTES: a API da sessão responde normalmente.
  const antes = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(antes.status()).toBe(200);

  await virarAChave("suspended");
  await esperarStatus(page, "suspended");

  // TELA: a navegação seguinte cai na página de conta suspensa.
  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/account-suspended/);
  await expect(page.getByRole("heading", { name: /conta suspensa/i })).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-tela-suspensa.png`, fullPage: true });

  // API DA MESMA SESSÃO: 403 com o código novo. É a linha da matriz que o
  // redirect de tela NÃO cobre — layout não roda em rota de API.
  const durante = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(durante.status()).toBe(403);
  expect((await durante.json()).error.code).toBe("tenant_suspended");

  await virarAChave("active");
  await esperarStatus(page, "active");

  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/app\//);
  const depois = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(depois.status()).toBe(200);
  await page.screenshot({ path: `${OUT}/02-reativada.png`, fullPage: true });
});
```

- [ ] **Step 3-A: Dar à spec o endereço do banco, e só isso**

A spec vira a chave sozinha, então o contêiner do Playwright precisa da mesma URL que o CRM usa.
Monte-a na VPS, na hora de rodar, sem gravá-la em arquivo:

```bash
ssh -i ~/.ssh/bacco-support root@2.25.222.110 'bash -s' <<'REMOTO' </dev/null
PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)"
docker run --rm -v /root/prova-suspensao:/work -w /work \
  -e BASE_URL -e QA_EMAIL -e QA_SENHA \
  -e SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test bacco-suspensao.spec.ts
REMOTO
```

⚠️ **O que este caminho NÃO prova.** O `update` direto não emite `tenant.suspended` nem
`tenant.reactivated` — quem emite é a rota, e a rota exige platform admin por cookie. Então a prova em
tela cobre as Tasks 1-3 (os três gates) e **não** o consumidor da Task 4, cuja prova é a suíte de
unidade. Para ver o consumidor rodar de ponta a ponta na VPS, insira o evento à mão depois de
suspender e confira que ele sai de `pending` e que o aviso aparece na Central:

```sql
insert into event_log (organization_id, entity_kind, entity_id, event_type, payload)
select id, 'organization', id, 'tenant.suspended', jsonb_build_object('tenant_id', id)
  from organizations where slug = 'vinicola-serra-alta-qa';
```

A limpeza feita **dentro** da rota de reativação (Step 3 da Task 4) também fica fora desta prova, pela
mesma razão — e é por isso que a ordem "limpar antes do `update`" está comentada no próprio código.

- [ ] **Step 4: Declarar a spec fora do CI**

Em `.github/workflows/e2e.yml`, na variável `FORA_DO_CI`, acrescente com motivo escrito:

```yaml
        bacco-suspensao.spec.ts        # suspende e reativa uma organização real; roda só na VPS, com a org de QA
```

Sem isso, `tests/unit/e2e-cobertura-completa.test.ts` reprova toda spec nova que não esteja em `SPECS_PARTE_*` nem em `FORA_DO_CI`.

- [ ] **Step 5: Rodar a prova na VPS**

No contêiner `mcr.microsoft.com/playwright:v1.63.0-noble` da VPS, como nas provas anteriores. Esperado: **1 passed** e as duas capturas. Qualquer vermelho é achado: conserta na causa raiz **antes** da tag, nunca numa release seguinte.

- [ ] **Step 6: Registrar a evidência**

Crie `evidence/bacco-suspensao/revisao.md` com a tabela do que foi medido, as capturas e o Living System Checklist respondido com artefatos concretos (entrada: rota de suspensão; saída: os três funis mais o aviso da Central; log: `api_audit_log` com `tenant.suspended` e `authz.denied` com `reason: tenant_suspended`; tela: `/account-suspended` e a Central; anti-morte: o claim ignora e o consumidor limpa; laço de retorno: o aviso com a contagem; mapa: `docs/architecture/enforcement-da-suspensao.architecture.json`).

- [ ] **Step 7: Aprovação do dono, tag e versão definitiva**

Só depois de o dono aprovar as capturas:

```bash
git tag -a v26.9.5 -m "Bacco Adega CRM 26.9.5 — enforcement da suspensão"
git push origin v26.9.5
```

Depois de o workflow de publicação fechar, confira **pela VPS** que as três imagens e `stable` têm o mesmo digest, e só então atualize para a tag definitiva com `update.sh --to v26.9.5`, conferindo `"version":"26.9.5"` no health e raiz **307**.

---

## Decisões do dono (2026-09-16) — autorizadas antes da execução

As três decisões que este plano deixou em aberto foram levadas ao dono e aprovadas. Elas não são
mais "ruling do controlador": são escolha do produto, e o implementador as executa como estão.

| Tema | Decisão do dono | Onde vive no plano |
|---|---|---|
| **Prova em tela na VPS** | **Autorizada.** A organização de QA ("Vinícola Serra Alta (QA)", zerada) pode ser suspensa e reativada na VPS de produção para a prova. A organização de produção não é tocada. | Task 6 |
| **Fila represada** | **Descartar.** Os jobs `pending` viram `dead` com aviso na Central. Os dados ficam intactos; some só o trabalho datado, porque guardar significa disparar semanas de cadências de uma vez quando a conta voltar. | Task 4 |
| **Acompanhamento em organização suspensa** | **Só `support_readonly` entra.** O modo `full` continua expulso da tela, porque `lib/auth/require-role.ts:68` o mapeia para papel `admin` — seria escrita numa organização que o operador desligou. | Task 1, Step 8-A |

Com isto, a Task 6 deixa de precisar de autorização no meio da execução: ela já a tem, por escrito.
O que **não** está autorizado e continua fora: suspender a organização de produção, e qualquer prova
que envie mensagem real pelo WhatsApp do dono.
