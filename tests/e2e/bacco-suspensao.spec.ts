/**
 * Prova em tela do enforcement da suspensão — roda NA VPS, contra a candidata
 * (Plano 3, Task 6). Não faz parte do CI (`FORA_DO_CI` em `.github/workflows/e2e.yml`).
 *
 * Autocontida de propósito: importa só `@playwright/test`, `node:fs` e `pg`, sem
 * helpers do repo e sem `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado. O molde é
 * `tests/e2e/bacco-jornadas.spec.ts`.
 *
 * ## A matriz, e uma prova por linha
 *
 *   1. organização ATIVA: a tela abre e a API responde 200 (controle positivo —
 *      sem ele, "parou" não se distingue de "nunca funcionou").
 *   2. SUSPENSA: a navegação cai em `/account-suspended`.
 *   3. SUSPENSA: a MESMA sessão leva 403 `tenant_suspended` em `/api/v1/*`. É a
 *      linha que o redirect de tela NÃO cobre — layout não roda em rota de API.
 *   4. SUSPENSA: a fila não entrega trabalho — job `pending` que não vira
 *      `running`, medido no banco.
 *   5. a fila represada é descartada, com a CONTAGEM exata, contra Postgres real.
 *   6. REATIVADA: tudo volta, e nada dispara em massa.
 *
 * ## ⚠️ O QUE ESTA PROVA NÃO ALCANÇA, e por que — leia antes de confiar nela
 *
 * A suspensão aqui é virada NO BANCO, não pela rota. Não é atalho:
 * `POST /api/v1/admin/tenants/:id/{suspend,reactivate}` chama
 * `requirePlatformAdmin()`, que resolve a identidade por `createClient()` —
 * cookie de sessão, nunca header. Na instalação medida o ÚNICO platform admin é
 * o dono (`platform_admins` tem uma linha, e é a dele); a conta de QA não é. Uma
 * sessão de platform admin, esta prova não tem e não pode fabricar sem a senha
 * do dono.
 *
 * Consequência honesta, e ela é do tamanho de uma linha inteira da matriz:
 *
 *   - as linhas 1, 2, 3, 4 e 6 são provadas de ponta a ponta, porque os três
 *     gates (`require-role`, `validateBearerToken`, `CLAIM_SQL`) leem
 *     `organizations.status` e nada mais — virar o status no banco é
 *     exatamente o estado que a rota produz;
 *   - a linha 5 é provada PELA METADE. O descarte e a contagem exata são
 *     medidos contra o Postgres e o PostgREST REAIS, com a chave de serviço do
 *     app e a MESMA consulta que `lib/tenancy/limpar-fila-represada.ts` emite
 *     (`status=eq.pending`, `run_after=lt.<finito>`, `Prefer: count=exact`) —
 *     mas quem a emite aqui é a PROVA, não a rota. O aviso na Central, que só
 *     `avisarDescarteDaFila` escreve, fica FORA: fabricar a linha à mão seria
 *     inventar a evidência que se foi medir.
 *
 * Quem quiser a linha 5 inteira precisa de uma sessão de platform admin no
 * navegador — é decisão do dono, não desta spec.
 *
 * ## Segurança do que esta prova semeia
 *
 * Os jobs semeados são `kind='watchdog'`: a tabela não exige `contact_id` para
 * esse kind (`job_queue_turn_needs_contact`), o `fn_job_service_boundary` o
 * ignora, e `workers/agent-worker/main.ts` NÃO registra handler para ele — um
 * watchdog claimado morre em "nenhum handler registrado para kind=watchdog".
 * Ou seja: nenhuma mensagem sai, nenhum contato é tocado, e o observável é
 * limpo — "saiu de `pending`" contra "continua `pending`". `max_attempts=1`
 * para não ficar reciclando, e a prova apaga o que semeou no fim.
 *
 * Toca SÓ a organização de QA. A organização de produção não é lida nem escrita.
 *
 * Medidas em `/work/out/suspensao-medidas.jsonl`, capturas em `/work/out/*.png`.
 */
import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const DB_URL = process.env.SUPABASE_DB_ADMIN_URL ?? "";
/** A URL do PostgREST do app (`NEXT_PUBLIC_SUPABASE_URL`) e a chave de serviço. */
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OUT = "/work/out";

/** A organização de QA — a única que esta prova pode tocar. */
const ORG_QA = "vinicola-serra-alta-qa";
/** Marcador das linhas semeadas, para apagar só o que é nosso. */
const MARCA = "prova-suspensao-plano-3";
/** Qualquer data real é menor que esta; `infinity` não é — igual ao produto. */
const LIMITE_FINITO = "9999-12-31T00:00:00.000Z";

test.use({ baseURL: BASE_URL });
test.setTimeout(5 * 60_000);

function registrar(linha: Record<string, unknown>): void {
  fs.appendFileSync(`${OUT}/suspensao-medidas.jsonl`, `${JSON.stringify(linha)}\n`);
}

const pool = new pg.Pool({ connectionString: DB_URL });

