# Bacco Adega CRM — Plano 5A: tokens do kit nos dois temas, régua e etiquetas (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v2 (2026-09-15):** revisado por refutador (Tasks 0–5 executadas em worktree) e `codex exec`. Correções: a
> exceção do fill no escuro vale **só para a paleta do produto** (decisão do dono — marca própria segue com o piso
> atual), uma declaração CSS por linha, ouro-texto claro `#855f00`, `branding-regua-do-produto.test.ts` na lista,
> bloco `[data-theme="light"]` sem rampa, codemod sem `cd`, raios do kit, `pnpm test:shell` e não-prova declarada.

**Goal:** Trocar a paleta de TODO o sistema pelos tokens do kit Bacco (claro e escuro), com o token `--color-accent-text` para texto/borda da ação, a exceção de contraste do fill escuro declarada só para o produto, e etiquetas com cor calculada.

**Architecture:** Tokens globais em `app/globals.css` (fonte única; o Tailwind 4 lê pela ponte `@theme inline`). A régua (`lib/branding/contraste.ts`) ganha UMA regra de extração: token `-text` é papel de TEXTO. A exceção do fill escuro NÃO entra na extração (senão toda marca própria perderia o piso): ela é uma política do produto (`PAPEIS_DE_FILL_NO_ESCURO`) aplicada no teste que mede a paleta do `globals.css`. Os usos de texto/borda migram para `accent-text` por codemod. Etiqueta = `Badge` + cor por hash do nome em 6 trilhas de token.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 (CSS-first), Vitest 4, TypeScript estrito, Node 22.

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-padrao-visual-design.md` (§5, §7). Planos irmãos: 5B (fachada de acesso), 5C (barra lateral, inbox, release e prova). Release única `v26.9.2` no fim do 5C.

## Global Constraints

- Branch `bacco`; sem push neste plano (o primeiro push, `git push --no-tags origin bacco:main`, é o do Plano 5C Task 6). Nada de tag neste plano.
- Todo comando roda na raiz do checkout onde o plano está sendo executado (nunca `cd` para outro caminho).
- Local só comando puro com `source ~/.nvm/nvm.sh && nvm use 22`: `pnpm exec vitest run <arquivos>`, `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`, `pnpm lint` (0 erros; avisos pré-existentes não contam), `pnpm exec tsx`, `pnpm test:shell`. Suíte inteira, `test:db`, build: CI.
- Resultado de teste: exit code; depois rodapé `Test Files`/`Tests`/`Errors`.
- Nenhum hex de token entra sem constar da tabela abaixo (medida por `docs/superpowers/plans/anexos/medir-tokens-kit.ts`). Texto ≥ 4,5:1; componente ≥ 3:1. A única exceção: fill da ação no escuro, **só na paleta do produto** (spec §5.3).
- CSS: **uma declaração por linha** (os leitores de `tailwind-tokens.test.ts` e `tokens-do-kit-bacco.test.ts` leem uma por linha).
- Régua Sage congelada (`tests/fixtures/branding/regua-sage.ts`) NÃO é regenerada; testes de algoritmo continuam nela.
- A marca (logotipo, favicon, `lib/branding/desenho.ts`, `components/branding/MarcaDoProduto.tsx`) continua `#4a0e1f`/`#c49a4a`/`#f5f0e6`. Só a AÇÃO muda para o vinho do kit.
- Texto novo em `t(...)` ganha `es` em `lib/i18n/dicionario.ts`.
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Não-prova declarada

Este plano muda tokens visíveis em TODO o produto e não prova a tela. A prova (Playwright na VPS, dois temas,
1366 px e 400 px, `getComputedStyle` de fundo, barra, ação e fontes) é a Task 7 do Plano 5C, depois da `v26.9.2`.
Até lá o status visual é **não validado**, mesmo com CI verde.

## Tabela de tokens (medida em 2026-09-15)

Rampa `rampaDeSemente("#6a1730")` — escrita em `:root` e em `[data-theme="dark"]` (o bloco `[data-theme="light"]`
**não** declara rampa, de propósito: `tests/unit/branding-tema-claro-escopavel.test.ts`):
`50 #fdf2f3 · 100 #f7dde1 · 200 #e7b7bf · 300 #ce8693 · 400 #b3596c · 500 #94344d · 600 #6a1730 · 700 #581a2a · 800 #4a1b26 · 900 #401b23 · 950 #2c1419`

