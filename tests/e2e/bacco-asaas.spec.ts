/**
 * Prova em tela do módulo Asaas — roda NA VPS, contra a produção (spec
 * "2026-09-17-asaas", Task 11, com as regras do controlador em
 * `.superpowers/sdd/2026-09-17-asaas/task-11-brief.md`). Não faz parte do CI
 * (`FORA_DO_CI` em `.github/workflows/e2e.yml`) — molde de
 * `tests/e2e/bacco-empresas.spec.ts`.
 *
 * Autocontida de propósito: só `@playwright/test`, sem helpers do repo e sem
 * `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado.
 *
 * O QUE ESTA SPEC PROVA (pela tela, como um admin leigo faria):
 *   1. Login → Configurações → Asaas.
 *   2. Preenche chave (sandbox), ambiente, dias, máx, sem escolher fluxo de
 *      retorno → Salvar → tela do token único aparece (URL do webhook).
 *   3. Testar conexão → sucesso. Ativar → status vira "Ativa".
 *   4. Empresas: cria empresa nova com o CNPJ de um customer Asaas criado
 *      pela própria spec (via API, no `beforeAll`) → cartão Asaas → "Vincular
 *      pelo CNPJ" → "Cliente do Asaas vinculado" → a cobrança PENDING criada
 *      no `beforeAll` aparece na lista, com o valor formatado.
 *   5. Volta à Asaas → Desativar (confirma) → status volta a "configurada"
 *      (sem badge "Ativa"); reabre a empresa → o cartão Asaas não aparece
 *      mais (o módulo desativado não renderiza `CartaoAsaas`).
 *
 * O QUE ESTA SPEC NÃO PROVA (documentado em J24 do mapa de jornadas, checagem
 * manual em produção):
 *   - Cobrança VENCIDA: medido em `docs/superpowers/specs/asaas-sandbox-medido-crm.md`
 *     que o sandbox Asaas RECUSA `dueDate` no passado (`400 invalid_dueDate`)
 *     tanto na criação quanto no `PUT` — não há atalho de API para produzir
 *     `OVERDUE` sinteticamente; só esperando a data vencer de verdade.
 *   - Entrega do webhook e o retorno automático do agente: o sandbox é
 *     COMPARTILHADO com o Asaas ERP (6 webhooks de outros sistemas já
 *     cadastrados, um deles `enabled:true` em produção) — a spec nunca cria,
 *     edita nem desabilita webhook nenhum.
 *   - Conversa do agente pelo WhatsApp (consultar pendência, reemitir,
 *     recusar por limite).
 *
 * O `beforeAll`/`afterAll` falam com `https://api-sandbox.asaas.com/v3`
 * diretamente (não pela tela) só para preparar/limpar o customer e a cobrança
 * — a jornada em si é 100% dirigida pelo browser.
 *
 * Ao final a integração fica DESATIVADA de propósito (regra do controlador:
 * quem ativa de verdade depois é o dono, não a prova em tela).
 */
import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const ASAAS_SANDBOX_KEY = process.env.ASAAS_SANDBOX_KEY ?? "";
const OUT = "/work/out";
const ASAAS_API = "https://api-sandbox.asaas.com/v3";

test.use({ baseURL: BASE_URL, viewport: { width: 1366, height: 900 } });

async function foto(page: Page, nome: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
}

