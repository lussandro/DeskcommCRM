/**
 * Prova em tela de Empresas — roda NA VPS, contra a produção (spec
 * `2026-09-17-empresas`, Task 10). Não faz parte do CI (`FORA_DO_CI` em
 * `.github/workflows/e2e.yml`) — molde de `tests/e2e/bacco-jornadas.spec.ts`.
 *
 * Autocontida de propósito: só `@playwright/test`, sem helpers do repo e sem
 * `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado.
 *
 * Jornada, pela tela, como um leigo faria:
 *
 *   1. Login → sidebar "Empresas" (não digita a URL).
 *   2. Cria dois contatos próprios (a org de QA pode não ter nenhum — a spec
 *      não depende do que já existe) e uma empresa nova (nome + CNPJ).
 *   3. "Vincular contato": busca cada um pelo nome e vincula os dois.
 *   4. "Tornar principal" no primeiro → badge `principal` aparece **uma** vez.
 *   5. Abre o 360 do primeiro → linha "Empresa" com o nome + badge.
 *   6. Edita o contato → escolhe "Nenhuma" no seletor de empresa → salva →
 *      a linha "Empresa" some do 360.
 *   7. Volta ao detalhe da empresa → 1 contato, sem badge de principal.
 *
 * CNPJ: 14 dígitos derivados do timestamp — um valor fixo colidiria (409) com
 * o que uma rodada anterior já cadastrou.
 */
import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";

test.use({ baseURL: BASE_URL, viewport: { width: 1366, height: 900 } });

async function foto(page: Page, nome: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
}