async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  texto: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const { rows } = await pool.query<T>(texto, valores);
  return rows;
}

async function orgId(): Promise<string> {
  const rows = await sql<{ id: string }>("select id from organizations where slug = $1", [ORG_QA]);
  const id = rows[0]?.id;
  expect(id, `a organização de QA (${ORG_QA}) tem de existir na instalação`).toBeTruthy();
  return id!;
}

/**
 * Vira a chave no banco — ver o cabeçalho para por que não é pela rota.
 *
 * Escreve EXATAMENTE as colunas que a rota escreve, para que o estado observado
 * pelos gates seja o mesmo. `slug` no `where` (nunca id solto) mantém o raio
 * desta prova preso na organização de QA.
 */
async function virarAChave(alvo: "suspended" | "active"): Promise<void> {
  await sql(
    alvo === "suspended"
      ? `update organizations
            set status = 'suspended', suspended_at = now(),
                suspended_reason = 'prova em tela do Plano 3', updated_at = now()
          where slug = $1`
      : `update organizations
            set status = 'active', suspended_at = null, suspended_reason = null,
                suspended_by = null, updated_at = now()
          where slug = $1`,
    [ORG_QA],
  );
}

/**
 * Espera a consequência VISÍVEL, não um `sleep` nem o banco.
 *
 * O `update` comita na hora, mas quem observa é o produto: a API da sessão passa
 * a responder 403, ou volta a 200. Medir o efeito em vez do instante foi o que
 * evitou três falsos positivos na prova das jornadas.
 */
