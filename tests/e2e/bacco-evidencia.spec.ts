/**
 * Evidência visual do padrão do kit Bacco — roda NA VPS, contra a produção
 * (Plano 1 v2.1, Task 10; ampliada no Plano 5C, Task 7). Não faz parte do CI
 * (`FORA_DO_CI` em `.github/workflows/e2e.yml`).
 *
 * Autocontida de propósito: só importa `@playwright/test`, sem helpers do repo
 * e sem `playwright.config.ts`, porque roda num contêiner
 * `mcr.microsoft.com/playwright:v1.63.0-noble` com `/work` montado.
 *
 * Dois `test`s (1366 px e 400 px), em série no mesmo worker (sem config o
 * arquivo não é `fullyParallel`). O laço de onboarding do Plano 1 continua:
 * `app/app/layout.tsx` manda para `/onboarding` a organização sem
 * `onboarded_at`, e `app/onboarding/layout.tsx` manda a organização onboardada
 * para `/app/inbox`. Se a conta QA estiver no onboarding, o primeiro teste o
 * percorre até o fim; o segundo já cai em `/app`.
 * O tema troca por `localStorage` `deskcomm-theme` + reload.
 *
 * Mede por ferramenta (`getComputedStyle`), não a olho. Cada medida vai para
 * `/work/out/5c-medidas.jsonl` — nome próprio, para não sobrescrever o
 * `medidas.jsonl` do Plano 1 citado na revisão daquela rodada.
 */
import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";
const TEMAS = ["light", "dark"] as const;
type Tema = (typeof TEMAS)[number];
type Largura = 1366 | 400;

/** Tokens do kit resolvidos (spec §5.1; `app/globals.css`). */
const ESPERADO: Record<Tema, { fundo: string; superficie: string; barra: string; acao: string }> = {
  light: { fundo: "rgb(251, 248, 242)", superficie: "rgb(255, 253, 248)", barra: "rgb(250, 246, 240)", acao: "rgb(106, 23, 48)" },
  dark: { fundo: "rgb(19, 17, 15)", superficie: "rgb(26, 23, 21)", barra: "rgb(29, 15, 18)", acao: "rgb(106, 23, 48)" },
};

test.use({ baseURL: BASE_URL });

function registrar(linha: Record<string, unknown>): void {
  fs.appendFileSync(`${OUT}/5c-medidas.jsonl`, `${JSON.stringify(linha)}\n`);
}

async function aplicarTema(page: Page, tema: Tema): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

async function abrir(page: Page, rota: string): Promise<void> {
  await page.goto(rota);
  await page.waitForLoadState("networkidle");
}