| Token | `:root` e `[data-theme="light"]` | `[data-theme="dark"]` |
|---|---|---|
| `--color-bg` | `#fbf8f2` | `#13110f` |
| `--color-surface` | `#fffdf8` | `#1a1715` |
| `--color-surface-elevated` | `#f5f0e6` | `#211d1a` |
| `--color-text` | `#2e2a27` | `#f5f0e6` |
| `--color-text-muted` | `#6c645d` | `#a69c92` |
| `--color-text-subtle` | `#827e7a` (neutro 500) | `#87837d` (neutro 400) |
| `--color-border` | `#e8ded1` | `#332c27` |
| `--color-border-strong` | `#c9c5c0` (neutro 200) | `#3d3a37` (neutro 700) |
| `--color-accent` | `var(--color-accent-600)` | `var(--color-accent-600)` |
| `--color-accent-fg` | `#ffffff` | `#ffffff` |
| `--color-accent-hover` | `var(--color-accent-700)` (kit `#541025`; grau 700 a ΔE 0,022) | `var(--color-accent-500)` |
| `--color-accent-soft` | `var(--color-accent-100)` | `var(--color-accent-900)` |
| `--color-accent-text` (novo) | `var(--color-accent-600)` | `var(--color-accent-300)` |
| `--ring` | `var(--color-accent-500)` (sem mudança) | `var(--color-accent-400)` |
| `:focus-visible` outline | sem mudança | `var(--color-accent-400)` |
| `--color-success` / `-bg` / `-fg` | `#5a8a63` / `rgba(90, 138, 99, 0.12)` / `#406f4a` | `#719e76` / `rgba(113, 158, 118, 0.18)` / `#78a57d` |
| `--color-warning` / `-bg` / `-fg` | sem mudança | sem mudança |
| `--color-error` / `-bg` / `-fg` | `#a94452` / `rgba(169, 68, 82, 0.12)` / `#a5404f` | `#be5561` / `rgba(190, 85, 97, 0.18)` / `#de737c` |
| `--color-info` / `-bg` / `-fg` | sem mudança | sem mudança |
| `--color-gold` (novo) | `#c49a4a` | `#c49a4a` |
| `--color-gold-text` (novo) | `#855f00` (4,51 sobre a seleção) | `#c49a4a` |
| `--color-sidebar` (novo) | `#faf6f0` | `#1d0f12` |
| `--radius-sm` / `-md` / `-lg` / `-xl` (só `:root`) | `6px` / `10px` / `16px` / `22px` | — |

Neutros claro (`--color-neutral-*`, em `:root` e `[data-theme="light"]`): `50 #fbf8f2 · 100 #e2ded9 · 200 #c9c5c0 · 300 #b1ada8 · 400 #999590 · 500 #827e7a · 600 #6c6864 · 700 #56524e · 800 #423e3a · 900 #2e2a27 · 950 #1c1815`
Neutros escuro: `50 #f5f0e6 · 100 #d8d4cb · 200 #bdb8b0 · 300 #a19d96 · 400 #87837d · 500 #6d6a64 · 600 #55514d · 700 #3d3a37 · 800 #272522 · 900 #13110f · 950 #030302`

Etiquetas (`--color-etiqueta-N-bg` / `--color-etiqueta-N-fg`, todas ≥ 4,5:1 medidas):

| N | Nome | Claro bg / fg | Escuro bg / fg |
|---|---|---|---|
| 1 | lilás | `#f1e1f8` / `#785d85` | `#3c2c43` / `#aa91b5` |
| 2 | verde | `#daefda` / `#4d724e` | `#243924` / `#83a483` |
| 3 | azul | `#d7eaff` / `#486b8e` | `#213549` / `#7f9fc0` |
| 4 | bege | `#f8e4cf` / `#83623a` | `#422f18` / `#b49573` |
| 5 | rosa | `#fedfe5` / `#8d5965` | `#462930` / `#bc8c96` |
| 6 | ouro | `#f1e7ce` / `#776636` | `#3c3216` / `#aa9a71` |

Régua do produto esperada (medida): **claro** 7 papéis, 4 superfícies, 22 pares, 0 reprovas; **escuro** 7 papéis,
4 superfícies, 22 pares, **8 reprovas — todas de `--color-accent`/`--color-accent-hover` contra as 4 superfícies**
(a exceção do produto); índices escuro `{accent: 6, hover: 5, soft: 9}`, `alfaDoSoft` 1; `neutros[9]` claro
`#2e2a27`, escuro `#13110f`; anel de foco escuro índice 4.

---

### Task 0: Conferir a base

- [ ] **Step 1:** `git status -sb && git log --oneline -1` — árvore limpa; a spec `docs/superpowers/specs/2026-09-15-bacco-padrao-visual-design.md` existe.
- [ ] **Step 2:** `pnpm exec tsx docs/superpowers/plans/anexos/medir-tokens-kit.ts` — rampa e neutros batem com a tabela. (O anexo simula também a remoção do fill no escuro; os números de régua deste plano v2 são os "antes da exceção" + papel `-text`: escuro 22 pares, 8 reprovas.)

---

### Task 1: Régua — papel `-text` e política do fill escuro do produto

**Files:**
- Modify: `lib/branding/contraste.ts` (função `montarTema`; constante nova acima dela)
- Test: `tests/unit/branding-regua-papeis-do-kit.test.ts` (novo)

**Interfaces:**
- Produces: `export const PAPEIS_DE_FILL_NO_ESCURO = ["--color-accent", "--color-accent-hover"] as const;` (política do produto, **não usada pela extração**). `extrairRegua` devolve papel `tipo: "texto"`, `contra: null` para token terminado em `-text` com fonte `grau`.

- [ ] **Step 1: Teste que falha** — `tests/unit/branding-regua-papeis-do-kit.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAPEIS_DE_FILL_NO_ESCURO, extrairRegua } from "@/lib/branding/contraste";

/**
 * Spec 2026-09-15-bacco-padrao-visual-design §5.3, lido do `app/globals.css` real.
 *  - token `-text` que aponta para a rampa é papel de TEXTO (piso 4,5) contra todas as superfícies;
 *  - a exceção do fill escuro é POLÍTICA DO PRODUTO: a extração continua medindo o fill como
 *    componente nos dois temas, para que marca própria (que usa esta mesma régua na derivação)
 *    mantenha o piso. Decisão do dono, 2026-09-15.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("régua — papéis do kit Bacco", () => {
  it("declara quais tokens são fill no escuro (política do produto)", () => {
    expect([...PAPEIS_DE_FILL_NO_ESCURO]).toEqual(["--color-accent", "--color-accent-hover"]);
  });

  it("--color-accent-text é papel de TEXTO nos dois temas", () => {
    const r = extrairRegua(CSS);
    for (const tema of [r.claro, r.escuro]) {
      const p = tema.papeis.find((x) => x.token === "--color-accent-text");
      expect(p, `${tema.nome}: --color-accent-text fora da régua`).toBeDefined();
      expect(p?.tipo).toBe("texto");
      expect(p?.contra).toBeNull();
    }
  });

  it("a extração NÃO remove o fill: marca própria continua com o piso de componente", () => {
    const r = extrairRegua(CSS);
    for (const tema of [r.claro, r.escuro]) {
      for (const t of PAPEIS_DE_FILL_NO_ESCURO) {
        expect(tema.papeis.find((p) => p.token === t)?.tipo, `${tema.nome}/${t}`).toBe("componente");
      }
    }
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/branding-regua-papeis-do-kit.test.ts` → FAIL (`PAPEIS_DE_FILL_NO_ESCURO` não exportado).