async function esperarAPI(page: Page, esperado: number): Promise<void> {
  await expect
    .poll(async () => (await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`)).status(), {
      message: `a API da sessão devia responder ${esperado}`,
      timeout: 90_000,
      intervals: [1_000],
    })
    .toBe(esperado);
}

/** Semeia N jobs `pending` vencidos na organização de QA. Devolve os ids. */
async function semear(org: string, quantos: number): Promise<string[]> {
  const rows = await sql<{ id: string }>(
    `insert into job_queue (organization_id, kind, status, run_after, max_attempts, payload)
     select $1, 'watchdog', 'pending', now() - interval '1 minute', 1,
            jsonb_build_object('marca', $2::text, 'n', g)
       from generate_series(1, $3::int) g
     returning id`,
    [org, MARCA, quantos],
  );
  expect(rows.length, "os jobs semeados entraram na fila").toBe(quantos);
  return rows.map((r) => r.id);
}

/** O status atual de cada job semeado, na ordem em que foram pedidos. */
async function statusDos(ids: string[]): Promise<string[]> {
  const rows = await sql<{ id: string; status: string }>(
    "select id, status from job_queue where id = any($1::uuid[])",
    [ids],
  );
  const porId = new Map(rows.map((r) => [r.id, r.status]));
  return ids.map((id) => porId.get(id) ?? "sumiu");
}

// FAIL-SAFE: a organização de QA NUNCA fica suspensa porque a prova quebrou no
// meio, e nenhum job semeado sobrevive à rodada. Roda mesmo com o teste vermelho.
test.afterAll(async () => {
  try {
    await virarAChave("active");
    await sql("delete from job_queue where payload->>'marca' = $1", [MARCA]);
  } finally {
    await pool.end();
  }
});

test("a suspensão para o atendimento em todas as portas, e a reativação devolve", async ({
  page,
}) => {
  const org = await orgId();
  registrar({ medida: "organizacao", slug: ORG_QA, id: org, momento: new Date().toISOString() });

  // ── LINHA 1: organização ATIVA, tudo normal ────────────────────────────────
  // Controle positivo. Sem ele, "a tela parou" não se distingue de "a tela nunca
  // funcionou", e a prova inteira mediria uma instalação quebrada.
  expect((await sql<{ status: string }>("select status from organizations where id = $1", [org]))[0]
    ?.status, "a prova começa com a organização de QA ATIVA").toBe("active");

  await page.goto(`${BASE_URL}/login`);
  await page.locator("#email").fill(QA_EMAIL);
  await page.locator("#password").fill(QA_SENHA);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 90_000 });
  expect(page.url(), "a conta de QA já passou do onboarding").toMatch(/\/app\//);

  const antes = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(antes.status(), "com a organização ativa a API responde normalmente").toBe(200);
  await page.screenshot({ path: `${OUT}/01-ativa.png`, fullPage: true });
  registrar({ linha: 1, medida: "ativa", url: page.url(), api_contacts: antes.status() });

  // CONTROLE POSITIVO DO INSTRUMENTO DA FILA.
  //
  // "continua pending" só é prova de que o gate agiu se, com a organização
  // ATIVA, o mesmo job SAI de pending. Sem esta medida, um worker parado leria
  // exatamente como uma suspensão funcionando — e o verde seria mentira.
  const controle = await semear(org, 1);
  await expect
    .poll(async () => (await statusDos(controle))[0], {
      message: "com a organização ATIVA o worker tem de claimar o job semeado",
      timeout: 90_000,
      intervals: [1_000],
    })
    .not.toBe("pending");
  const statusControle = (await statusDos(controle))[0];
  registrar({
    linha: 1,
    medida: "controle-positivo-da-fila",
    status_final: statusControle,
    nota: "watchdog não tem handler: o worker o claima e ele morre. O que importa é que SAIU de pending.",
  });

  // ── Vira a chave ───────────────────────────────────────────────────────────
  await virarAChave("suspended");
  await esperarAPI(page, 403);

  // ── LINHA 2: a tela redireciona ────────────────────────────────────────────
  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/account-suspended/);
  await expect(page.getByRole("heading", { name: /conta suspensa/i })).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-tela-suspensa.png`, fullPage: true });
  registrar({ linha: 2, medida: "tela-redireciona", url: page.url() });

  // ── LINHA 3: a MESMA sessão leva 403 tenant_suspended na API ───────────────
  // É a linha que nenhum dublê provou: o redirect de tela mora em
  // `app/app/layout.tsx`, que NÃO roda em rota de API. Sem o gate de
  // `require-role.ts`, esta chamada voltaria 200 com a conta suspensa.
  const durante = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(durante.status()).toBe(403);
  const corpo = (await durante.json()) as { error?: { code?: string } };
  expect(corpo.error?.code, "o código do envelope é o novo, não um 403 genérico").toBe(
    "tenant_suspended",
  );
  registrar({ linha: 3, medida: "api-da-mesma-sessao", status: durante.status(), corpo });

  // ── LINHA 4: a fila não entrega trabalho ───────────────────────────────────
  // Três jobs vencidos, semeados DEPOIS da suspensão — é o que acontece de
  // verdade: o trabalho continua chegando enquanto a conta está desligada.
  const represados = await semear(org, 3);
  const inicio = Date.now();
  // 30s é ~15 rodadas de claim (`QUEUE_POLL_INTERVAL_MS` = 2000) — o controle
  // positivo acima levou uma fração disso para sair de pending.
  await new Promise((r) => setTimeout(r, 30_000));
  const durantePendentes = await statusDos(represados);
  expect(
    durantePendentes,
    "com a organização suspensa o CLAIM_SQL ignora os jobs dela — nenhum vira running",
  ).toEqual(["pending", "pending", "pending"]);
  registrar({
    linha: 4,
    medida: "fila-nao-entrega",
    esperou_ms: Date.now() - inicio,
    status: durantePendentes,
  });

  // ── LINHA 5 (METADE): o descarte com a contagem exata, contra Postgres real ─
  // ⚠️ Quem emite esta chamada é a PROVA, não a rota — ver o cabeçalho. O que
  // ela mede de verdade, e que nenhum dublê mediu, é o `count: "exact"` do
  // PostgREST REAL: o número vem do header `Content-Range`, sem trazer linha
  // nenhuma. A consulta é a de `lib/tenancy/limpar-fila-represada.ts`.
  const descarte = await page.request.fetch(
    `${SUPABASE_URL}/rest/v1/job_queue` +
      `?organization_id=eq.${org}&status=eq.pending&run_after=lt.${LIMITE_FINITO}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "count=exact",
      },
      data: { status: "dead", last_error: "organização suspensa" },
    },
  );
  expect(descarte.status(), "o PATCH do descarte é aceito pelo PostgREST").toBeLessThan(300);
  const contentRange = descarte.headers()["content-range"] ?? "";
  const contagem = Number(contentRange.split("/")[1]);
  expect(
    contagem,
    "o count=exact do PostgREST devolve a contagem exata dos descartados, sem trazer linhas",
  ).toBe(3);
  expect(await statusDos(represados)).toEqual(["dead", "dead", "dead"]);
  registrar({
    linha: 5,
    medida: "descarte-com-contagem",
    content_range: contentRange,
    contagem,
    chamador: "a prova, não a rota — o aviso na Central fica fora (ver cabeçalho)",
  });

  // ── LINHA 6: reativada, tudo volta, e nada dispara em massa ────────────────
  await virarAChave("active");
  await esperarAPI(page, 200);

  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/app\//);
  await expect(page).not.toHaveURL(/account-suspended/);
  const depois = await page.request.get(`${BASE_URL}/api/v1/contacts?limit=1`);
  expect(depois.status()).toBe(200);
  await page.screenshot({ path: `${OUT}/03-reativada.png`, fullPage: true });

  // SEM ENXURRADA: os represados continuam `dead` depois de a organização voltar.
  // Se o descarte não tivesse acontecido, o claim os pegaria em até 2 s.
  await new Promise((r) => setTimeout(r, 10_000));
  expect(
    await statusDos(represados),
    "nada do que foi descartado volta a rodar quando a organização reativa",
  ).toEqual(["dead", "dead", "dead"]);
  registrar({
    linha: 6,
    medida: "reativada-sem-enxurrada",
    url: page.url(),
    api_contacts: depois.status(),
  });
});
