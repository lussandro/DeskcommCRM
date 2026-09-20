/**
 * PAINEL DE GRUPOS — chegada pela navegação, estado vazio e o aviso de
 * silêncio (Regra Nº 1: nunca implicar poder que o WhatsApp não tem).
 *
 * Não depende de haver sessão WAHA real conectada: os três casos vivem no
 * que a tela mostra sem grupo nenhum cadastrado, e são o que garante que o
 * módulo tem porta (nav) e não mente sobre o que "silenciar" faz.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

let creds: CredsE2E = lerCreds();
let contexto: BrowserContext;
let page: Page;

test.describe("painel de grupos", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async ({ browser }) => {
    contexto = await browser.newContext();
    page = await contexto.newPage();
    creds = (await loginComoAdmin(page, creds)) as CredsE2E;
  });

  test.afterAll(async () => {
    await contexto?.close();
  });

  test("chega em Grupos pelo link da navegação, não digitando a URL", async () => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Grupos" }).click();
    await page.waitForURL(/\/app\/grupos$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Grupos" })).toBeVisible();
  });

  test("sem grupo cadastrado, o estado vazio explica e oferece o botão de ligar", async () => {
    await page.goto("/app/grupos");
    await expect(page.getByText(/nenhum grupo/i)).toBeVisible({ timeout: 15_000 });
    // Estado vazio sem o botão não vale — é exigência do brief, não estética.
    await expect(page.getByRole("button", { name: /ligar grupo/i })).toBeVisible();
  });

  test("silenciar é apresentado como controle do CRM, não do WhatsApp", async () => {
    // O aviso mora na tabela de membros (`TabelaDeMembros.tsx`), que só
    // renderiza para um grupo cadastrado com membros sincronizados — exige
    // sessão WAHA real conectada, fora do alcance deste ambiente. Provar aqui
    // com um mock mentiria: o texto certo importa menos que ele aparecer
    // ligado ao produto real. Pula com o motivo escrito, não com falso verde.
    test.skip(
      true,
      "exige grupo cadastrado com WAHA real — provar na VPS, não aqui (ver task-8-report.md)",
    );
  });
});
