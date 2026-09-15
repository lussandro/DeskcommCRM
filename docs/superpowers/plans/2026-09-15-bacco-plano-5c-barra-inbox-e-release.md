# Bacco Adega CRM — Plano 5C: barra lateral, inbox editorial, release v26.9.2 e prova em tela

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a barra lateral e a inbox ao visual das referências do kit Bacco (fundo tingido, item ativo em vinho, estado vazio editorial com gravura e citação), soltar a release `v26.9.2` com 5A+5B+5C e provar tudo em tela na VPS.

**Architecture:** Ilustrações do kit tratadas por script e servidas de `public/ilustracoes/` como `background-image` em `div aria-hidden` (nunca `<img>`: `tests/e2e/marca-logo.spec.ts` mede "`<aside>` sem `<img>`" como "sem logo de revendedor", e a barra e o painel do contato são `<aside>`). `EmptyState` ganha modo editorial. Barra lateral usa `bg-sidebar` e seleção `bg-accent-soft text-accent-text`. Prova em tela por Playwright na VPS, medida por `getComputedStyle`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Vitest 4 + Testing Library, Pillow, Playwright 1.63 (contêiner na VPS).

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-padrao-visual-design.md` (§5.4, §6, §7). **Depende dos Planos 5A e 5B executados.**

## Global Constraints

- Branch `bacco`; push `git push --no-tags origin bacco:main`. Tag anotada `v26.9.2` só depois de CI verde no SHA final (Task 6).
- Local só comando puro (`source ~/.nvm/nvm.sh && nvm use 22`); suíte inteira no CI; tela na VPS.
- **Densidade da barra:** `tests/e2e/navegacao.spec.ts` reprova se a `nav` rolar em 1280×900 (folga medida: 19 px). Nada novo na barra ocupa altura abaixo de 1000 px de altura de viewport.
- Nenhuma seção de painel promete funcionalidade que não existe (spec §3): o painel do contato fala de "detalhes, demandas abertas e memória", não de compras/clube/preferências.
- Texto novo em `t(...)` ganha `es`; imagens em `evidence/` citadas por caminho completo.
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 0: Conferir a base

- [ ] **Step 1:** `git log --oneline -15` mostra os commits dos Planos 5A e 5B; `grep -c -- "--color-sidebar" app/globals.css` ≥ 2; `ls public/fachada/` lista as duas laterais.

---

### Task 1: Ilustrações da barra e da inbox

**Files:**
- Create: `docs/brand/bacco/preparar-ilustracoes.py`
- Create (gerado): `public/ilustracoes/{vinhedo,citacao,rodape}-{claro,escuro}.webp`
- Create: `evidence/bacco-rebrand/5c-ilustracoes.png`, `evidence/bacco-rebrand/5c-ilustracoes.md`

- [ ] **Step 1:** `docs/brand/bacco/preparar-ilustracoes.py`:

```python
#!/usr/bin/env python3
"""Gera public/ilustracoes/*.webp a partir das ilustrações do kit v2 (Plano 5C).

- vinhedo: empty-state-vineyard-* como vem (limpo; o fundo emenda com --color-bg, razão ≤ 1,026).
- citacao: quote-card-image-* como vem (limpo; a borda é suavizada por mask-image no CSS).
- rodape: sidebar-footer-vineyard-* recortado em x 0–100, y 30–106 — só a gravura. O arquivo do kit
  traz "Configurações" (y < 30) e a frase (x > 100) gravados; conferido por zoom em 2026-09-15.
Uso, da raiz: python3 docs/brand/bacco/preparar-ilustracoes.py
"""
import os
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
KIT = RAIZ / "docs/brand/bacco/kit-v2/ui/illustrations"
SAIDA = RAIZ / "public/ilustracoes"
TEMAS = {"claro": "light", "escuro": "dark"}


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for tema, kit in TEMAS.items():
        pecas = {
            "vinhedo": Image.open(KIT / kit / f"empty-state-vineyard-{kit}.png").convert("RGB"),
            "citacao": Image.open(KIT / kit / f"quote-card-image-{kit}.png").convert("RGB"),
            "rodape": Image.open(KIT / kit / f"sidebar-footer-vineyard-{kit}.png").convert("RGB").crop((0, 30, 100, 106)),
        }
        for nome, img in pecas.items():
            destino = SAIDA / f"{nome}-{tema}.webp"
            img.save(destino, "WEBP", quality=82, method=6)
            print(f"{destino.relative_to(RAIZ)} {img.size[0]}x{img.size[1]} {os.path.getsize(destino) // 1024} KB")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2:** `python3 docs/brand/bacco/preparar-ilustracoes.py` → 6 linhas: `vinhedo-claro 625x305`, `citacao-claro 142x120`, `rodape-claro 100x76`, `vinhedo-escuro 625x285`, `citacao-escuro 142x120`, `rodape-escuro 100x76`.