async function asaas<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", access_token: ASAAS_SANDBOX_KEY, ...init?.headers },
  });
  const body = (await r.json()) as T;
  if (!r.ok) throw new Error(`Asaas ${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

let customerId: string;
let paymentId: string;
const ts = Date.now();
const cnpj = `45${String(ts).slice(-12).padStart(12, "0")}`;

test.beforeAll(async () => {
  expect(ASAAS_SANDBOX_KEY, "ASAAS_SANDBOX_KEY").not.toBe("");
  const customer = await asaas<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: `QA Bacco ${ts}`, cpfCnpj: cnpj, mobilePhone: "51999990000" }),
  });
  customerId = customer.id;
  const dueDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const payment = await asaas<{ id: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({ customer: customerId, billingType: "BOLETO", value: 10.0, dueDate }),
  });
  paymentId = payment.id;
});

test.afterAll(async () => {
  if (paymentId) await asaas(`/payments/${paymentId}`, { method: "DELETE" }).catch(() => undefined);
});

test("asaas: ativar, vincular empresa pelo CNPJ e desativar", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  expect(BASE_URL, "BASE_URL").not.toBe("");
  expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
  expect(QA_SENHA, "QA_SENHA").not.toBe("");

  const nomeEmpresa = `Adega Asaas QA ${ts}`;

  // ── 1. Entrar com a conta QA ────────────────────────────────────────────
  await page.goto("/login");
  await page.locator("#email").fill(QA_EMAIL);
  await page.locator("#password").fill(QA_SENHA);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });
  expect(page.url(), "a conta QA já passou do onboarding").toMatch(/\/app\//);

  // ── 2. Configurações → Asaas ─────────────────────────────────────────────
  const linkConfig = page.getByRole("link", { name: "Configurações", exact: true }).first();
  await expect(linkConfig, "a barra lateral oferece Configurações").toBeVisible();
  await linkConfig.click();
  await page.waitForURL(/\/app\/settings$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Asaas", exact: true }).click();
  await page.waitForURL(/\/app\/integrations\/asaas$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await foto(page, "asaas-01-pagina-vazia");

  // ── 3. Preencher e salvar ────────────────────────────────────────────────
  await page.locator("#asaas-api-key").fill(ASAAS_SANDBOX_KEY);
  await page.locator("#asaas-ambiente").click();
  await page.getByRole("option", { name: "Sandbox (teste)" }).click();
  await page.locator("#asaas-dias").fill("5");
  await page.locator("#asaas-max").fill("1");
  await foto(page, "asaas-02-formulario-preenchido");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  // ── 4. Tela do token único (webhook) ─────────────────────────────────────
  const codigoWebhook = page.locator("code").filter({ hasText: "/api/v1/webhooks/asaas/" });
  await expect(codigoWebhook, "a URL do webhook aparece na tela do token único").toBeVisible({ timeout: 15_000 });
  const webhookUrl = (await codigoWebhook.textContent())?.trim() ?? "";
  expect(webhookUrl, "URL do webhook").toContain("/api/v1/webhooks/asaas/");
  await foto(page, "asaas-03-token-unico");
  await page.getByRole("button", { name: "Já copiei" }).click();
  await page.waitForLoadState("networkidle");

  // ── 5. Testar conexão → Ativar ───────────────────────────────────────────
  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByText(/conect|sucesso|ok/i).first(), "mensagem de sucesso do teste de conexão").toBeVisible({
    timeout: 15_000,
  });
  await foto(page, "asaas-04-testar-conexao-ok");
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(page.getByText("Ativa", { exact: true }), "badge Ativa aparece no cabeçalho").toBeVisible({
    timeout: 15_000,
  });
  await foto(page, "asaas-05-ativa");

  // ── 6. Empresas: nova empresa com o CNPJ do customer Asaas ─────────────
  const linkEmpresas = page.getByRole("link", { name: "Empresas", exact: true }).first();
  await expect(linkEmpresas, "a barra lateral oferece Empresas").toBeVisible();
  await linkEmpresas.click();
  await page.waitForURL(/\/app\/companies$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const dialogoNova = page.getByRole("dialog").filter({ hasText: "Nova empresa" });
  await expect(dialogoNova, "o diálogo de nova empresa abre").toBeVisible();
  await dialogoNova.getByLabel("Nome").fill(nomeEmpresa);
  await dialogoNova.getByLabel("CNPJ").fill(cnpj);
  await dialogoNova.getByRole("button", { name: "Criar empresa" }).click();
  await page.waitForURL(/\/app\/companies\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: nomeEmpresa })).toBeVisible();
  const urlDaEmpresa = page.url();
  await foto(page, "asaas-06-empresa-criada");

  // ── 7. Cartão Asaas: vincular pelo CNPJ ──────────────────────────────────
  await page.locator("#asaas-cnpj").fill(cnpj);
  await page.getByRole("button", { name: "Vincular pelo CNPJ" }).click();
  await expect(page.getByText("Cliente do Asaas vinculado"), "o cartão confirma o vínculo").toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("R$ 10,00"), "a cobrança PENDING criada no beforeAll aparece").toBeVisible({
    timeout: 15_000,
  });
  await foto(page, "asaas-07-cliente-vinculado-com-pendencia");

  // ── 8. Desativar a integração ────────────────────────────────────────────
  await page.goto("/app/integrations/asaas");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Desativar", exact: true }).click();
  const dialogoDesativar = page.getByRole("alertdialog").filter({ hasText: "Desativar a integração Asaas?" });
  await expect(dialogoDesativar).toBeVisible();
  await foto(page, "asaas-08-confirmar-desativar");
  await dialogoDesativar.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(page.getByText("Ativa", { exact: true }), "a badge Ativa some depois de desativar").toHaveCount(0, {
    timeout: 15_000,
  });
  await foto(page, "asaas-09-desativada");

  // ── 9. O cartão Asaas some do detalhe da empresa ─────────────────────────
  await page.goto(urlDaEmpresa);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Cliente do Asaas vinculado"),
    "com o módulo desativado, o cartão Asaas não renderiza mais",
  ).toHaveCount(0);
  await foto(page, "asaas-10-empresa-sem-cartao-asaas");
});