- [ ] **Step 3: Implementar** — em `lib/branding/contraste.ts`, logo acima de `function montarTema(`:

```ts
/**
 * Spec Bacco §5.3 — POLÍTICA DO PRODUTO, não regra de extração. No tema ESCURO a ação principal
 * do kit é um vinho profundo que mede ~1,6:1 contra as superfícies, de propósito (decisão do dono,
 * 2026-09-15). O botão é identificado pelo texto (`--color-accent-fg`, medido a 4,5) e o foco pelo
 * anel (medido a 3,0). A extração continua medindo estes tokens como componente: a mesma régua
 * deriva a marca própria das organizações, e ela NÃO herda a exceção. Quem aplica a exceção é o
 * teste que mede a paleta do `globals.css` (`tests/unit/tokens-do-kit-bacco.test.ts`).
 */
export const PAPEIS_DE_FILL_NO_ESCURO = ["--color-accent", "--color-accent-hover"] as const;
```

  e, dentro do laço `for (const d of decls)` de `montarTema`, substituir

```ts
    if (fonte.tipo === "grau") {
      papeis.push({ token: d.prop, tipo: "componente", fonte, contra: null });
    }
```

  por

```ts
    if (fonte.tipo === "grau") {
      // `-text` é a ação usada como TEXTO/borda (`text-accent-text`): mede como texto.
      const tipo = d.prop.endsWith("-text") ? "texto" : "componente";
      papeis.push({ token: d.prop, tipo, fonte, contra: null });
    }
```

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/branding-regua-papeis-do-kit.test.ts` → "1 failed | 2 passed" (o `it` do `-text` só fecha com o CSS da Task 2). Sem commit: a Task 2 fecha junto.

---

### Task 2: Tokens do kit no `globals.css` e testes de produto

**Files:**
- Modify: `app/globals.css` — `:root` (~34), `[data-theme="light"]` (~254), `[data-theme="dark"]` (~331), `@theme inline` (~459), regra `[data-theme="dark"] :focus-visible` (~737), cabeçalho (~28), comentário do hover claro (~65)
- Modify (gerado): `lib/branding/regua-do-produto.ts`
- Modify: `tests/unit/branding-contraste.test.ts`, `tests/unit/branding-rampa.test.ts`, `tests/unit/branding-pares-pintados.test.ts`, `tests/unit/branding-regua-do-produto.test.ts`
- Test: `tests/unit/tokens-do-kit-bacco.test.ts` (novo)

**Interfaces:**
- Consumes: Task 1.
- Produces: utilitários `text-accent-text`, `border-accent-text`, `ring-accent-text`, `outline-accent-text`, `bg-sidebar`, `bg-gold`, `border-gold`, `text-gold-text`, `bg-etiqueta-N-bg`, `text-etiqueta-N-fg` (N = 1..6); raios do kit em `rounded-sm/md/lg/xl`.

- [ ] **Step 1: Teste que falha** — `tests/unit/tokens-do-kit-bacco.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAPEIS_DE_FILL_NO_ESCURO, extrairRegua, medirPares, razaoDeContraste } from "@/lib/branding/contraste";
import { compor } from "@/lib/branding/rampa";