- [ ] **Step 3: Evidência** — montar uma folha com as seis sobre o fundo do tema:

```bash
python3 - <<'PY'
from PIL import Image
pecas = ["vinhedo", "citacao", "rodape"]
folha = Image.new("RGB", (1300, 700), (128, 128, 128))
for col, (tema, fundo) in enumerate((("claro", (251, 248, 242)), ("escuro", (19, 17, 15)))):
    x0 = col * 650; y = 10
    folha.paste(Image.new("RGB", (640, 680), fundo), (x0 + 5, 10))
    for p in pecas:
        img = Image.open(f"public/ilustracoes/{p}-{tema}.webp").convert("RGB")
        folha.paste(img, (x0 + 10, y)); y += img.size[1] + 10
folha.save("evidence/bacco-rebrand/5c-ilustracoes.png")
PY
```
  Abrir `evidence/bacco-rebrand/5c-ilustracoes.png`: nenhuma letra ou pedaço de interface; registrar em `evidence/bacco-rebrand/5c-ilustracoes.md` (origem kit v2, recorte do rodapé), citando o PNG pelo caminho completo.
- [ ] **Step 4:** `git add public/ilustracoes docs/brand/bacco/preparar-ilustracoes.py evidence/bacco-rebrand/5c-ilustracoes.*` e `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0. Commit `feat(bacco): ilustrações da barra lateral e da inbox` + trailer.

---

### Task 2: Estado vazio editorial

**Files:**
- Modify: `components/empty/EmptyState.tsx`
- Test: `tests/unit/estado-vazio-editorial.test.tsx`

**Interfaces:**
- Produces: `EmptyStateProps` ganha `editorial?: boolean`, `ilustracao?: "vinhedo"`, `citacao?: string`. Sem esses campos, o render é idêntico ao de hoje.

- [ ] **Step 1: Teste que falha** — `tests/unit/estado-vazio-editorial.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyState } from "@/components/empty/EmptyState";
import { ChatCircle } from "@/lib/ui/icons";

