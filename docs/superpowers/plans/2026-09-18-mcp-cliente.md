# Consulta ao ERP externo por MCP — Plano de Implementação

> **Para quem executa:** use `superpowers:subagent-driven-development`. Cada tarefa termina em
> commit próprio, com teste que fica VERMELHO se a implementação sair.

**Goal:** os agentes da ChatCore respondem sobre contrato, fatura e instância com dado vindo do
ERP dela, por cinco ferramentas locais de consulta que roteiam para o MCP externo.

**Spec:** `docs/superpowers/specs/2026-09-18-mcp-cliente-design.md` (leia antes de tudo; a §11
explica por que o desenho óbvio foi descartado).

**Medições que valem como contrato:** `.superpowers/sdd/2026-09-18-mcp-cliente/mcp-externo-medido.md`.

## Global Constraints

- Node 22: `source ~/.nvm/nvm.sh && nvm use` antes de qualquer gate.
- **Nunca** `git stash`/`reset`/`checkout --` — a árvore é compartilhada.
- Toda string nova de tela tem espanhol em `lib/i18n/dicionario.ts` (gate
  `i18n-espanhol-cobre-a-tela`).
- Migration sai em tripla: arquivo + apêndice idempotente no `baseline.sql` **antes** do bloco
  de varredura anon + linha no `MANIFEST.md`.