/**
 * Os tokens do kit Bacco, medidos no próprio globals.css (spec 2026-09-15 §5.1). Os tons de texto
 * foram ajustados para passar 4,5:1 inclusive sobre a seleção e o fundo translúcido das badges.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function bloco(seletor: string): Record<string, string> {
  const i = CSS.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`bloco ${seletor} ausente`);
  const a = CSS.indexOf("{", i);
  let d = 0;
  let j = a;
  for (; j < CSS.length; j++) {
    if (CSS[j] === "{") d++;
    else if (CSS[j] === "}" && --d === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of CSS.slice(a + 1, j).matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    if (m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

const RAIZ = bloco(":root");
const ESCURO = bloco('[data-theme="dark"]');

function resolve(b: Record<string, string>, valor: string): string {
  const ref = valor.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!ref?.[1]) return valor;
  return resolve(b, b[ref[1]] ?? RAIZ[ref[1]] ?? "");
}
const tok = (b: Record<string, string>, k: string) => resolve(b, b[k] ?? RAIZ[k] ?? "");
function rgba(v: string): { hex: string; alfa: number } {
  const m = v.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
  if (!m) throw new Error(`não é rgba: ${v}`);
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
  return { hex, alfa: Number(m[4]) };
}

const TEMAS = [
  { nome: "claro", b: RAIZ },
  { nome: "escuro", b: ESCURO },
] as const;

const fundos = (b: Record<string, string>) =>
  ["--color-bg", "--color-surface", "--color-surface-elevated", "--color-sidebar", "--color-accent-soft"].map((k) => tok(b, k));

describe("tokens do kit Bacco", () => {
  it("fundos, ação e raios são os do kit", () => {
    expect([tok(RAIZ, "--color-bg"), tok(RAIZ, "--color-surface"), tok(RAIZ, "--color-surface-elevated")]).toEqual(["#fbf8f2", "#fffdf8", "#f5f0e6"]);
    expect([tok(ESCURO, "--color-bg"), tok(ESCURO, "--color-surface"), tok(ESCURO, "--color-surface-elevated")]).toEqual(["#13110f", "#1a1715", "#211d1a"]);
    expect(tok(RAIZ, "--color-accent")).toBe("#6a1730");
    expect(tok(ESCURO, "--color-accent")).toBe("#6a1730");
    expect(["--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"].map((k) => RAIZ[k])).toEqual(["6px", "10px", "16px", "22px"]);
  });

  for (const { nome, b } of TEMAS) {
    it(`${nome}: todo token de texto passa 4,5 em fundo, superfícies, barra lateral e seleção`, () => {
      for (const k of ["--color-text", "--color-text-muted", "--color-accent-text", "--color-gold-text"]) {
        const piores = fundos(b).map((f) => razaoDeContraste(tok(b, k), f));
        expect(Math.min(...piores), `${k} = ${tok(b, k)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${nome}: texto das badges semânticas passa 4,5 sobre o fundo translúcido composto`, () => {
      for (const s of ["success", "warning", "error", "info"]) {
        const { hex, alfa } = rgba(tok(b, `--color-${s}-bg`));
        const base = ["--color-bg", "--color-surface", "--color-surface-elevated", "--color-sidebar"].map((k) => compor(hex, alfa, tok(b, k)));
        const pior = Math.min(...base.map((f) => razaoDeContraste(tok(b, `--color-${s}-fg`), f)));
        expect(pior, `--color-${s}-fg`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${nome}: texto do fill e do botão de perigo passa 4,5`, () => {
      expect(razaoDeContraste(tok(b, "--color-accent-fg"), tok(b, "--color-accent"))).toBeGreaterThanOrEqual(4.5);
      expect(razaoDeContraste("#ffffff", tok(b, "--color-error"))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${nome}: as 6 etiquetas passam 4,5`, () => {
      for (let n = 1; n <= 6; n++) {
        expect(
          razaoDeContraste(tok(b, `--color-etiqueta-${n}-fg`), tok(b, `--color-etiqueta-${n}-bg`)),
          `etiqueta ${n}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("exceção do produto: no escuro só o fill da ação reprova, e texto do fill e anel passam", () => {
    const r = extrairRegua(CSS);
    expect(medirPares(r.claro, r.rampaDoProduto, 0).filter((p) => !p.passa)).toEqual([]);
    const reprovasEscuro = medirPares(r.escuro, r.rampaDoProduto, 0).filter((p) => !p.passa);
    expect(reprovasEscuro.length, "o fill contra as 4 superfícies").toBe(8);
    for (const p of reprovasEscuro) {
      expect(PAPEIS_DE_FILL_NO_ESCURO as readonly string[], `${p.papel}×${p.superficie}`).toContain(p.papel);
    }
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/tokens-do-kit-bacco.test.ts` → FAIL (valores atuais).

- [ ] **Step 3: `app/globals.css`** — aplicar a **Tabela de tokens** (uma declaração por linha em todo lugar):
  - `:root`: rampa (11 linhas `--color-accent-NNN`), neutros claro (11), `--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-border`, `--color-border-strong`, `--color-accent-hover: var(--color-accent-700);` (e trocar o comentário logo acima — "Hover CLAREIA…" — por `/* Hover escurece um grau (700): o kit dá #541025, a 0,022 de ΔE do grau 700. */`), success e error (`-bg`, `-fg`), `--radius-sm: 6px;`, `--radius-md: 10px;`, `--radius-lg: 16px;`, `--radius-xl: 22px;`, e, logo depois de `--color-accent-hover`, estas linhas:

```css
  --color-accent-text: var(--color-accent-600);
  --color-gold: #c49a4a;
  --color-gold-text: #855f00;
  --color-sidebar: #faf6f0;
  --color-etiqueta-1-bg: #f1e1f8;
  --color-etiqueta-1-fg: #785d85;
  --color-etiqueta-2-bg: #daefda;
  --color-etiqueta-2-fg: #4d724e;
  --color-etiqueta-3-bg: #d7eaff;
  --color-etiqueta-3-fg: #486b8e;
  --color-etiqueta-4-bg: #f8e4cf;
  --color-etiqueta-4-fg: #83623a;
  --color-etiqueta-5-bg: #fedfe5;
  --color-etiqueta-5-fg: #8d5965;
  --color-etiqueta-6-bg: #f1e7ce;
  --color-etiqueta-6-fg: #776636;
```

  - `[data-theme="light"]`: os MESMOS valores do `:root` para neutros, bases, texto, borda, hover, success, error e as 16 linhas acima — **sem rampa** (o bloco não declara `--color-accent-NNN`) e sem raios.
  - `[data-theme="dark"]`: rampa, neutros escuro, bases, texto, borda, `--color-accent: var(--color-accent-600);`, `--color-accent-fg: #ffffff;`, `--color-accent-soft: var(--color-accent-900);`, `--color-accent-hover: var(--color-accent-500);`, `--ring: var(--color-accent-400);`, success/error, e:

