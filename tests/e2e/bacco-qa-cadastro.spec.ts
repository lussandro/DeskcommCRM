/**
 * Cadastro da conta QA pela tela — roda NA VPS, contra a produção (Plano 1
 * v2.1, Task 10 Step 3). Não faz parte do CI.
 *
 * Só o formulário de `/signup`, com os mesmos seletores de
 * `signup-journey.spec.ts`. A confirmação NÃO é simulada aqui: o link do e-mail é
 * `/auth/confirm?type=signup&token_hash=<auth.users.confirmation_token>`, e quem
 * roda na VPS abre essa mesma rota — é ela que provisiona a organização.
 */
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";

test.use({ baseURL: BASE_URL, viewport: { width: 1366, height: 900 } });

test("cadastro da conta QA pela tela", async ({ page }) => {
  expect(BASE_URL, "BASE_URL").not.toBe("");
  expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
  expect(QA_SENHA, "QA_SENHA").not.toBe("");

  await page.goto("/login");
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.screenshot({ path: `${OUT}/10-signup-light.png`, fullPage: true });

  await page.getByLabel("Nome da empresa").fill("Vinícola Serra Alta (QA)");
  await page.getByLabel("Email").fill(QA_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(QA_SENHA);
  await page.getByLabel("Confirmar senha").fill(QA_SENHA);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Confirme seu e-mail")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/10-signup-enviado-light.png`, fullPage: true });
});