describe("EmptyState editorial", () => {
  afterEach(() => cleanup());

  it("sem os campos novos, nada muda: ícone, título comum, sem imagem", () => {
    const { container } = render(<EmptyState icon={ChatCircle} headline="Quadro vazio" />);
    expect(screen.getByRole("heading", { name: "Quadro vazio" }).className).not.toContain("font-display");
    expect(container.querySelector("[data-ilustracao]")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("editorial: título serifado, gravura decorativa em CSS e citação", () => {
    const { container } = render(
      <EmptyState icon={ChatCircle} headline="Selecione uma conversa" editorial ilustracao="vinhedo" citacao="Mais que clientes, apreciadores de boas histórias." />,
    );
    expect(screen.getByRole("heading", { name: "Selecione uma conversa" }).className).toContain("font-display");
    const ilustracao = container.querySelector("[data-ilustracao='vinhedo']");
    expect(ilustracao?.getAttribute("aria-hidden")).toBe("true");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-claro.webp");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-escuro.webp");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/Mais que clientes, apreciadores de boas histórias\./)).toBeTruthy();
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/estado-vazio-editorial.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** — em `components/empty/EmptyState.tsx`:
  - `EmptyStateProps` ganha:

```ts
  /** Modo editorial (kit Bacco): título Playfair, gravura e citação. */
  editorial?: boolean;
  ilustracao?: "vinhedo";
  citacao?: string;
```

  - A assinatura desestrutura `editorial, ilustracao, citacao`.
  - O JSX de retorno passa a ser:

```tsx
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {ilustracao === "vinhedo" ? (
        <div
          data-ilustracao="vinhedo"
          aria-hidden="true"
          className="mb-2 aspect-[625/305] w-full max-w-[34rem] bg-[url('/ilustracoes/vinhedo-claro.webp')] bg-contain bg-center bg-no-repeat dark:bg-[url('/ilustracoes/vinhedo-escuro.webp')]"
        />
      ) : (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon size={24} weight="duotone" />
        </div>
      )}
      <h3 className={editorial ? "font-display text-2xl font-semibold text-text" : "text-base font-semibold"}>
        {t(headline)}
      </h3>
      {subcopy ? (
        <p className={editorial ? "mt-2 max-w-md text-sm text-text-muted" : "mt-1 max-w-sm text-sm text-muted-foreground"}>
          {t(subcopy)}
        </p>
      ) : null}
      {(primary || secondary) && (
        <div className="mt-4 flex gap-2">
          {secondary ? <ActionButton action={secondary} variant="outline" /> : null}
          {primary ? <ActionButton action={primary} variant="default" /> : null}
        </div>
      )}
      {citacao ? (
        <figure className="mt-8">
          <blockquote className="font-display text-base italic text-gold-text">“{t(citacao)}”</blockquote>
          <span aria-hidden="true" className="mx-auto mt-3 block h-px w-12 bg-gold" />
        </figure>
      ) : null}
    </div>
```

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/estado-vazio-editorial.test.tsx tests/unit/tailwind-tokens.test.ts` → exit 0.
- [ ] **Step 5: Commit** — `feat(bacco): estado vazio editorial com gravura e citação` + trailer.

---

### Task 3: Inbox

**Files:**
- Modify: `components/inbox/InboxLayout.tsx` (ramo final "Selecione uma conversa"), `components/inbox/CRMSidePanel.tsx` (bloco `if (!conversation)`), `components/inbox/ConversationListItem.tsx` (classe de selecionado), `components/inbox/InboxFilters.tsx` (contador da aba), `lib/i18n/dicionario.ts`
- Test: `tests/unit/inbox-editorial.test.tsx`

- [ ] **Step 1: Quem já cobra os textos que mudam** — `grep -rnE "Selecione uma conversa para ver detalhes do contato|Ou navegue com J e K|bg-accent-50" tests components app --include=*.test.ts --include=*.test.tsx --include=*.spec.ts`. Cada ocorrência é atualizada no mesmo commit com o texto/classe novo; se alguma for spec e2e em `SPECS_PARTE_*`, atualizar o seletor e registrar no commit.

- [ ] **Step 2: Teste que falha** — `tests/unit/inbox-editorial.test.tsx`:

```tsx
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ler = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("inbox no padrão editorial do kit", () => {
  it("o centro sem conversa usa o EmptyState editorial com gravura e citação", () => {
    const fonte = ler("components/inbox/InboxLayout.tsx");
    expect(fonte).toMatch(/<EmptyState[\s\S]*?editorial[\s\S]*?ilustracao="vinhedo"[\s\S]*?citacao=/);
  });

  it("o painel do contato vazio fala só do que existe e desenha a imagem em CSS", () => {
    const fonte = ler("components/inbox/CRMSidePanel.tsx");
    expect(fonte).toContain("Selecione um contato");
    expect(fonte).toContain("/ilustracoes/citacao-claro.webp");
    expect(fonte).not.toMatch(/Compras e hist|Clube e assinaturas|Prefer.ncias de vinho/);
  });

  it("conversa selecionada e contador de aba usam os tokens do kit", () => {
    expect(ler("components/inbox/ConversationListItem.tsx")).toMatch(/isSelected && "bg-accent-soft/);
    expect(ler("components/inbox/InboxFilters.tsx")).toMatch(/rounded-full bg-accent-soft[^"]*text-accent-text/);
  });
});
```

- [ ] **Step 3:** `pnpm exec vitest run tests/unit/inbox-editorial.test.tsx` → FAIL.
- [ ] **Step 4: `InboxLayout.tsx`** — o último ramo (o `<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">` com `ChatCircle`, "Selecione uma conversa" e "Ou navegue com J e K") vira:

```tsx
          <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6">
            <EmptyState
              icon={ChatCircle}
              editorial
              ilustracao="vinhedo"
              headline="Selecione uma conversa"
              subcopy="Converse com seus clientes, visitantes e parceiros. Aqui nascem grandes histórias."
              citacao="Mais que clientes, apreciadores de boas histórias."
            />
            <p className="-mt-8 text-xs text-text-subtle">{t("Ou navegue com J e K")}</p>
          </div>
```
  e o import `import { EmptyState } from "@/components/empty";` (o barril já exporta `EmptyState`, medido em `app/app/activities/_components/ActivityReportClient.tsx`).

- [ ] **Step 5: `CRMSidePanel.tsx`** — o bloco

```tsx
  if (!conversation) {
    return (
      <aside className="flex h-full items-center justify-center border-l border-border p-4 text-center text-xs text-muted-foreground">
        {t("Selecione uma conversa para ver detalhes do contato.")}
      </aside>
    );
  }
```
  vira

```tsx
  if (!conversation) {
    return (
      <aside className="flex h-full flex-col items-center justify-center gap-8 border-l border-border p-6 text-center">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-text">{t("Selecione um contato")}</h2>
          <p className="text-sm text-text-muted">
            {t("Veja aqui os detalhes do cliente, as demandas abertas e a memória do contato.")}
          </p>
        </div>
        <figure className="relative w-full max-w-xs overflow-hidden rounded-lg border border-border bg-surface">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-2/5 bg-[url('/ilustracoes/citacao-claro.webp')] bg-cover bg-center [mask-image:linear-gradient(to_right,black_60%,transparent)] dark:bg-[url('/ilustracoes/citacao-escuro.webp')]"
          />
          <blockquote className="relative py-6 pl-[42%] pr-4 text-left font-display text-sm italic leading-relaxed text-text">
            “{t("O vinho aproxima pessoas e transforma momentos em memórias.")}”
          </blockquote>
        </figure>
      </aside>
    );
  }
```

- [ ] **Step 6: `ConversationListItem.tsx`** — `isSelected && "bg-accent-50 hover:bg-accent-50",` → `isSelected && "bg-accent-soft hover:bg-accent-soft",`.
- [ ] **Step 7: `InboxFilters.tsx`** — o contador `<span className="text-[11px] tabular-nums text-text-subtle">{count}</span>` → `<span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium tabular-nums text-accent-text">{count}</span>`.
- [ ] **Step 8: Dicionário** — `grep -nE '^  "(Selecione um contato|Grandes vinhos criam grandes conexões\.)":' lib/i18n/dicionario.ts` (esperado vazio); acrescentar, junto do bloco da fachada do 5B:

```ts
  // ─── Inbox e barra lateral editoriais (Plano 5C) ───
  "Converse com seus clientes, visitantes e parceiros. Aqui nascem grandes histórias.": {
    es: "Conversa con tus clientes, visitantes y socios. Aquí nacen grandes historias.",
  },
  "Mais que clientes, apreciadores de boas histórias.": { es: "Más que clientes, amantes de las buenas historias." },
  "Selecione um contato": { es: "Selecciona un contacto" },
  "Veja aqui os detalhes do cliente, as demandas abertas e a memória do contato.": {
    es: "Mira aquí los detalles del cliente, las demandas abiertas y la memoria del contacto.",
  },
  "O vinho aproxima pessoas e transforma momentos em memórias.": {
    es: "El vino acerca a las personas y transforma momentos en recuerdos.",
  },
  "Grandes vinhos criam grandes conexões.": { es: "Grandes vinos crean grandes conexiones." },
```

- [ ] **Step 9:** `pnpm exec vitest run tests/unit/inbox-editorial.test.tsx tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/tailwind-tokens.test.ts components/inbox && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 10: Commit** — `feat(bacco): inbox editorial — estado vazio, painel do contato e seleção no kit` + trailer.

---

### Task 4: Barra lateral

**Files:**
- Modify: `components/shell/Sidebar.tsx`
- Test: `tests/unit/barra-lateral-kit.test.ts`

- [ ] **Step 1: Teste que falha** — `tests/unit/barra-lateral-kit.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FONTE = fs.readFileSync(path.join(process.cwd(), "components/shell/Sidebar.tsx"), "utf8");

describe("barra lateral no padrão do kit Bacco", () => {
  it("usa a superfície própria da barra", () => {
    expect(FONTE).toMatch(/sticky top-0[^"]*bg-sidebar/);
    expect(FONTE).not.toMatch(/sticky top-0[^"]*bg-card/);
  });

  it("item ativo é vinho suave com texto da ação, nunca o fill cheio", () => {
    expect(FONTE).not.toContain('"bg-accent text-accent-foreground"');
    expect((FONTE.match(/"bg-accent-soft font-medium text-accent-text"/g) ?? []).length).toBe(3);
  });

  it("o rodapé ilustrado é decorativo, em CSS e só aparece com altura ≥ 1000 px", () => {
    // `navegacao.spec.ts` reprova a nav rolando em 1280×900 com 19 px de folga medidos.
    expect(FONTE).toMatch(/aria-hidden="true"[^>]*\[@media\(min-height:1000px\)\]:flex/);
    expect(FONTE).toContain("/ilustracoes/rodape-claro.webp");
    expect(FONTE).not.toMatch(/<img[^>]*ilustracoes/);
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/barra-lateral-kit.test.ts` → FAIL.
- [ ] **Step 3: Implementar** em `components/shell/Sidebar.tsx`:
  - As três ocorrências de `? "bg-accent text-accent-foreground"` (item do grupo, hub do grupo, rodapé Configurações) → `? "bg-accent-soft font-medium text-accent-text"`.
  - `export function Sidebar`: `border-r bg-card transition-[width]` → `border-r bg-sidebar transition-[width]`.
  - No rodapé, logo depois de `<div className="border-t p-2">`:

```tsx
        {!collapsed && (
          <div
            aria-hidden="true"
            className="hidden items-end gap-2 px-2 pb-2 [@media(min-height:1000px)]:flex"
          >
            <div className="h-12 w-16 shrink-0 bg-[url('/ilustracoes/rodape-claro.webp')] bg-contain bg-bottom bg-no-repeat dark:bg-[url('/ilustracoes/rodape-escuro.webp')]" />
            <p className="font-display text-[11px] italic leading-tight text-text-muted">
              {t("Grandes vinhos criam grandes conexões.")}
            </p>
          </div>
        )}
```

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/barra-lateral-kit.test.ts tests/unit/barra-lateral-nao-perde-o-sticky.test.ts tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5: Commit** — `feat(bacco): barra lateral tingida, seleção em vinho e rodapé ilustrado` + trailer.

---

### Task 5: Spec de evidência do padrão visual

**Files:**
- Modify: `tests/e2e/bacco-evidencia.spec.ts` (substituição integral)

- [ ] **Step 1:** Substituir o conteúdo de `tests/e2e/bacco-evidencia.spec.ts` por:

```ts
/**
 * Evidência visual do padrão do kit Bacco — roda NA VPS contra a produção (Plano 5C, Task 7).
 * Autocontida (só `@playwright/test`), sem playwright.config do repo. A conta QA já passou pelo
 * onboarding (Plano 1); se a organização voltar ao onboarding, o laço de pular do Plano 1 é
 * reintroduzido antes de seguir.
 * Mede por getComputedStyle e grava cada medida em /work/out/medidas.jsonl.
 */
import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "";
const QA_EMAIL = process.env.QA_EMAIL ?? "";
const QA_SENHA = process.env.QA_SENHA ?? "";
const OUT = "/work/out";
const TEMAS = ["light", "dark"] as const;
type Tema = (typeof TEMAS)[number];

const ESPERADO: Record<Tema, { fundo: string; barra: string; acao: string }> = {
  light: { fundo: "rgb(251, 248, 242)", barra: "rgb(250, 246, 240)", acao: "rgb(106, 23, 48)" },
  dark: { fundo: "rgb(19, 17, 15)", barra: "rgb(29, 15, 18)", acao: "rgb(106, 23, 48)" },
};

test.use({ baseURL: BASE_URL });

const registrar = (l: Record<string, unknown>) => fs.appendFileSync(`${OUT}/medidas.jsonl`, `${JSON.stringify(l)}\n`);

async function aplicarTema(page: Page, tema: Tema) {
  await page.evaluate((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
}

async function medir(page: Page, tela: string, tema: Tema, largura: number) {
  const m = await page.evaluate(() => {
    const sonda = document.createElement("div");
    sonda.className = "bg-accent";
    document.body.appendChild(sonda);
    const acao = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    const barra = document.querySelector("aside");
    const editorial = document.querySelector(".font-display");
    const laterais = [...document.querySelectorAll("[data-fachada='fundo']")].map((e) => getComputedStyle(e).display);
    return {
      fundo: getComputedStyle(document.body).backgroundColor,
      corpo: getComputedStyle(document.body).fontFamily,
      barra: barra ? getComputedStyle(barra).backgroundColor : null,
      editorial: editorial ? getComputedStyle(editorial).fontFamily : null,
      acao,
      laterais,
    };
  });
  registrar({ tela, tema, largura, url: page.url(), ...m });
  expect.soft(m.fundo, `${tela}/${tema}/${largura}: fundo`).toBe(ESPERADO[tema].fundo);
  expect.soft(m.acao, `${tela}/${tema}/${largura}: ação`).toBe(ESPERADO[tema].acao);
  expect.soft(m.corpo, `${tela}/${tema}/${largura}: corpo Inter`).toMatch(/inter/i);
  return m;
}

async function foto(page: Page, tela: string, tema: Tema, largura: number) {
  await page.screenshot({ path: `${OUT}/5c-${tela}-${tema}-${largura}.png`, fullPage: true });
}

async function nosDoisTemas(page: Page, tela: string, largura: number, extra?: (m: Awaited<ReturnType<typeof medir>>, tema: Tema) => void) {
  for (const tema of TEMAS) {
    await aplicarTema(page, tema);
    const m = await medir(page, tela, tema, largura);
    extra?.(m, tema);
    await foto(page, tela, tema, largura);
  }
}

for (const largura of [1366, 400] as const) {
  test(`padrão visual do kit em ${largura}px`, async ({ page }) => {
    test.setTimeout(10 * 60_000);
    expect(BASE_URL && QA_EMAIL && QA_SENHA, "BASE_URL/QA_EMAIL/QA_SENHA").toBeTruthy();
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: largura, height: largura === 400 ? 860 : 900 });

    // 1. Telas de acesso sem sessão. /login/mfa exige sessão com dois fatores: fora da prova (declarado).
    for (const [rota, tela] of [["/login", "login"], ["/signup", "cadastro"], ["/login/forgot", "esqueci"], ["/login/reset", "redefinir"], ["/login/recovery", "recuperacao"]] as const) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      await nosDoisTemas(page, tela, largura, (m) => {
        expect.soft(m.editorial, `${tela}: título Playfair`).toMatch(/playfair/i);
        const visiveis = m.laterais.filter((d) => d !== "none").length;
        if (largura === 400) expect.soft(visiveis, `${tela}: laterais ocultas em 400px`).toBeLessThanOrEqual(1);
        else expect.soft(visiveis, `${tela}: laterais visíveis em 1366px`).toBeGreaterThanOrEqual(3);
      });
    }

    // 2. Login.
    await page.goto("/login");
    await page.locator("#email").fill(QA_EMAIL);
    await page.locator("#password").fill(QA_SENHA);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/app\//, { timeout: 60_000 });

    // 3. Telas do app.
    for (const [rota, tela] of [["/app/inbox", "inbox"], ["/app/kanban", "funis"], ["/app/products", "catalogo"], ["/app/settings", "configuracoes"]] as const) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      await nosDoisTemas(page, tela, largura, (m, tema) => {
        if (largura === 1366) expect.soft(m.barra, `${tela}/${tema}: barra lateral`).toBe(ESPERADO[tema].barra);
        if (tela === "inbox" && largura === 1366) expect.soft(m.editorial, "inbox: estado vazio Playfair").toMatch(/playfair/i);
      });
    }
  });
}
```

  (Em 1366 px a fachada tem 4 fundos `data-fachada` — 2 laterais e 2 véus —, e o véu claro some no escuro; por isso "≥ 3 visíveis". Em 400 px as laterais e o véu claro são `lg:block` e somem; resta o gradiente radial, por isso "≤ 1".)

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/e2e-cobertura-completa.test.ts` → exit 0 (a spec já está em `FORA_DO_CI`). Commit `test(bacco): evidência do padrão visual do kit` + trailer.

---

### Task 6: CI, release e imagens

- [ ] **Step 1:** `.changes/bacco-barra-e-inbox.md`:

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Barra lateral e inbox no visual do kit Bacco
---

A barra lateral ganha fundo próprio e item ativo em vinho; a inbox mostra um estado vazio com a
gravura do vinhedo e uma citação, e a conversa selecionada e os contadores das abas usam as cores
do kit. Nada muda no funcionamento.
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/fragmentos-de-release.test.ts` → exit 0; commit `chore(bacco): fragmento de release da barra e inbox` + trailer.
- [ ] **Step 3:** `git push --no-tags origin bacco:main`; aguardar `ci`, `perf`, `publish-image` do SHA (`gh api "repos/lussandro/bacco-adega-crm/actions/runs?head_sha=<sha>"`); ler `Test Files`/`Tests`/`Errors` do `verify`. Vermelho = causa raiz, commit próprio, novo push.
- [ ] **Step 4:** Com tudo verde: `git tag -a v26.9.2 -m "Bacco Adega CRM 26.9.2 — padrão visual do kit" <sha> && git push origin v26.9.2`; aguardar o `publish-image` da tag: `ghcr.io/lussandro/{deskcommcrm,deskcomm-worker,deskcomm-scheduler}:26.9.2`.

---

### Task 7: Atualizar a VPS e provar em tela

- [ ] **Step 1: Atualizar** — o mesmo comando do Plano 4 Task 7 Step 5, com `--to v26.9.2`:

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)" && SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" bash hostgator-setup-kit/update.sh --to v26.9.2 > /root/bacco-update-26.9.2.log 2>&1; echo "exit=$?"; tail -8 /root/bacco-update-26.9.2.log; curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | head -c 200; echo; curl -s -o /dev/null -w "fachada %{http_code} %{content_type}\n" https://adega-crm.baccosistemas.com.br/fachada/lateral-direita.webp'
```
  Expected: `exit=0`; `"version":"26.9.2"`; `fachada 200 image/webp`.

- [ ] **Step 2: Rodar a prova**

```bash
scp tests/e2e/bacco-evidencia.spec.ts root@2.25.222.110:/root/bacco-e2e/
ssh root@2.25.222.110 'set -a; . /root/.bacco_qa; set +a; cd /root/bacco-e2e && rm -f out/5c-*.png out/medidas.jsonl; docker run --rm --network host -e BASE_URL=https://adega-crm.baccosistemas.com.br -e QA_EMAIL -e QA_SENHA -v /root/bacco-e2e:/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test bacco-evidencia.spec.ts --reporter=list 2>&1 | grep -vE "npm notice" | tail -30'
scp 'root@2.25.222.110:/root/bacco-e2e/out/5c-*.png' root@2.25.222.110:/root/bacco-e2e/out/medidas.jsonl evidence/bacco-rebrand/
```
  Expected: `2 passed`; 36 PNG (9 telas × 2 temas × 2 larguras); cada `expect.soft` verde. Falha de medida = causa raiz no código, commit próprio, nova release `v26.9.3` — nunca afrouxar o esperado.

- [ ] **Step 3: Revisão** — `evidence/bacco-rebrand/5c-revisao.md`: cada PNG citado pelo caminho completo em crase, com o que foi visto e as medidas de `medidas.jsonl`; declarar `/login/mfa` fora da prova (exige sessão com dois fatores). `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0.
- [ ] **Step 4: Aprovação do dono** — mostrar as capturas. Pronto só com o ok dele (spec §4.2).
- [ ] **Step 5:** Commit `test(bacco): prova em tela do padrão visual na VPS` + trailer; `git push --no-tags origin bacco:main`.
- [ ] **Step 6: Vault** — gotchas duráveis em `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/CLAUDE.md` (ilustração em `<aside>` só por CSS por causa do `marca-logo.spec`; densidade da barra; imagens do kit recortadas de tela e o script que as trata). Atualizar `ultima_revisao`.

## Fora deste plano

- Painel do contato de vinícola (compras, clube, visitas, preferências) — funcionalidade com dados, spec própria.
- Cabeçalho "Conversas" com botão de nova conversa da referência: não existe fluxo de iniciar conversa pela lista hoje.