```css
  --color-accent-text: var(--color-accent-300);
  --color-gold: #c49a4a;
  --color-gold-text: #c49a4a;
  --color-sidebar: #1d0f12;
  --color-etiqueta-1-bg: #3c2c43;
  --color-etiqueta-1-fg: #aa91b5;
  --color-etiqueta-2-bg: #243924;
  --color-etiqueta-2-fg: #83a483;
  --color-etiqueta-3-bg: #213549;
  --color-etiqueta-3-fg: #7f9fc0;
  --color-etiqueta-4-bg: #422f18;
  --color-etiqueta-4-fg: #b49573;
  --color-etiqueta-5-bg: #462930;
  --color-etiqueta-5-fg: #bc8c96;
  --color-etiqueta-6-bg: #3c3216;
  --color-etiqueta-6-fg: #aa9a71;
```

  - Regra `[data-theme="dark"] :focus-visible`: `outline-color: var(--color-accent-400);`
  - Comentários: bloco de rampa → `Accent — vinho do kit Bacco (rampaDeSemente("#6a1730"), 11 stops)`; no escuro, o comentário do grau 300 → `Fill vinho profundo (grau 600) abaixo de 3:1 contra as superfícies — exceção do PRODUTO (PAPEIS_DE_FILL_NO_ESCURO, spec §5.3); texto e borda da ação usam --color-accent-text (grau 300).`
  - Cabeçalho (~28): `Bacco Adega CRM — Design System tokens (kit Bacco v2 · density Aerada)` e `Tokens: docs/brand/bacco/kit-v2/ui/tokens/ · medição: docs/superpowers/plans/anexos/medir-tokens-kit.ts`.
  - `@theme inline`, logo depois de `--color-accent-hover: var(--color-accent-hover);`, uma por linha:

```css
  --color-accent-text: var(--color-accent-text);
  --color-gold: var(--color-gold);
  --color-gold-text: var(--color-gold-text);
  --color-sidebar: var(--color-sidebar);
  --color-etiqueta-1-bg: var(--color-etiqueta-1-bg);
  --color-etiqueta-1-fg: var(--color-etiqueta-1-fg);
  --color-etiqueta-2-bg: var(--color-etiqueta-2-bg);
  --color-etiqueta-2-fg: var(--color-etiqueta-2-fg);
  --color-etiqueta-3-bg: var(--color-etiqueta-3-bg);
  --color-etiqueta-3-fg: var(--color-etiqueta-3-fg);
  --color-etiqueta-4-bg: var(--color-etiqueta-4-bg);
  --color-etiqueta-4-fg: var(--color-etiqueta-4-fg);
  --color-etiqueta-5-bg: var(--color-etiqueta-5-bg);
  --color-etiqueta-5-fg: var(--color-etiqueta-5-fg);
  --color-etiqueta-6-bg: var(--color-etiqueta-6-bg);
  --color-etiqueta-6-fg: var(--color-etiqueta-6-fg);
```

- [ ] **Step 4: Regenerar a régua** — `pnpm exec vitest run tests/unit/branding-regua-do-produto.test.ts > /tmp/regua.log 2>&1`; colar o objeto impresso depois de `Substitua o objeto de lib/branding/regua-do-produto.ts por:` como valor de `REGUA_DO_PRODUTO`, **mantendo `} as const;`**; rodar de novo.

- [ ] **Step 5: Testes de produto que mudam de número** (Sage não muda):
  - `tests/unit/branding-regua-do-produto.test.ts:36-37`: `claro.papeis` e `escuro.papeis` → `toHaveLength(7)` (papel `--color-accent-text`).
  - `tests/unit/branding-contraste.test.ts`, `describe("extrairRegua — …")`:
    - `it("acha os dois temas…")`: `rampaDoProduto[6]` → `"#6a1730"`; `escuro.neutros[9]` → `"#13110f"`.
    - `it("alcança o anel de foco…")`: `focoEscuro` → `{ tipo: "grau", indice: 4 }` (comentário: grau 400 do vinho do kit, 3,63 no pior fundo).
    - `it("classifica -fg como texto e -soft como superfície")`: `escuro.indices.soft` → `9`; `escuro.alfaDoSoft` → `1` (comentário: no kit o soft do escuro é o grau 900, opaco).
    - `it("enumera o conjunto esperado de papéis e pares")`: lista do claro ganha `"--color-accent-text"` (ordem do `sort()`); `escuro.papeis` → `toHaveLength(7)`; `superficiesDoTema(escuro)` → `toHaveLength(4)` (soft opaco compõe uma superfície); `medirPares(claro)` → `22`; `medirPares(escuro)` → `22`.
    - `it("a paleta do produto, como está no CSS, cabe nos pisos")`: no escuro, filtrar as reprovas cujo `papel` está em `PAPEIS_DE_FILL_NO_ESCURO` antes do `toEqual([])` (importar a constante), com o comentário "exceção do PRODUTO, spec §5.3 — a marca própria não herda".
  - `tests/unit/branding-rampa.test.ts`, `describe("rampaDeSemente — catraca…")`: `esperados[K]` → `"#6a1730"`; título `"reproduz os 11 stops do produto (vinho do kit Bacco) a partir de #6a1730 …"` e `rampaDeSemente("#6a1730")`.
  - `tests/unit/branding-pares-pintados.test.ts`, `describe("a marca do produto, sem instalação configurada")`: o `it` deixa de passar a cor pelo `resolverMarca` (isso seria tratá-la como marca própria, que NÃO herda a exceção) e passa a medir a paleta do CSS diretamente:

```ts
  it("o vinho do kit, direto do globals.css, só reprova no fill escuro (exceção do produto)", () => {
    // Sem instalação configurada não há bloco emitido: a tela é o globals.css. Medir via
    // resolverMarca trataria o vinho como marca própria — que mantém o piso (spec §5.3).
    for (const nome of ["claro", "escuro"] as const) {
      const pares = medirPares(REGUA_DO_PRODUTO[nome], REGUA_DO_PRODUTO.rampaDoProduto, 0);
      const fora = pares.filter((p) => !p.passa && !(nome === "escuro" && (PAPEIS_DE_FILL_NO_ESCURO as readonly string[]).includes(p.papel)));
      expect(fora, nome).toEqual([]);
    }
  });
```

    com `import { PAPEIS_DE_FILL_NO_ESCURO, medirPares } from "@/lib/branding/contraste";` (acrescentar ao import existente) e removendo o import de `resolverMarca`/`camadaDoAmbiente` só se deixar de ser usado no arquivo (conferir com `grep -n "resolverMarca" tests/unit/branding-pares-pintados.test.ts`).

- [ ] **Step 6: Família**

```bash
pnpm exec vitest run tests/unit/branding-*.test.ts tests/unit/tokens-do-kit-bacco.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/marca-do-produto.test.tsx tests/unit/branding-fallback-alcancavel.test.ts lib/branding lib/email > /tmp/vt-5a-t2.log 2>&1; echo "exit=$?"
grep -aE "^ *(Test Files|Tests|Errors) " /tmp/vt-5a-t2.log
```
  Expected: exit 0, sem `Errors`. `branding-fallback-alcancavel.test.ts` tem de passar **sem edição** (prova de que a marca própria manteve o piso). Falha em `it` que lê `REGUA_SAGE` = parar.

- [ ] **Step 7:** `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0, 0 erros.

- [ ] **Step 8: Commit**

```bash
git add lib/branding/contraste.ts lib/branding/regua-do-produto.ts app/globals.css tests/unit/branding-regua-papeis-do-kit.test.ts tests/unit/tokens-do-kit-bacco.test.ts tests/unit/branding-contraste.test.ts tests/unit/branding-rampa.test.ts tests/unit/branding-pares-pintados.test.ts tests/unit/branding-regua-do-produto.test.ts
git commit -m "feat(bacco): tokens do kit nos dois temas e exceção do fill escuro só no produto