- Constraint existente é editada **no bloco único dela**, nunca num segundo bloco (regra #159).
- Nenhuma ferramenta de escrita no ERP. Nenhuma das 24 do servidor é exposta por nome.
- Segredo nunca em log, nunca em erro, nunca na URL registrada.
- Commits em PT-BR, conventional, com o rodapé:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WmB4APA2sHEQEncJd37dbh
  ```

---

## Task 1 — Migration 0263

**Files:** criar `supabase/migrations/20260918100000_0263_mcp_externo.sql`; modificar
`supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`.

Três mudanças, todas aditivas:

1. `'mcp'` em `tenant_integrations_provider_check` — reconstruir a constraint **inteira** no
   bloco único existente (`supabase/baseline.sql:25336-25338`), acrescentando só o valor novo.
2. `'mcp_externo_falhou'` em `agent_inbox_items_kind_check` — idem, no bloco único dela.
3. `alter table public.tenant_integrations alter column webhook_secret_encrypted drop not null;`
   Justifique no cabeçalho: um provider sem webhook não deve fabricar segredo de webhook, que é
   o que o Asaas faz hoje (`app/actions/integrations/asaas.ts:99-114`).

**Steps:** escrever a migration → espelhar no apêndice do baseline (rótulo
`-- ---- consulta ao ERP externo por MCP (migration 0263, bacco) ----`, terminando em
`notify pgrst, 'reload schema';`) → linha no MANIFEST → `pnpm test:db` → commit.

**Prova:** `pnpm test:db` verde (aplica em banco novo e em atualização).

---

## Task 2 — O transporte (`lib/erp-mcp/transporte.ts`)

**Files:** criar `lib/erp-mcp/transporte.ts`, `lib/erp-mcp/tipos.ts`,
`lib/erp-mcp/transporte.test.ts`.

**Interfaces produzidas:**

```ts
export type FalhaExterna =
  | { tipo: "url_recusada"; detalhe: string }
  | { tipo: "timeout" }
  | { tipo: "http"; status: number }
  | { tipo: "corpo_invalido"; detalhe: string }
  | { tipo: "rpc"; codigo: number; mensagem: string }   // erro JSON-RPC (ex.: -32602)
  | { tipo: "tool_error"; mensagem: string };           // isError: true

export type ResultadoExterno<T> = { ok: true; dados: T } | { ok: false; falha: FalhaExterna };

export async function chamarRpc(
  cfg: { url: string; chave: string },
  metodo: "tools/list" | "tools/call",
  params: Record<string, unknown>,
  deps?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<ResultadoExterno<unknown>>;
```

**O que ele faz, na ordem:**
1. `assertSafeOutboundUrl(url)` e `assertDestinoResolvidoSeguro(url)` — os dois, a cada
   chamada (molde: `lib/automation/actions/call-webhook.ts:70-74`). Falha → `url_recusada`.
2. `fetch` com `method:"POST"`, `redirect:"manual"`, `signal: AbortSignal.timeout(10_000)`,
   cabeçalhos `Authorization: Bearer …`, `Content-Type: application/json`,
   `Accept: application/json, text/event-stream`.
3. Lê o corpo como texto. **Aceita as duas formas** (medido): linhas `data: {…}` (SSE) e JSON
   puro. Em SSE, usa a ÚLTIMA linha `data:` que parseia.
4. `result.error` do JSON-RPC → `rpc`. `result.isError === true` → `tool_error` com o texto de
   `content[0].text`.

**Testes (a tabela é o valor desta tarefa):** resposta SSE real; JSON puro; múltiplas linhas
`data:`; corpo vazio; corpo truncado no meio; HTTP 500; HTTP 401; timeout (fetch que nunca
resolve); `error` JSON-RPC `-32602` com a mensagem real medida
(`Required at documento`); `isError:true`; URL `http://localhost` recusada; URL com IP privado
recusada; redirect 302 não seguido. **Nenhum teste chama a rede** — `fetchImpl` é injetado.

**Sabotagem obrigatória:** comente a leitura de SSE e prove que os testes de SSE ficam
vermelhos; comente um dos guards e prove que o teste de URL privada fica vermelho.

---

## Task 3 — Configuração da integração (`lib/erp-mcp/config.ts`)

**Files:** criar `lib/erp-mcp/config.ts` e `.test.ts`; modificar `lib/asaas/config.ts`
(`carregarCapacidadesDeIntegracao`).

Molde literal de `lib/asaas/config.ts:63-96`:

```ts
export interface IntegracaoErpMcp { url: string; chave: string; catalogo: string[]; }
export async function carregarIntegracaoErpMcp(
  admin: SupabaseClient, orgId: string, opts?: { exigirHealthy?: boolean },
): Promise<IntegracaoErpMcp | null>;   // null = desligado; NUNCA lança
```

- Lê `tenant_integrations` filtrando `organization_id` **e** `provider='mcp'`.
- `exigirHealthy` default `true`.
- `store_metadata` validado por Zod fail-closed: `{ url: string().url(), catalogo: array(string()).default([]), falhas_consecutivas: number().default(0) }`.
- Decifra a chave com `decryptSecret` (`lib/webhooks/secrets.ts:31`).

Em `carregarCapacidadesDeIntegracao`, acrescentar `"mcp"` ao conjunto quando existir linha
`provider='mcp'` com `status='healthy'` — é a função canônica que `pickToolsFromMcp` já
consulta, e é assim que as cinco ferramentas somem quando a integração cai.

**Testes:** sem linha → `null`; linha `error` com `exigirHealthy` → `null`; `store_metadata`
inválido → `null` (fail-closed); capacidade `"mcp"` aparece só com `healthy`.

---

## Task 4 — As projeções (`lib/erp-mcp/projecao.ts`)

**Files:** criar `lib/erp-mcp/projecao.ts` e `.test.ts`.

Para cada uma das cinco consultas: um Zod que valida o que o ERP devolveu e uma função pura que
**monta o objeto que vai ao modelo**, campo a campo.

`situacaoDoCliente` devolve **apenas**: `em_atraso`, `faturas_vencidas`,
`total_vencido_centavos`, `proxima_fatura {vencimento, valor_centavos}`,
`instancias [{nome, bloqueada, motivo}]`.
**Nunca**: `email`, `emailCobranca`, `telefone`, `razaoSocial`, `emailsRecentes`, `customerId`,
`contractId` nem qualquer id interno.

**O teste mais importante do plano:** use o payload real de `customer.status` (está em
`mcp-externo-medido.md`) e prove que `JSON.stringify(projecao)` **não contém** e-mail,
telefone, razão social nem os ids internos. Esse teste é a garantia de LGPD desta feature.

Desembrulhar `result.content[].text` (JSON dentro de string) mora aqui, com plano B quando não
for JSON: `{ ok:false, falha:{tipo:"corpo_invalido"} }`.

---

## Task 5 — As cinco ferramentas no catálogo

**Files:** criar `lib/mcp/tools/erp.ts` (handlers) e `lib/mcp/tools/catalogo/erp.ts`
(metadados); modificar `lib/mcp/tools/index.ts` e `lib/mcp/tools/catalogo/index.ts`; criar
`tests/unit/erp-mcp-ferramentas.test.ts`.

Molde literal: `lib/mcp/tools/cobranca.ts` + `lib/mcp/tools/catalogo/cobranca.ts` (as do Asaas).

As cinco: `crm_erp_situacao_do_cliente`, `crm_erp_faturas_do_cliente`, `crm_erp_fatura`,
`crm_erp_contrato`, `crm_erp_instancia`. Todas `category:"read"`,
`requiresScope:"mcp:read"`, `requiresRole:"agent"`, `requerIntegracao:"mcp"`.

Cada handler: carrega a config (null → `{ error: SEM_MODULO }`), resolve o documento do cliente
(o contato precisa ter CPF/CNPJ — sem ele, `{ needs_document: true, message: "Peça o CPF ou
CNPJ ao cliente." }`), chama, projeta, devolve. Erro → `{ ok:false, error: "<pt-BR>" }`
(`ok:false` é o que o breaker entende).

**Limite de 4 chamadas por turno:** contador por `jobId`/`runId` no contexto da ferramenta.
A quinta devolve `{ ok:false, error:"limite de consultas ao sistema neste atendimento" }` sem
sair para a rede.

**Testes:** integração desligada → `SEM_MODULO`; contato sem documento → `needs_document`;
sucesso → projeção; 5ª chamada → limite; erro do transporte → `ok:false` com texto em pt-BR e
`logger.error` chamado.

---

## Task 6 — Tela e server actions

**Files:** criar `app/app/integrations/mcp/page.tsx` + `_components/*`,
`app/actions/integrations/mcp.ts`; modificar `lib/navigation/catalogo.ts`,
`lib/i18n/dicionario.ts`; criar `app/actions/integrations/mcp.test.ts`.

Molde literal do Asaas (`app/app/integrations/asaas/**`, `app/actions/integrations/asaas.ts`):
página **admin com `notFound()`**; estados `sem_linha|configurada|ativa|erro`; ações
`salvarConfigMcp` (URL + chave; chave obrigatória só na primeira), `testarConexaoMcp`
(chama `tools/list` de verdade, grava `status` e `last_health_check_at`, e **guarda os nomes
das ferramentas em `store_metadata.catalogo`**), `ativarMcp`, `desativarMcp`, `esquecerChaveMcp`
(recusa com módulo ativo). Auditoria em toda mudança, com **apenas os 4 últimos dígitos** da
chave.

A tela mostra, depois do teste, **quantas ferramentas o servidor expõe e quais das cinco
consultas ficaram disponíveis** — é o laço de retorno: o admin vê o que ganhou.

**Testes:** guarda de admin; `esquecerChaveMcp` recusa com `status='healthy'`; todo
`update`/`delete` filtra `organization_id`.

---

## Task 7 — O que falha aparece na tela

**Files:** criar `lib/erp-mcp/aviso.ts`; modificar `lib/agent-engine/db/repository.ts`
(`InboxKind`), `lib/ai/agent-inbox-copy.ts`, `lib/ai/inbox-destino.ts` (os dois pontos),
`app/api/v1/cron/asaas-reconcile/route.ts` (ou cron irmão) e o teste de vocabulário
banco × TypeScript.

- `falhas_consecutivas` em `store_metadata`: `+1` a cada falha, zerado no sucesso.
- Em 3, abre `mcp_externo_falhou` (um por organização, `ref_id` = uuid do provider), com o
  motivo real e o caminho para a tela. Fecha no primeiro sucesso.
- **Precedência:** motivo de capacidade ausente é do `capabilities_missing` que já existe.
- **Anti-morte (D9):** o cron diário chama `tools/list` por organização com integração
  `healthy`, atualiza `last_health_check_at`, e marca `error` com motivo quando falha.

---

## Task 8 — Fechamento

**Files:** criar `.changes/bacco-erp-mcp.md`, `docs/architecture/erp-mcp.architecture.json`;
modificar `docs/testing/user-journey-map.md`.

Fragmento: `impacto: capacidade_nova`, `secao: adicionado`, título na voz do operador. Mapa
vivo com ≥2 arestas. Jornada nova no mapa de testes.

**Gate final:** `pnpm typecheck`, `pnpm lint`, `pnpm lint:channels`, `pnpm test:unit`,
`pnpm test:db`, `pnpm build`.

---

## Depois do plano (fora das tarefas, com o controlador)

1. Release, build na VPS e deploy.
2. Ligar a integração na organização do dono com a URL e a chave do MCP da ChatCore.
3. Marcar as cinco consultas no agente financeiro e no de suporte da ChatCore.
4. **A prova que vale:** conversa real pelo WhatsApp de testes, com o agente respondendo fatura
   e instância com dado do ERP.
