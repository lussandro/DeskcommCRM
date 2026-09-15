/**
 * Evidência visual do rebrand Bacco — roda NA VPS, contra a produção
 * (Plano 1 v2.1, Task 10). Não faz parte do CI.
 *
 * Autocontida de propósito: só importa `@playwright/test`, sem helpers do repo
 * e sem `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado.
 *
 * Um só `test`, uma só sessão: o onboarding só existe uma vez por organização
 * (`app/app/layout.tsx` manda para `/onboarding` sem `onboarded_at`, e
 * `app/onboarding/layout.tsx` manda a organização onboardada para `/app/inbox`).
 * O tema troca por `localStorage` `deskcomm-theme` + reload.
 *
 * Mede por ferramenta (`getComputedStyle`), não a olho: cor do accent, fonte do
 * corpo e dos títulos. Cada medida vai para `/work/out/medidas.jsonl`.
 */
import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";

const TEMAS = ["light", "dark"] as const;
type Tema = (typeof TEMAS)[number];

/** `--color-accent` resolvido: claro grau 600, escuro grau 300 (app/globals.css). */
const ACCENT: Record<Tema, string> = {
  light: "rgb(74, 14, 31)",
  dark: "rgb(185, 130, 139)",
};

test.use({ baseURL: BASE_URL, viewport: { width: 1366, height: 900 } });

function registrar(linha: Record<string, unknown>): void {
  fs.appendFileSync(`${OUT}/medidas.jsonl`, `${JSON.stringify(linha)}\n`);
}

async function aplicarTema(page: Page, tema: Tema): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

type Medida = { accent: string; corpo: string; titulo: string | null };

async function medir(page: Page, tela: string, tema: Tema): Promise<Medida> {
  const m = await page.evaluate(() => {
    const sonda = document.createElement("div");
    sonda.className = "bg-accent";
    document.body.appendChild(sonda);
    const accent = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    // O título de passo usa `font-display`; o primeiro `h1` do onboarding é o nome da
    // organização no layout (medido: pegava ele e reportava Inter).
    const titulo = document.querySelector(".font-display") ?? document.querySelector("h1, h2");
    return {
      accent,
      corpo: getComputedStyle(document.body).fontFamily,
      titulo: titulo ? getComputedStyle(titulo).fontFamily : null,
    };
  });
  registrar({ tela, tema, url: page.url(), ...m });
  expect.soft(m.accent, `${tela}/${tema}: accent`).toBe(ACCENT[tema]);
  expect.soft(m.corpo, `${tela}/${tema}: corpo em Inter`).toMatch(/inter/i);
  return m;
}

async function foto(page: Page, tela: string, tema: Tema): Promise<void> {
  await page.screenshot({ path: `${OUT}/10-${tela}-${tema}.png`, fullPage: true });
}

/** Mede e fotografa a tela atual nos dois temas. Título público exige Playfair; o do app, não. */
async function nosDoisTemas(page: Page, tela: string, tituloPublico: boolean): Promise<void> {
  for (const tema of TEMAS) {
    await aplicarTema(page, tema);
    const m = await medir(page, tela, tema);
    if (m.titulo !== null) {
      if (tituloPublico) expect.soft(m.titulo, `${tela}/${tema}: título em Playfair`).toMatch(/playfair/i);
      else expect.soft(m.titulo, `${tela}/${tema}: título do app sem Playfair`).not.toMatch(/playfair/i);
    }
    await foto(page, tela, tema);
  }
}

function segmentoDoOnboarding(url: string): string | null {
  const m = new URL(url).pathname.match(/^\/onboarding\/([^/]+)/);
  return m ? (m[1] ?? null) : null;
}