test("empresas: cadastrar, vincular contatos e trocar o número principal", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  expect(BASE_URL, "BASE_URL").not.toBe("");
  expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
  expect(QA_SENHA, "QA_SENHA").not.toBe("");

  const ts = Date.now();
  const nomeEmpresa = `Adega QA ${ts}`;
  const cnpj = `11${String(ts).slice(-12).padStart(12, "0")}`;
  const nomeContato1 = `QA Fin 1 ${ts}`;
  const nomeContato2 = `QA Fin 2 ${ts}`;

  // ── 1. Entrar com a conta QA ────────────────────────────────────────────
  await page.goto("/login");
  await page.locator("#email").fill(QA_EMAIL);
  await page.locator("#password").fill(QA_SENHA);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });
  expect(page.url(), "a conta QA já passou do onboarding").toMatch(/\/app\//);

  // ── 2. Dois contatos próprios, pela tela de Contatos ────────────────────
  await page.goto("/app/contacts");
  await page.waitForLoadState("networkidle");
  for (const nome of [nomeContato1, nomeContato2]) {
    await page.getByRole("button", { name: "Novo contato" }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Novo contato" });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Nome").fill(nome);
    await dlg
      .getByLabel(/Telefone/)
      .fill(`+55119${String(ts).slice(-7)}${nome.endsWith("1") ? "1" : "2"}`);
    await dlg.getByRole("button", { name: "Criar contato" }).click();
    await expect(dlg, `"${nome}": o diálogo fecha depois de criar`).toBeHidden({ timeout: 15_000 });
  }
  await foto(page, "empresas-01-contatos-criados");

  // ── 3. Chegar em Empresas PELA NAVEGAÇÃO ────────────────────────────────
  const linkEmpresas = page.getByRole("link", { name: "Empresas", exact: true }).first();
  await expect(linkEmpresas, "a barra lateral oferece Empresas").toBeVisible();
  await linkEmpresas.click();
  await page.waitForURL(/\/app\/companies$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await foto(page, "empresas-02-lista");

  // ── 4. Nova empresa ──────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const dialogoNova = page.getByRole("dialog").filter({ hasText: "Nova empresa" });
  await expect(dialogoNova, "o diálogo de nova empresa abre").toBeVisible();
  await dialogoNova.getByLabel("Nome").fill(nomeEmpresa);
  await dialogoNova.getByLabel("CNPJ").fill(cnpj);
  await foto(page, "empresas-03-novo-formulario");
  await dialogoNova.getByRole("button", { name: "Criar empresa" }).click();
  await page.waitForURL(/\/app\/companies\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: nomeEmpresa })).toBeVisible();
  const urlDaEmpresa = page.url();
  await foto(page, "empresas-04-detalhe-criada");

  // ── 5. Vincular os dois contatos, buscando pelo nome ────────────────────
  async function vincular(nomeDoContato: string): Promise<void> {
    await page.getByRole("button", { name: "Vincular contato" }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Vincular contato" });
    await expect(dlg).toBeVisible();
    await dlg.getByPlaceholder("Buscar por nome, email ou telefone…").fill(nomeDoContato);
    const linha = dlg.locator("li").filter({ hasText: nomeDoContato });
    await expect(linha, `"${nomeDoContato}": a busca encontra o contato`).toBeVisible({
      timeout: 15_000,
    });
    await linha.getByRole("button", { name: "Vincular" }).click();
    await expect(linha, `"${nomeDoContato}": some da lista de busca depois de vincular`).toBeHidden({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  }

  await vincular(nomeContato1);
  await vincular(nomeContato2);
  await page.waitForLoadState("networkidle");
  await foto(page, "empresas-05-dois-contatos-vinculados");

  // ── 6. Tornar o primeiro principal ──────────────────────────────────────
  const linhaContato1 = page.locator("li").filter({ hasText: nomeContato1 });
  await linhaContato1.getByRole("button", { name: "Tornar principal" }).click();
  const badge = page.getByTestId("principal");
  await expect(badge, "a badge de número principal aparece").toBeVisible({ timeout: 15_000 });
  await expect(badge, "a badge aparece EXATAMENTE uma vez").toHaveCount(1);
  await foto(page, "empresas-06-principal-marcado");

  // ── 7. Abrir o 360 do contato principal ─────────────────────────────────
  await linhaContato1.getByRole("link", { name: nomeContato1 }).click();
  await page.waitForURL(/\/app\/contacts\/[^/]+$/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const linhaEmpresa = page
    .locator("dt", { hasText: "Empresa" })
    .locator("xpath=following-sibling::dd[1]");
  await expect(linhaEmpresa, "o 360 do contato mostra a linha Empresa").toBeVisible();
  await expect(linhaEmpresa).toContainText(nomeEmpresa);
  await expect(linhaEmpresa.getByText("Número principal para cobrança")).toBeVisible();
  await foto(page, "empresas-07-contato-360-com-empresa");

  // ── 8. Editar contato → "Nenhuma" ───────────────────────────────────────
  await page.getByRole("button", { name: "Editar" }).click();
  const dialogoEditar = page.getByRole("dialog").filter({ hasText: "Editar contato" });
  await expect(dialogoEditar).toBeVisible();
  await dialogoEditar.locator("#ec-company").click();
  await page.getByRole("option", { name: "Nenhuma", exact: true }).click();
  await foto(page, "empresas-08-editar-empresa-nenhuma");
  await dialogoEditar.getByRole("button", { name: "Salvar" }).click();
  await expect(dialogoEditar).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await expect(
    page.locator("dt", { hasText: "Empresa" }),
    "o 360 do contato não mostra mais a linha Empresa depois de desvincular",
  ).toHaveCount(0);
  await foto(page, "empresas-09-contato-sem-empresa");

  // ── 9. De volta ao detalhe: 1 contato, sem badge de principal ───────────
  await page.goto(urlDaEmpresa);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("principal"), "ninguém mais é o principal").toHaveCount(0);
  await expect(
    page.locator("li").filter({ hasText: nomeContato2 }),
    "o segundo contato continua vinculado",
  ).toBeVisible();
  await expect(
    page.locator("li").filter({ hasText: nomeContato1 }),
    "o primeiro contato foi desvinculado ao trocar a empresa para Nenhuma",
  ).toHaveCount(0);
  await foto(page, "empresas-10-detalhe-final");
});