Rampa rampaDeSemente(#6a1730), neutros quentes, raios do kit, texto e
badges ajustados para 4,5:1 inclusive sobre seleção e fundo translúcido.
Na régua, token -text é papel de texto. O fill vinho do escuro abaixo de
3:1 é exceção DO PRODUTO (PAPEIS_DE_FILL_NO_ESCURO), aplicada no teste da
paleta; a marca própria segue com o piso (decisão do dono).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Texto e borda da ação usam `accent-text`

**Files:**
- Modify: os arquivos que o teste-guarda do Step 1 lista (inventário de 2026-09-15: `text-accent` 36 em 28 arquivos, `border-accent` 21 em 14, `ring-accent` 4 em 3, `outline-accent` 2 em 2)
- Modify: `tests/capture-wave-3-cenarios.ts:83`
- Test: `tests/unit/acao-como-texto-usa-accent-text.test.ts` (novo)

- [ ] **Step 1: Teste-guarda que falha** — `tests/unit/acao-como-texto-usa-accent-text.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec Bacco §5.3: no escuro `--color-accent` é FILL vinho profundo (1,6:1 como texto).
 * Texto, borda, anel e outline da ação usam `--color-accent-text`. A exceção medida é a
 * borda que acompanha um fill sólido (`border-accent` junto de `bg-accent ` na mesma linha).
 */
const RAIZ = process.cwd();
const PASTAS = ["app", "components", "hooks", "lib"];
const PROIBIDO = /(?:^|[\s"'`:])(?:hover:|focus-visible:|active\]:|group-hover:)?(text|border|ring|outline)-accent(?![-\w])/;

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(p);
    return /\.(tsx?|ts)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("a ação como texto/borda usa accent-text", () => {
  it("nenhum text/border/ring/outline-accent solto fora da borda de fill sólido", () => {
    const culpados: string[] = [];
    for (const pasta of PASTAS) {
      for (const f of arquivos(path.join(RAIZ, pasta))) {
        fs.readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
          if (!PROIBIDO.test(linha)) return;
          const fillSolido = /\bborder-accent\b/.test(linha) && /\bbg-accent\s/.test(linha) && !/\b(text|ring|outline)-accent(?![-\w])/.test(linha);
          if (!fillSolido) culpados.push(`${path.relative(RAIZ, f)}:${i + 1}`);
        });
      }
    }
    expect(culpados).toEqual([]);
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/acao-como-texto-usa-accent-text.test.ts` → FAIL (medido pelo refutador: 54 linhas, 63 ocorrências).

- [ ] **Step 3: Codemod**, na raiz do checkout onde o plano roda (preserva as duas bordas de fill sólido: `components/inbox/InboxFilters.tsx` na linha `"border-accent bg-accent text-accent-foreground"` e `components/agenda/PainelDeMarcacao.tsx` na linha `"border-accent bg-accent font-semibold text-accent-foreground"`):

```bash
python3 - <<'PY'
import re, pathlib
PASTAS = ["app", "components", "hooks", "lib"]
padrao = re.compile(r"(?<![\w-])((?:hover:|focus-visible:|active\]:|group-hover:)?(?:text|border|ring|outline))-accent(?![-\w])")
total = 0
for pasta in PASTAS:
    for f in pathlib.Path(pasta).rglob("*.ts*"):
        if ".test." in f.name or "node_modules" in f.parts: continue
        linhas = f.read_text(encoding="utf-8").split("\n"); mudou = False
        for i, l in enumerate(linhas):
            if not padrao.search(l): continue
            if re.search(r"\bborder-accent\b", l) and re.search(r"\bbg-accent\s", l) and not re.search(r"\b(text|ring|outline)-accent(?![-\w])", l):
                continue
            novo, n = padrao.subn(r"\1-accent-text", l)
            if n: linhas[i] = novo; total += n; mudou = True
        if mudou: f.write_text("\n".join(linhas), encoding="utf-8")
print("trocas:", total)
PY
```
  Expected: `trocas: 61` (medido pelo refutador). Número diferente = parar e listar com `git diff --stat`.

- [ ] **Step 4:** `tests/capture-wave-3-cenarios.ts:83`: `[class*='border-accent']` → `[class*='border-accent-text']`.
- [ ] **Step 5:** `pnpm exec vitest run tests/unit/acao-como-texto-usa-accent-text.test.ts tests/unit/tailwind-tokens.test.ts && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 6: Commit** — `git add -A app components hooks lib tests/unit/acao-como-texto-usa-accent-text.test.ts tests/capture-wave-3-cenarios.ts`; mensagem `refactor(bacco): texto e borda da ação usam accent-text`, corpo "No escuro o fill da ação é vinho profundo; texto, borda, anel e outline passam a --color-accent-text (spec §5.3). Guarda em tests/unit/acao-como-texto-usa-accent-text.test.ts." + trailer.

---

### Task 4: Etiqueta com cor calculada pelo nome

**Files:**
- Create: `lib/etiquetas/cor.ts`, `lib/etiquetas/cor.test.ts`, `components/ui/etiqueta.tsx`
- Modify: `components/inbox/ConversationListItem.tsx`, `components/inbox/CRMSidePanel.tsx`, `components/inbox/ContactTagsEditor.tsx`, `components/inbox/ConversationTagsEditor.tsx`, `app/app/contacts/[id]/_client.tsx`, `components/contacts/ContactsTable.tsx`

**Interfaces:**
- Consumes: tokens `--color-etiqueta-N-bg/-fg` (Task 2).
- Produces: `export type TrilhaDeEtiqueta = 1 | 2 | 3 | 4 | 5 | 6;` `export function trilhaDaEtiqueta(nome: string): TrilhaDeEtiqueta;` `export function Etiqueta(props: { nome: string; className?: string; children?: React.ReactNode })`.

- [ ] **Step 1: Teste que falha** — `lib/etiquetas/cor.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { trilhaDaEtiqueta } from "./cor";

describe("trilhaDaEtiqueta — a mesma tag tem a mesma cor em qualquer tela", () => {
  it("é determinística e fica em 1..6", () => {
    for (const nome of ["Cliente", "Lead", "Distribuidor", "Clube Reserva", "Enoturismo", "VIP", "x"]) {
      const t = trilhaDaEtiqueta(nome);
      expect(t).toBe(trilhaDaEtiqueta(nome));
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(6);
    }
  });

  it("ignora caixa, espaços nas pontas e acento — é a mesma etiqueta", () => {
    expect(trilhaDaEtiqueta("  Pós-visita ")).toBe(trilhaDaEtiqueta("pos-visita"));
    expect(trilhaDaEtiqueta("ENOTURISMO")).toBe(trilhaDaEtiqueta("enoturismo"));
  });

  it("nome vazio não quebra", () => {
    expect(trilhaDaEtiqueta("")).toBe(1);
  });

  it("espalha: os 11 nomes do guia do kit usam ao menos 4 trilhas", () => {
    // Medido em 2026-09-15 com FNV-1a: {1, 4, 5, 6}. Trocar a lista de nomes exige remedir.
    const guia = ["Cliente", "Lead", "Distribuidor", "Comercial", "Clube Reserva", "Enoturismo", "Pós-visita", "Tasting", "On-trade", "Sommelier", "VIP"];
    expect(new Set(guia.map(trilhaDaEtiqueta)).size).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run lib/etiquetas/cor.test.ts` → FAIL (módulo ausente).
- [ ] **Step 3:** `lib/etiquetas/cor.ts`:

```ts
/**
 * A cor de uma etiqueta é CALCULADA do nome (DIRC: Calcular) — sem coluna nova e sem
 * cadastro. Mesmo nome normalizado → mesma trilha → mesmos tokens
 * `--color-etiqueta-N-bg/-fg` (app/globals.css, medidos a 4,5:1 nos dois temas).
 * FNV-1a 32 bits: estável entre execuções e plataformas, sem dependência.
 */
export type TrilhaDeEtiqueta = 1 | 2 | 3 | 4 | 5 | 6;

export function trilhaDaEtiqueta(nome: string): TrilhaDeEtiqueta {
  const chave = nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (!chave) return 1;
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h % 6) + 1) as TrilhaDeEtiqueta;
}
```

- [ ] **Step 4:** `pnpm exec vitest run lib/etiquetas/cor.test.ts` → PASS (4/4, medido).
- [ ] **Step 5:** `components/ui/etiqueta.tsx`:

```tsx
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { trilhaDaEtiqueta, type TrilhaDeEtiqueta } from "@/lib/etiquetas/cor";
import { cn } from "@/lib/utils";

// Classes LITERAIS: o Tailwind só gera utilitário para o que aparece escrito no fonte.
const CLASSES: Record<TrilhaDeEtiqueta, string> = {
  1: "bg-etiqueta-1-bg text-etiqueta-1-fg",
  2: "bg-etiqueta-2-bg text-etiqueta-2-fg",
  3: "bg-etiqueta-3-bg text-etiqueta-3-fg",
  4: "bg-etiqueta-4-bg text-etiqueta-4-fg",
  5: "bg-etiqueta-5-bg text-etiqueta-5-fg",
  6: "bg-etiqueta-6-bg text-etiqueta-6-fg",
};

/** Tag de contato/conversa com a cor da trilha calculada pelo nome. */
export function Etiqueta({ nome, className, children }: { nome: string; className?: string; children?: ReactNode }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", CLASSES[trilhaDaEtiqueta(nome)], className)}>
      {nome}
      {children}
    </Badge>
  );
}
```

- [ ] **Step 6: Aplicar nos seis lugares** (troca literal; conferir o import de `Badge` com `grep -n "<Badge" <arquivo>` — sai onde deixar de ser usado):
  - `components/inbox/ConversationListItem.tsx` (dentro de `visibleTags.map`): `<Badge key={t} variant="secondary" className="h-4 px-1.5 text-[10px]">{t}</Badge>` → `<Etiqueta key={t} nome={t} className="h-4 px-1.5 text-[10px]" />`; import `import { Etiqueta } from "@/components/ui/etiqueta";`.
  - `components/inbox/CRMSidePanel.tsx` (`tags.map((t) => …)`): mesma troca.
  - `components/inbox/ContactTagsEditor.tsx` e `components/inbox/ConversationTagsEditor.tsx`: `<Badge key={tag} variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">{tag}<button …/></Badge>` → `<Etiqueta key={tag} nome={tag} className="h-5 gap-1 px-1.5 text-[10px]"><button …/></Etiqueta>` (o `<button>` de remover fica igual; o import de `Badge` sai).
  - `app/app/contacts/[id]/_client.tsx` (duas vezes `contact.tags.map((t) => <Badge key={t} variant="neutral">{t}</Badge>)`) → `<Etiqueta key={t} nome={t} />`.
  - `components/contacts/ContactsTable.tsx`: `<Badge key={tag} variant="neutral">{tag}</Badge>` → `<Etiqueta key={tag} nome={tag} />`.
- [ ] **Step 7:** `pnpm exec vitest run lib/etiquetas tests/unit/tailwind-tokens.test.ts components/inbox && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 8: Commit** — `feat(bacco): etiqueta com cor calculada pelo nome` + trailer.

---

### Task 5: Saídas fora do CSS e entrega ao CI

**Files:**
- Modify: `supabase/templates/confirmation.html:27`, `supabase/templates/recovery.html:22`, `hostgator-setup-kit/marca-emails.sh:115,140`, `hostgator-setup-kit/test-validators.sh:1028`, `lib/branding/saida.ts:79-81`, `lib/branding/rampa.ts:13`, `lib/env.ts:339`, `.env.example:329`
- Create: `.changes/bacco-padrao-visual-tokens.md`

- [ ] **Step 1:** `#4a0e1f` → `#6a1730` em: `confirmation.html` e `recovery.html` (`background: #4a0e1f; background: __ACCENT__;`), `marca-emails.sh:140` (`*) ACCENT="#6a1730";;`) e comentário `:115` ("grau 600 da rampa do vinho do kit"), `test-validators.sh:1028` (`'background: #6a1730; background: #6a1730'`), comentários/exemplos de `saida.ts`, `rampa.ts:13`, `lib/env.ts:339`, `.env.example:329`. `ACCENT_DO_PRODUTO` (`saida.ts`) lê a régua e já vira `#6a1730`. `lib/branding/desenho.ts` e `components/branding/MarcaDoProduto.tsx` **não** mudam (são a marca).
- [ ] **Step 2:** `bash -n hostgator-setup-kit/marca-emails.sh hostgator-setup-kit/test-validators.sh && pnpm test:shell && pnpm exec vitest run tests/unit/branding.test.ts tests/unit/branding-saida.test.ts lib/email` → exit 0 (`test:shell` é o gate do kit, doutrina de packaging).
- [ ] **Step 3:** `.changes/bacco-padrao-visual-tokens.md`:

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Cores do kit Bacco em todas as telas, claro e escuro
---

Todas as telas passam a usar o padrão de cores do kit Bacco: fundos quentes, ação principal
em vinho, ouro nos detalhes e etiquetas coloridas por nome. No tema escuro o botão principal é
vinho profundo com texto claro. Instalação existente não precisa fazer nada; marca própria
configurada em Configurações › Marca continua valendo, com o contraste de sempre.
```

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/fragmentos-de-release.test.ts` → exit 0.
- [ ] **Step 5: Commit** — `chore(bacco): saídas de e-mail e kit no vinho do kit, e fragmento de release` + trailer.
- [ ] **Step 6: Sem push aqui** — o primeiro push destes commits é o do Plano 5C, Task 6 Step 3. Motivo: `tests/unit/evidencia-citada.test.ts` varre todo `*.md` versionado e reprova documento que cita PNG não versionado; os planos 5B e 5C, já na árvore, citam `evidence/bacco-rebrand/5b-lateral-esquerda.png`, `evidence/bacco-rebrand/5b-lateral-direita.png` e `evidence/bacco-rebrand/5c-ilustracoes.png`, que só passam a existir nas Tasks 1 do 5B e do 5C. Um push agora deixaria o `verify` vermelho por arquivo que ainda não tinha como existir. Local, a prova deste plano é a dos Steps 2 e 4 e das Tasks anteriores; o CI inteiro roda uma vez só, no push do 5C. Sem tag: a release é no fim do 5C.

---

## Fora deste plano

- Fachada das seis telas de acesso (5B); barra lateral `bg-sidebar`, seleção e estado vazio editorial (5C).
- Deploy e prova em tela na VPS: Task 7 do 5C, com a `v26.9.2`.
