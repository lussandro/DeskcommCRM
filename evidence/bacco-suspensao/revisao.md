# Revisão — prova em tela do enforcement da suspensão (Plano 3, Task 6)

Rodada contra a **candidata `4291195e`** em `https://adega-crm.baccosistemas.com.br` (2026-09-16,
health `"version":"4291195"`, raiz 307), com a conta de QA, no contêiner
`mcr.microsoft.com/playwright:v1.63.0-noble` da VPS: **1 passed (50.6s)**, 3 capturas, medidas em
`candidata-4291195e-suspensao-medidas.jsonl`. Spec: `tests/e2e/bacco-suspensao.spec.ts`.

Só a organização de QA ("Vinícola Serra Alta (QA)", `7326ddce-…`) foi suspensa e reativada, com a
autorização escrita do dono. A organização de produção não foi lida nem escrita. Ao fim, as duas
estão `active` e nenhuma linha semeada sobrou em `job_queue` (conferido: 0).

## Controle-antes: a mesma prova contra a 26.9.4

Antes do deploy, a spec rodou contra a **26.9.4** (código anterior ao plano). Ela passou a linha 1 e o
controle positivo da fila e **falhou na linha 3**: com a organização suspensa no banco,
`/api/v1/contacts` seguiu respondendo **200 por 90 s** (`antes-26.9.4-medidas.jsonl`, e a saída
`Expected: 403 / Received: 200`). É o defeito que o plano existe para fechar, medido na instalação
real — o 403 abaixo é atribuível à mudança, não ao ambiente.

## A matriz, uma prova por linha

| # | Linha | Medida na candidata |
|---|---|---|
| 1 | Ativa: tudo normal | login → `/app/inbox`; `/api/v1/contacts` **200**. Controle positivo da fila: job semeado com a org ativa **saiu de `pending`** (virou `dead`: `watchdog` não tem handler — nenhuma mensagem sai) |
| 2 | Suspensa: tela redireciona | `goto /app` → **`/account-suspended`**, heading "Conta suspensa" visível (`02-tela-suspensa.png`) |
| 3 | Suspensa: a MESMA sessão na API | **403** `{"error":{"code":"tenant_suspended","message":"Conta suspensa"}}` |
| 4 | Suspensa: a fila não entrega | 3 jobs vencidos semeados após a suspensão; após **30 012 ms** (~15 rodadas de claim) os três continuam **`pending`** — com o worker de pé (linha 1 prova que ele claima) |
| 5 | Descarte com a contagem | PostgREST real, chave de serviço do app, a MESMA consulta de `limpar-fila-represada.ts`: `Content-Range: 0-2/3`, **contagem 3**, os três `dead`. **Metade** — ver abaixo |
| 6 | Reativada: volta, sem enxurrada | API **200**, `/app/inbox` abre (`03-reativada.png`); 10 s depois os três descartados seguem `dead` — nada disparou |

Log medido no banco depois da rodada: `api_audit_log` da org QA tem **2 × `authz.denied`** com
`metadata.reason = tenant_suspended` (12:41:45Z) — uma por chamada de API feita suspensa.

## O que a prova NÃO alcança

A chave foi virada **no banco**, não pela rota: `POST /api/v1/admin/tenants/:id/{suspend,reactivate}`
exige platform admin por **cookie de sessão** (`requirePlatformAdmin` → `createClient()`), e na
instalação o único platform admin é o dono; a conta de QA não é. Consequência:

- **Linhas 1, 2, 3, 4 e 6: inteiras.** Os três gates leem `organizations.status` e nada mais; o
  estado produzido pelo `update` é o mesmo que a rota produz.
- **Linha 5: pela metade.** O `count: "exact"` foi provado contra o Postgres/PostgREST reais, mas
  quem emitiu a consulta foi a prova, não a rota. **O aviso na Central** (que só
  `avisarDescarteDaFila` escreve) e o `tenant.suspended`/`tenant.reactivated` no `event_log` **não
  foram provados em tela** — fabricar a linha seria inventar a evidência. Cobertura desses dois:
  `lib/tenancy/rotas-da-suspensao.test.ts` e `limpar-fila-represada.test.ts` (dublê).
- Fechar a linha 5 exige uma sessão de platform admin no navegador — decisão do dono.

Achado operacional no caminho, já corrigido: `update.sh --to main --force` com `APP_PULL_POLICY=missing`
**não puxou** a imagem nova (a tag `main` já existia localmente com `8dd3ad7a`); foi preciso
`docker pull` explícito das três antes do `up -d`. Health conferido antes e depois.

## Living System Checklist

- **Entrada:** `POST /api/v1/admin/tenants/:id/suspend` (e o `update` de `organizations.status`).
- **Saída:** três funis — `lib/auth/require-role.ts` (403 `tenant_suspended`), `lib/mcp/auth.ts`
  (`validateBearerToken`), `lib/agent-engine/queue/queue.ts` (`CLAIM_SQL` com `NOT EXISTS`) — mais
  `lib/tenancy/limpar-fila-represada.ts` (descarte + aviso).
- **Log:** `api_audit_log` `tenant.suspended` / `tenant.reactivated` (rota) e `authz.denied` com
  `reason: tenant_suspended` — **medido: 2 linhas na rodada**.
- **Tela:** `/account-suspended` (medida) e a Central de avisos `/app/ai/inbox` com `job_dead`
  "Trabalho pendente descartado…" (não medida — ver acima).
- **Porta na navegação:** não há tela nova; a Central já está em `lib/navigation/catalogo.ts`.
- **Anti-morte:** o claim ignora a org suspensa (medido, linha 4); a rota descarta o represado
  antes de reativar (dublê).
- **Laço de retorno:** o aviso na Central com a contagem descartada é o que o operador lê antes
  de reativar; se o descarte falhar, a rota devolve o texto real (`Failed to clear queued work`).
- **Mapa:** `docs/architecture/enforcement-da-suspensao.architecture.json` (≥2 arestas por nó).

## Capturas

`candidata-4291195e-01-ativa.png`, `candidata-4291195e-02-tela-suspensa.png`,
`candidata-4291195e-03-reativada.png`; controle-antes: `antes-26.9.4-01-ativa.png`.