test("rebrand Bacco nas telas reais, claro e escuro", async ({ page, request }) => {
  test.setTimeout(10 * 60_000);
  expect(BASE_URL, "BASE_URL").not.toBe("");
  expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
  expect(QA_SENHA, "QA_SENHA").not.toBe("");
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(`${OUT}/medidas.jsonl`, { force: true });

  // 0. Favicon gerado em runtime.
  const icone = await request.get("/icon");
  expect.soft(icone.status(), "/icon status").toBe(200);
  expect.soft(icone.headers()["content-type"], "/icon tipo").toContain("image/png");
  fs.writeFileSync(`${OUT}/10-icon.png`, await icone.body());

  // 1. Deslogado.
  await page.goto("/login");
  await nosDoisTemas(page, "login", true);

  // 2. Login com a conta QA.
  await page.getByLabel("Email").fill(QA_EMAIL);
  await page.getByLabel("Senha").fill(QA_SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });

  // 3. Onboarding, uma vez, até o fim.
  for (let passo = 0; passo < 12 && segmentoDoOnboarding(page.url()) !== null; passo += 1) {
    const seg = segmentoDoOnboarding(page.url());
    const antes = page.url();
    registrar({ onboarding: seg });

    if (seg === "welcome") {
      await nosDoisTemas(page, "onboarding-welcome", true);
      await page.getByLabel("O que vocês fazem?").fill("Vendemos vinho para restaurantes e empórios");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Continuar" }).click();
    } else if (seg === "funil") {
      await page.waitForLoadState("networkidle");
      // Com chave de IA a proposta pode vir com outro nome; sem ela, é o pacote do ramo.
      // O nome do quadro vive num <input> (medido: `getByText` não o enxerga).
      const nomes = await page.locator("input").evaluateAll((els) =>
        els.map((e) => (e as HTMLInputElement).value),
      );
      registrar({ funil_mostra_clientes_da_vinicola: nomes.includes("Clientes da vinícola") });
      await nosDoisTemas(page, "onboarding-funil", true);
      await page.getByRole("button", { name: "Usar este quadro" }).click();
    } else if (seg === "done") {
      await nosDoisTemas(page, "onboarding-done", true);
      await page.getByRole("button", { name: "Começar a usar" }).click();
      await page.waitForURL(/\/app\//, { timeout: 60_000 });
      break;
    } else {
      await page
        .getByRole("button", { name: /^Pular( por enquanto)?$/ })
        .first()
        .click();
    }
    // `/onboarding` sozinho é só o redirecionador para o próximo passo (medido: o
    // laço saía nele). Espera um passo de verdade ou o app.
    await page.waitForURL(
      (u) => u.toString() !== antes && /^\/(onboarding\/[^/]+|app\/)/.test(u.pathname),
      { timeout: 60_000 },
    );
  }
  expect(page.url(), "saiu do onboarding").toMatch(/\/app\//);

  // 4. Telas do app.
  for (const [rota, tela] of [
    ["/app/inbox", "inbox"],
    ["/app/products", "catalogo"],
  ] as const) {
    await page.goto(rota);
    await page.waitForLoadState("networkidle");
    await nosDoisTemas(page, tela, false);
  }

  // 5. Kanban com um lead criado pela tela. `/app/kanban` é a LISTA de funis
  // (medido: não redireciona); o quadro abre pelo link do funil.
  await page.goto("/app/kanban");
  await page.waitForLoadState("networkidle");
  await nosDoisTemas(page, "funis", false);
  await page.locator('a[href^="/app/pipelines/"]').first().click();
  await page.waitForURL(/\/app\/pipelines\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Novo Lead" }).click();
  await page.getByLabel("Título").fill("Restaurante Serra — carta de vinhos");
  await page.getByRole("button", { name: "Criar lead" }).click();
  await expect(page.getByText("Restaurante Serra — carta de vinhos").first()).toBeVisible({ timeout: 30_000 });
  await nosDoisTemas(page, "kanban", false);

  // 6. Detalhe do lead, se a tela oferecer o caminho (medido: o card não linka por padrão).
  const link = page.locator('a[href^="/app/leads/"]').first();
  if ((await link.count()) > 0) {
    await page.goto((await link.getAttribute("href")) ?? "/app/kanban");
    await page.waitForLoadState("networkidle");
    await nosDoisTemas(page, "lead", false);
  } else {
    registrar({ lead_detalhe: "sem link para /app/leads/ na tela do pipeline" });
  }
});