async function medir(page: Page, tela: string, tema: Tema, largura: Largura) {
  const m = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2d indisponível");
    /** Qualquer cor CSS (rgb, color(srgb …), oklch …) → [r, g, b] 0–255 e alfa 0–1, lida do próprio browser. */
    const rgba = (css: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const sobre = (cima: number[], baixo: number[]): number[] => {
      const a = cima[3] ?? 0;
      return [0, 1, 2].map((i) => (cima[i] ?? 0) * a + (baixo[i] ?? 0) * (1 - a)).concat(1);
    };
    /** Fundo que o texto realmente tem: as cores de fundo dos ancestrais compostas até o opaco. */
    const fundoEfetivo = (el: Element): number[] => {
      const camadas: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) camadas.push(rgba(getComputedStyle(n).backgroundColor));
      return camadas.reverse().reduce((base, camada) => sobre(camada, base), [255, 255, 255, 1]);
    };
    const luminancia = (c: number[]): number => {
      const canal = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(c[0] ?? 0) + 0.7152 * canal(c[1] ?? 0) + 0.0722 * canal(c[2] ?? 0);
    };
    const razao = (a: number[], b: number[]): number => {
      const la = luminancia(a);
      const lb = luminancia(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const sonda = (classe: string): string => {
      const el = document.createElement("div");
      el.className = classe;
      document.body.appendChild(el);
      const valor = getComputedStyle(el).backgroundColor;
      el.remove();
      return valor;
    };

    // Contraste do texto secundário, medido na tela: o pior `.text-text-muted` visível com texto.
    let pior: { razao: number; texto: string } | null = null;
    for (const el of [...document.querySelectorAll(".text-text-muted")]) {
      const texto = (el.textContent ?? "").trim();
      if (!texto || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const fundo = fundoEfetivo(el);
      const r = razao(sobre(rgba(getComputedStyle(el).color), fundo), fundo);
      if (pior === null || r < pior.razao) pior = { razao: r, texto: texto.slice(0, 60) };
    }

    // Transbordo horizontal: a página não rola de lado, e nada dentro de `main` passa da borda
    // da tela sem um ancestral que role ou recorte (overflow-x diferente de visible).
    const larguraDaTela = document.documentElement.clientWidth;
    const transbordaPagina = document.documentElement.scrollWidth > larguraDaTela + 1;
    const transbordam: string[] = [];
    for (const el of [...document.querySelectorAll("main, main *")]) {
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (getComputedStyle(el).overflowX !== "visible") continue;
      if (el.getBoundingClientRect().left + el.scrollWidth <= larguraDaTela + 1) continue;
      let contido = false;
      for (let n = el.tagName === "MAIN" ? null : el.parentElement; n && n.tagName !== "MAIN"; n = n.parentElement) {
        if (getComputedStyle(n).overflowX !== "visible") {
          contido = true;
          break;
        }
      }
      if (!contido && transbordam.length < 5) {
        transbordam.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".")}`);
      }
    }

    const abas = document.querySelector("[role='tablist']");
    const vinhedo = document.querySelector("main [data-ilustracao='vinhedo']");
    const tituloVazio = vinhedo?.parentElement?.querySelector("h3") ?? null;
    const barra = document.querySelector("aside");
    const editorial = document.querySelector(".font-display");

    return {
      fundo: getComputedStyle(document.body).backgroundColor,
      superficie: sonda("bg-surface"),
      acao: sonda("bg-accent"),
      corpo: getComputedStyle(document.body).fontFamily,
      barra: barra ? getComputedStyle(barra).backgroundColor : null,
      editorial: editorial ? getComputedStyle(editorial).fontFamily : null,
      laterais: [...document.querySelectorAll("[data-fachada='fundo']")].map((e) => getComputedStyle(e).display),
      piorContraste: pior ? { razao: Math.round(pior.razao * 100) / 100, texto: pior.texto } : null,
      transbordaPagina,
      transbordam,
      abas: abas ? { conteudo: abas.scrollWidth, visivel: abas.clientWidth } : null,
      vinhedo: vinhedo ? { altura: vinhedo.getBoundingClientRect().height, imagem: getComputedStyle(vinhedo).backgroundImage } : null,
      tituloVazio: tituloVazio ? getComputedStyle(tituloVazio).fontFamily : null,
    };
  });
  registrar({ tela, tema, largura, url: page.url(), ...m });
  const rotulo = `${tela}/${tema}/${largura}`;
  expect.soft(m.fundo, `${rotulo}: fundo`).toBe(ESPERADO[tema].fundo);
  expect.soft(m.superficie, `${rotulo}: superfície`).toBe(ESPERADO[tema].superficie);
  expect.soft(m.acao, `${rotulo}: ação`).toBe(ESPERADO[tema].acao);
  expect.soft(m.corpo, `${rotulo}: corpo Inter`).toMatch(/inter/i);
  expect.soft(m.transbordaPagina, `${rotulo}: página sem rolagem horizontal`).toBe(false);
  expect.soft(m.transbordam, `${rotulo}: nada passa da borda da tela`).toEqual([]);
  if (m.piorContraste) {
    expect.soft(m.piorContraste.razao, `${rotulo}: texto secundário "${m.piorContraste.texto}"`).toBeGreaterThanOrEqual(4.5);
  }
  return m;
}

type Medida = Awaited<ReturnType<typeof medir>>;

async function foto(page: Page, tela: string, tema: Tema, largura: Largura): Promise<void> {
  await page.screenshot({ path: `${OUT}/5c-${tela}-${tema}-${largura}.png`, fullPage: true });
}

async function nosDoisTemas(
  page: Page,
  tela: string,
  largura: Largura,
  extra?: (m: Medida, tema: Tema) => void,
): Promise<void> {
  for (const tema of TEMAS) {
    await aplicarTema(page, tema);
    const m = await medir(page, tela, tema, largura);
    extra?.(m, tema);
    await foto(page, tela, tema, largura);
  }
}

function segmentoDoOnboarding(url: string): string | null {
  const m = new URL(url).pathname.match(/^\/onboarding\/([^/]+)/);
  return m ? (m[1] ?? null) : null;
}

/** Laço do Plano 1: percorre o onboarding uma vez, até o fim. Sem onboarding pendente, não faz nada. */
async function concluirOnboarding(page: Page, largura: Largura): Promise<void> {
  const tituloPlayfair = (tela: string) => (m: Medida, tema: Tema) => {
    expect.soft(m.editorial, `${tela}/${tema}/${largura}: título em Playfair`).toMatch(/playfair/i);
  };
  for (let passo = 0; passo < 12 && segmentoDoOnboarding(page.url()) !== null; passo += 1) {
    const seg = segmentoDoOnboarding(page.url());
    const antes = page.url();
    registrar({ onboarding: seg, largura });

    if (seg === "welcome") {
      await nosDoisTemas(page, "onboarding-welcome", largura, tituloPlayfair("onboarding-welcome"));
      await page.getByLabel("O que vocês fazem?").fill("Vendemos vinho para restaurantes e empórios");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Continuar" }).click();
    } else if (seg === "funil") {
      await page.waitForLoadState("networkidle");
      // Com chave de IA a proposta pode vir com outro nome; sem ela, é o pacote do ramo.
      // O nome do quadro vive num <input> (medido: `getByText` não o enxerga).
      const nomes = await page.locator("input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      registrar({ funil_mostra_canal_e_revenda: nomes.includes("Canal e revenda") });
      await nosDoisTemas(page, "onboarding-funil", largura, tituloPlayfair("onboarding-funil"));
      await page.getByRole("button", { name: "Usar este quadro" }).click();
    } else if (seg === "done") {
      await nosDoisTemas(page, "onboarding-done", largura, tituloPlayfair("onboarding-done"));
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
    await page.waitForURL((u) => u.toString() !== antes && /^\/(onboarding\/[^/]+|app\/)/.test(u.pathname), {
      timeout: 60_000,
    });
  }
}

for (const largura of [1366, 400] as const) {
  test(`padrão visual do kit em ${largura}px`, async ({ page }) => {
    test.setTimeout(15 * 60_000);
    expect(BASE_URL, "BASE_URL").not.toBe("");
    expect(QA_EMAIL, "QA_EMAIL").not.toBe("");
    expect(QA_SENHA, "QA_SENHA").not.toBe("");
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: largura, height: largura === 400 ? 860 : 900 });

    // 1. Telas de acesso sem sessão. `/login/mfa` fica fora: exceção declarada na spec §7
    //    (capturá-la exigiria ativar TOTP na conta QA de produção).
    for (const [rota, tela] of [
      ["/login", "login"],
      ["/signup", "cadastro"],
      ["/login/forgot", "esqueci"],
      ["/login/reset", "redefinir"],
      ["/login/recovery", "recuperacao"],
    ] as const) {
      await abrir(page, rota);
      await nosDoisTemas(page, tela, largura, (m, tema) => {
        expect.soft(m.editorial, `${tela}/${tema}/${largura}: título Playfair`).toMatch(/playfair/i);
        // 1366: 2 laterais + 2 véus (o véu do escuro também é display:block). 400: só o gradiente radial.
        const visiveis = m.laterais.filter((d) => d !== "none").length;
        expect.soft(visiveis, `${tela}/${tema}/${largura}: camadas de fundo visíveis`).toBe(largura === 1366 ? 4 : 1);
      });
    }

    // 2. Login com a conta QA.
    await abrir(page, "/login");
    await page.locator("#email").fill(QA_EMAIL);
    await page.locator("#password").fill(QA_SENHA);
    await page.getByRole("button", { name: /^entrar/i }).click();
    await page.waitForURL(/\/(app|onboarding)\//, { timeout: 60_000 });

    // 3. Onboarding, se pendente.
    await concluirOnboarding(page, largura);
    expect(page.url(), "saiu do onboarding").toMatch(/\/app\//);

    const naBarra = (tela: string) => (m: Medida, tema: Tema) => {
      if (largura === 1366) expect.soft(m.barra, `${tela}/${tema}: barra lateral`).toBe(ESPERADO[tema].barra);
    };

    // 4. Inbox: barra, estado vazio editorial e abas com contador sem estourar.
    await abrir(page, "/app/inbox");
    await nosDoisTemas(page, "inbox", largura, (m, tema) => {
      naBarra("inbox")(m, tema);
      expect.soft(m.abas, `inbox/${tema}/${largura}: abas presentes`).not.toBeNull();
      if (m.abas) expect.soft(m.abas.conteudo, `inbox/${tema}/${largura}: abas sem estouro`).toBeLessThanOrEqual(m.abas.visivel + 1);
      if (largura === 1366) {
        expect.soft(m.vinhedo?.altura ?? 0, `inbox/${tema}: gravura do vinhedo com altura`).toBeGreaterThan(0);
        expect.soft(m.vinhedo?.imagem ?? "", `inbox/${tema}: gravura do tema`).toContain(
          tema === "light" ? "vinhedo-claro.webp" : "vinhedo-escuro.webp",
        );
        expect.soft(m.tituloVazio, `inbox/${tema}: título do estado vazio em Playfair`).toMatch(/playfair/i);
      }
    });

    // 5. Funis (lista) e o quadro: `/app/kanban` é a LISTA de funis (medido: não
    //    redireciona); o quadro abre pelo link do funil.
    await abrir(page, "/app/kanban");
    await nosDoisTemas(page, "funis", largura, naBarra("funis"));
    await page.locator('a[href^="/app/pipelines/"]').first().click();
    await page.waitForURL(/\/app\/pipelines\//, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    await nosDoisTemas(page, "kanban", largura, naBarra("kanban"));

    // 6. Catálogo e configurações.
    await abrir(page, "/app/products");
    await nosDoisTemas(page, "catalogo", largura, naBarra("catalogo"));
    await abrir(page, "/app/settings");
    await nosDoisTemas(page, "configuracoes", largura, naBarra("configuracoes"));
  });
}
