# Bacco Adega CRM — Plano 5C: barra lateral, inbox editorial, release v26.9.2 e prova em tela

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a barra lateral e a inbox ao visual das referências do kit Bacco (fundo tingido, item ativo em vinho, estado vazio editorial com gravura e citação), soltar a release `v26.9.2` com 5A+5B+5C e provar tudo em tela na VPS.

**Architecture:** Ilustrações do kit tratadas por script e servidas de `public/ilustracoes/` como `background-image` em `div aria-hidden` (nunca `<img>`: `tests/e2e/marca-logo.spec.ts` mede "`<aside>` sem `<img>`" como "sem logo de revendedor", e a barra e o painel do contato são `<aside>`). `EmptyState` ganha modo editorial. Barra lateral usa `bg-sidebar` e seleção `bg-accent-soft text-accent-text`. Prova em tela por Playwright na VPS, medida por `getComputedStyle`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Vitest 4 + Testing Library, Pillow, Playwright 1.63 (contêiner na VPS).

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-padrao-visual-design.md` (§5.1, §5.4, §6, §7 — inclusive a exceção de `/login/mfa` na prova em tela). **Depende dos Planos 5A e 5B executados localmente** (commitados, sem push: ver Global Constraints).

## Global Constraints

- Branch `bacco`; push `git push --no-tags origin bacco:main`. **O primeiro push de 5A+5B+5C é o da Task 6 Step 3.** Os planos 5A e 5B não fazem push: `tests/unit/evidencia-citada.test.ts` varre todo `*.md` versionado e reprova documento que cita PNG não versionado, e os planos citam `evidence/bacco-rebrand/5b-lateral-esquerda.png`, `evidence/bacco-rebrand/5b-lateral-direita.png` e `evidence/bacco-rebrand/5c-ilustracoes.png`, que só existem depois da Task 1 do 5B e da Task 1 deste plano. Por isso nenhuma Task antes da 6 depende de CI.
- Tag anotada `v26.9.2` só depois dos cinco checks obrigatórios (`verify`, `build-and-size`, `invariants`, `e2e`, `imagens-ok`) e do `publish-image` verdes no SHA do push (Task 6).
- Local só comando puro (`source ~/.nvm/nvm.sh && nvm use 22`); suíte inteira no CI; tela na VPS.
- **Densidade da barra:** `tests/e2e/navegacao.spec.ts` reprova se a `nav` rolar em 1280×900 (folga medida: 19 px). Nada novo na barra ocupa altura abaixo de 1000 px de altura de viewport.
- Nenhuma seção de painel promete funcionalidade que não existe (spec §3): o painel do contato fala de "detalhes, demandas abertas e memória", não de compras/clube/preferências.
- Texto secundário fica em `text-text-muted` (4,53 no pior caso, spec §5.1); `text-text-subtle` mede 3,80 e não serve para texto que a pessoa precisa ler.
- Texto novo em `t(...)` ganha `es`; imagens em `evidence/` citadas por caminho completo.
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 0: Conferir a base

Tudo aqui é local: 5A e 5B não fizeram push, então não há CI deles para consultar.

- [ ] **Step 1: Commits e tokens** — `git status -sb && git log --oneline -30` mostra os commits dos Planos 5A e 5B; `grep -c -- "--color-sidebar" app/globals.css` → ≥ 2.
- [ ] **Step 2: Etiqueta do 5A** (a spec §5.4 depende dela):

```bash
test -f components/ui/etiqueta.tsx && test -f lib/etiquetas/cor.ts && test -f lib/etiquetas/cor.test.ts && echo "etiqueta ok"
source ~/.nvm/nvm.sh && nvm use 22 && pnpm exec vitest run lib/etiquetas/cor.test.ts
```
  Expected: `etiqueta ok`; vitest exit 0.

- [ ] **Step 3: Fragmentos e laterais do 5B:**

```bash
test -f .changes/bacco-padrao-visual-tokens.md && test -f .changes/bacco-fachada-de-acesso.md && echo "fragmentos 5A/5B ok"
test -f public/fachada/lateral-esquerda.webp && test -f public/fachada/lateral-direita.webp && echo "laterais ok"
git ls-files evidence/bacco-rebrand/5b-lateral-esquerda.png evidence/bacco-rebrand/5b-lateral-direita.png | wc -l
```
  Expected: `fragmentos 5A/5B ok`; `laterais ok`; `2`. Qualquer falta = voltar ao plano que a cria; não seguir.

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
- rodape: sidebar-footer-vineyard-* recortado em x 0–100, y 36–106 — só a gravura. O arquivo do kit
  traz "Configurações" gravado (linhas 2–20) e a frase (x > 100); no escuro há ainda um filete na
  linha 33. Medido por linha em 2026-09-15 (diferença máxima contra o canto do fundo): linhas 34–42
  vazias nos dois temas, arte a partir da 43. O corte em x = 100 pega a borda da arte; o CSS da barra
  a dissolve com mask-image.
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
            "rodape": Image.open(KIT / kit / f"sidebar-footer-vineyard-{kit}.png").convert("RGB").crop((0, 36, 100, 106)),
        }
        for nome, img in pecas.items():
            destino = SAIDA / f"{nome}-{tema}.webp"
            img.save(destino, "WEBP", quality=82, method=6)
            print(f"{destino.relative_to(RAIZ)} {img.size[0]}x{img.size[1]} {os.path.getsize(destino) // 1024} KB")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2:** `python3 docs/brand/bacco/preparar-ilustracoes.py` → 6 linhas: `vinhedo-claro 625x305`, `citacao-claro 134x120`, `rodape-claro 100x70`, `vinhedo-escuro 625x285`, `citacao-escuro 134x120`, `rodape-escuro 100x70`.
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
  Abrir `evidence/bacco-rebrand/5c-ilustracoes.png`: nenhuma letra, filete ou pedaço de interface; registrar em `evidence/bacco-rebrand/5c-ilustracoes.md` (origem kit v2, recorte do rodapé em y 36–106 com a medição por linha), citando o PNG pelo caminho completo.
- [ ] **Step 4:** `git add public/ilustracoes docs/brand/bacco/preparar-ilustracoes.py evidence/bacco-rebrand/5c-ilustracoes.*` e `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0. Commit `feat(bacco): ilustrações da barra lateral e da inbox` + trailer.

---

### Task 2: Estado vazio editorial

**Files:**
- Modify: `components/empty/EmptyState.tsx`
- Test: `components/empty/EmptyState.test.tsx` (co-localizado, no padrão de `components/inbox/MessageBubble.test.tsx`; o `vitest.config.ts` já roda em `jsdom`)

**Interfaces:**
- Produces: `EmptyStateProps` ganha `editorial?: boolean`, `ilustracao?: "vinhedo"`, `citacao?: string`. Sem esses campos, o render é idêntico ao de hoje.

- [ ] **Step 1: Teste que falha** — `components/empty/EmptyState.test.tsx`. É teste de render (DOM), não de fonte: o `EmptyState` não depende de provider nenhum (sem provider de idioma o `t()` devolve a chave em pt-BR), então renderizá-lo isolado prova o comportamento de verdade.

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatCircle } from "@/lib/ui/icons";

import { EmptyState } from "./EmptyState";

describe("EmptyState editorial", () => {
  afterEach(() => cleanup());

  it("sem os campos novos, nada muda: ícone, título comum, sem imagem", () => {
    const { container } = render(<EmptyState icon={ChatCircle} headline="Quadro vazio" />);
    expect(screen.getByRole("heading", { name: "Quadro vazio" }).className).not.toContain("font-display");
    expect(container.querySelector("[data-ilustracao]")).toBeNull();
    expect(container.querySelector("figure")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("editorial: título serifado, gravura decorativa em CSS e citação", () => {
    const { container } = render(
      <EmptyState icon={ChatCircle} headline="Selecione uma conversa" editorial ilustracao="vinhedo" citacao="Mais que clientes, apreciadores de boas histórias." />,
    );
    expect(screen.getByRole("heading", { name: "Selecione uma conversa" }).className).toContain("font-display");
    const ilustracao = container.querySelector("[data-ilustracao='vinhedo']");
    expect(ilustracao).not.toBeNull();
    expect(ilustracao?.getAttribute("aria-hidden")).toBe("true");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-claro.webp");
    expect(ilustracao?.className).toContain("/ilustracoes/vinhedo-escuro.webp");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("figure blockquote")?.textContent).toBe("“Mais que clientes, apreciadores de boas histórias.”");
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run components/empty/EmptyState.test.tsx` → FAIL.
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

- [ ] **Step 4:** `pnpm exec vitest run components/empty/EmptyState.test.tsx tests/unit/tailwind-tokens.test.ts` → exit 0.
- [ ] **Step 5: Commit** — `feat(bacco): estado vazio editorial com gravura e citação` + trailer.

---

### Task 3: Inbox

**Files:**
- Modify: `components/inbox/InboxLayout.tsx` (ramo final "Selecione uma conversa"), `components/inbox/CRMSidePanel.tsx` (bloco `if (!conversation)`), `components/inbox/ConversationListItem.tsx` (classe de selecionado), `components/inbox/InboxFilters.tsx` (contador da aba), `lib/i18n/dicionario.ts`, `tests/capture-wave-3-cenarios.ts` (regex do placeholder)
- Test: `tests/unit/inbox-editorial.test.tsx`

**Por que aqui o teste é cerca de fonte e não render:** `InboxLayout` consome `useAuth`, `useConversation`, `useConversationsRealtime`, `useClaimConversation`, `useRouter`/`useSearchParams`, entre outros; `CRMSidePanel` consome `useAuth`, `useDefaultPipeline`, `useEditLead`. Renderizá-los isolados exige mockar sessão, dados, Realtime e router, e o teste passaria a provar o mock. A cerca de fonte segura a troca contra regressão; o comportamento (gravura com altura, Playfair, abas sem estouro, contraste) é provado pela spec de evidência da Task 5, na tela real. O componente sem provider (`EmptyState`) tem teste de render na Task 2.

- [ ] **Step 1: Quem já cobra os textos que mudam** — `grep -rnE "Selecione uma conversa|Ou navegue com J e K|bg-accent-50" tests components app --include=*.ts --include=*.tsx`. Medido em 2026-09-15, fora dos próprios arquivos alterados:
  - `tests/e2e/rbac-roles.spec.ts:135` e `tests/e2e/invite-lifecycle.spec.ts:227` (em `SPECS_PARTE_*`, rodam no `e2e` do push) fazem `getByText("Selecione uma conversa", { exact: true })`. Continuam válidas sem mudança: o `h3` do `EmptyState` editorial renderiza exatamente esse texto, e o placeholder antigo do painel ("…para ver detalhes do contato.") nunca casava com `exact`. Quem prova é o `e2e` da Task 6 Step 3.
  - `tests/capture-wave-3-cenarios.ts:930` reconhece o placeholder do `aside` com `/Selecione uma conversa/i`. O placeholder vira "Selecione um contato", então a linha vira, no mesmo commit:

```ts
    const ehPlaceholder = /Selecione (uma conversa|um contato)/i.test(painel.texto);
```
  Qualquer outra ocorrência que o grep mostrar é atualizada no mesmo commit, com registro na mensagem.

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
    expect(fonte).toMatch(/text-text-muted">\{t\("Ou navegue com J e K"\)\}/);
  });

  it("o painel do contato vazio fala só do que existe e desenha a imagem em CSS", () => {
    const fonte = ler("components/inbox/CRMSidePanel.tsx");
    expect(fonte).toContain("Selecione um contato");
    expect(fonte).toContain("/ilustracoes/citacao-claro.webp");
    expect(fonte).not.toContain("Selecione uma conversa para ver detalhes do contato.");
    expect(fonte).not.toMatch(/Compras e hist|Clube e assinaturas|Prefer.ncias de vinho/);
  });

  it("conversa selecionada e contador de aba usam os tokens do kit", () => {
    const item = ler("components/inbox/ConversationListItem.tsx");
    expect(item).toContain("border border-transparent border-b-border/70");
    expect(item).toMatch(/isSelected && "bg-accent-soft hover:bg-accent-soft dark:border-accent-800 dark:border-b-accent-800"/);
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
            <p className="-mt-8 text-xs text-text-muted">{t("Ou navegue com J e K")}</p>
          </div>
```
  e o import `import { EmptyState } from "@/components/empty";` (o barril já exporta `EmptyState`, medido em `app/app/activities/_components/ActivityReportClient.tsx`). A dica fica em `text-text-muted`: `text-text-subtle` mede 3,80, abaixo de 4,5.

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

- [ ] **Step 6: `ConversationListItem.tsx`** — seleção no kit e borda do card selecionado no escuro (spec §5.1: grau 800 da rampa, o mais próximo da amostra ~`#521324`, ΔE OKLab 0,0214). A borda passa a existir nos quatro lados em todo item, transparente, para a seleção não deslocar o layout; a linha de baixo continua `border-border/70`. A classe base

```ts
        "group relative flex w-full items-start gap-3 border-b border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated",
```
  vira

```ts
        "group relative flex w-full items-start gap-3 border border-transparent border-b-border/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated",
```
  e `isSelected && "bg-accent-50 hover:bg-accent-50",` vira

```ts
        isSelected && "bg-accent-soft hover:bg-accent-soft dark:border-accent-800 dark:border-b-accent-800",
```
  (`dark:border-b-accent-800` explícito: sem ele a cor da linha de baixo dependeria da ordem entre `border-b-border/70` e `dark:border-accent-800` no CSS gerado.)

- [ ] **Step 7: `InboxFilters.tsx`** — o contador `<span className="text-[11px] tabular-nums text-text-subtle">{count}</span>` → `<span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium tabular-nums text-accent-text">{count}</span>`. O estouro da `TabsList` com o contador mais largo é medido na Task 5 (1366 px e 400 px).
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
  E remover a chave que ficou órfã com o Step 5 (hoje em `lib/i18n/dicionario.ts:4536`):

```ts
  "Selecione uma conversa para ver detalhes do contato.": {
    es: "Selecciona una conversación para ver los detalles del contacto.",
  },
```
  Conferir antes: `grep -rn "Selecione uma conversa para ver detalhes do contato" app components lib hooks --include=*.ts --include=*.tsx` → só a linha do dicionário.

- [ ] **Step 9:** `pnpm exec vitest run tests/unit/inbox-editorial.test.tsx tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/tailwind-tokens.test.ts components/inbox components/empty && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 10: Commit** — `feat(bacco): inbox editorial — estado vazio, painel do contato e seleção no kit` + trailer.

---

### Task 4: Barra lateral

**Files:**
- Modify: `components/shell/Sidebar.tsx`
- Test: `tests/unit/barra-lateral-kit.test.ts`

**Por que cerca de fonte:** `Sidebar` consome `useAuth`, `usePermission`, `useMarcaDaInstalacao` e `usePathname`; render isolado provaria os mocks. O comportamento (`bg-sidebar` resolvido no `<aside>`, rodapé, sem estouro) é medido na Task 5, na tela real.

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
    // O recorte do kit corta a arte em x = 100: a borda direita se dissolve por máscara.
    expect(FONTE).toContain("[mask-image:linear-gradient(to_right,black_70%,transparent)]");
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
            <div className="h-12 w-16 shrink-0 bg-[url('/ilustracoes/rodape-claro.webp')] bg-contain bg-bottom bg-no-repeat [mask-image:linear-gradient(to_right,black_70%,transparent)] dark:bg-[url('/ilustracoes/rodape-escuro.webp')]" />
            <p className="font-display text-[11px] italic leading-tight text-text-muted">
              {t("Grandes vinhos criam grandes conexões.")}
            </p>
          </div>
        )}
```

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/barra-lateral-kit.test.ts tests/unit/barra-lateral-nao-perde-o-sticky.test.ts tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 5: Commit** — `feat(bacco): barra lateral tingida, seleção em vinho e rodapé ilustrado` + trailer.

---

### Task 5: Spec de evidência do padrão visual e aprovação das ilustrações

**Files:**
- Modify: `tests/e2e/bacco-evidencia.spec.ts` (preserva o laço de onboarding do Plano 1 e acrescenta as medições do 5C)

- [ ] **Step 1:** O conteúdo de `tests/e2e/bacco-evidencia.spec.ts` passa a ser:

```ts
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
      registrar({ funil_mostra_clientes_da_vinicola: nomes.includes("Clientes da vinícola") });
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
```

  (Telas provadas: `login`, `cadastro`, `esqueci`, `redefinir`, `recuperacao`, `inbox`, `funis`, `kanban`, `catalogo`, `configuracoes` = 10 telas × 2 temas × 2 larguras = 40 PNG, mais `5c-onboarding-*` só se a conta QA estiver no onboarding.)

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/e2e-cobertura-completa.test.ts && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0 (a spec já está em `FORA_DO_CI`). Commit `test(bacco): evidência do padrão visual do kit` + trailer.
- [ ] **Step 3: Aprovação do dono das ilustrações (antes da Task 6)** — a spec §6 exige a aprovação de cada arquivo tratado antes do deploy. Mostrar ao dono `evidence/bacco-rebrand/5c-ilustracoes.png` (as seis peças sobre o fundo de cada tema) e registrar a resposta em `evidence/bacco-rebrand/5c-ilustracoes.md` (data e decisão). Sem o ok, a Task 6 não começa. Reprovada uma peça: ajustar `docs/brand/bacco/preparar-ilustracoes.py`, refazer os Steps 2–4 da Task 1 em commit próprio e mostrar de novo. Registrada a aprovação, `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0 e commit `docs(bacco): aprovação das ilustrações pelo dono` + trailer.

---

### Task 6: CI, release e imagens

**Por que tag anotada manual e não o `release.yml`:** no fork o `release.yml` está desligado, e o `scripts/cortar-release.ts` (`pnpm release:cortar`) calcula o número pela numeração do upstream — medido: sairia `1.28.0` — e escreve a seção no `CHANGELOG.md` do upstream. A numeração do fork é `v26.9.x`, e a `v26.9.0` e a `v26.9.1` saíram por tag anotada manual. O que o workflow garante e a tag manual não, este plano replica à mão: os cinco checks verdes antes da tag e, depois dela, as três imagens publicadas com o número e o `stable` apontando para elas (Step 5).

**Fragmentos:** a tag manual não consome fragmento. A `v26.9.1` deixou `.changes/bacco-marca-e-vinicola.md` na árvore (conferível: `git show v26.9.1:.changes/bacco-marca-e-vinicola.md` imprime o mesmo texto), e ele sai no commit de release desta versão. Os três fragmentos de 5A, 5B e 5C descrevem a `v26.9.2`: vão na mensagem da tag e saem no commit de release da versão seguinte, pela mesma regra.

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

- [ ] **Step 2: Commit de release**

```bash
git rm .changes/bacco-marca-e-vinicola.md
ls .changes/
pnpm release:conferir
pnpm exec vitest run tests/unit/fragmentos-de-release.test.ts
```
  Expected: `ls` lista `bacco-barra-e-inbox.md`, `bacco-fachada-de-acesso.md`, `bacco-padrao-visual-tokens.md` (e `.gitkeep`); `release:conferir` lê os três sem erro (o número que ele imprime é o do upstream e é ignorado, ver acima); vitest exit 0. Commit `chore(bacco): release 26.9.2 — fragmento da barra e inbox; sai o fragmento entregue na v26.9.1` + trailer.

- [ ] **Step 3: Primeiro push de 5A+5B+5C e os checks obrigatórios** — antes do push, os PNG citados pelos planos precisam estar versionados:

```bash
git ls-files evidence/bacco-rebrand/5b-lateral-esquerda.png evidence/bacco-rebrand/5b-lateral-direita.png evidence/bacco-rebrand/5c-ilustracoes.png | wc -l
pnpm exec vitest run tests/unit/evidencia-citada.test.ts
```
  Expected: `3`; exit 0. Então:

```bash
git push --no-tags origin bacco:main
SHA=$(git rev-parse bacco)
gh api "repos/lussandro/bacco-adega-crm/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv' | sort
```
  Repetir a consulta até nada ficar `queued`/`in_progress`. Expected: `verify`, `build-and-size`, `invariants`, `e2e` e `imagens-ok` com `completed success`, e todos os jobs do `publish-image` do push (`a-tag-veio-da-main`, `build-and-push` das três imagens, `imagem-do-app-sobe`) com `success`. No `verify`, ler as três linhas do rodapé:

```bash
JOB=$(gh api "repos/lussandro/bacco-adega-crm/commits/$SHA/check-runs?per_page=100" --jq '.check_runs[] | select(.name == "verify") | .id')
gh api "repos/lussandro/bacco-adega-crm/actions/jobs/$JOB/logs" | grep -aE "Test Files |Tests |Errors " | tail -3
```
  (Tudo por `gh api`: o `gh` local é o 2.4, e o `gh run list` dessa versão não tem `--commit` nem `--json`.)
  Expected: `Test Files` e `Tests` sem `failed`, nenhuma linha `Errors`. O `e2e` inclui `rbac-roles.spec.ts` e `invite-lifecycle.spec.ts`, que leem o texto da inbox (Task 3 Step 1). Vermelho = causa raiz, commit próprio, novo push, e a espera recomeça no SHA novo.

- [ ] **Step 4: Tag** — só com os cinco checks e o `publish-image` do Step 3 verdes no mesmo `$SHA`:

```bash
{ printf 'Bacco Adega CRM 26.9.2 — padrão visual do kit\n\n'; cat .changes/bacco-padrao-visual-tokens.md .changes/bacco-fachada-de-acesso.md .changes/bacco-barra-e-inbox.md; } | git tag -a v26.9.2 -F - "$SHA"
git push origin v26.9.2
```

- [ ] **Step 5: Conferir as imagens da tag** (o que o `release.yml` conferiria):

```bash
RUN=$(gh api "repos/lussandro/bacco-adega-crm/actions/workflows/publish-image.yml/runs?event=push&per_page=20" --jq '.workflow_runs[] | select(.head_branch == "v26.9.2") | .id' | head -1)
gh api "repos/lussandro/bacco-adega-crm/actions/runs/$RUN" --jq '[.status, .conclusion] | @tsv'
gh api "repos/lussandro/bacco-adega-crm/actions/runs/$RUN/jobs?per_page=100" --jq '.jobs[] | [.name, .status, .conclusion] | @tsv'
for img in deskcommcrm deskcomm-worker deskcomm-scheduler; do
  docker manifest inspect "ghcr.io/lussandro/$img:26.9.2" > /dev/null && echo "$img 26.9.2 publicada"
  numero=$(docker buildx imagetools inspect "ghcr.io/lussandro/$img:26.9.2" --format '{{json .Manifest.Digest}}')
  stable=$(docker buildx imagetools inspect "ghcr.io/lussandro/$img:stable" --format '{{json .Manifest.Digest}}')
  [ "$numero" = "$stable" ] && echo "$img stable = 26.9.2" || echo "$img stable DIVERGE: $stable != $numero"
done
```
  Repetir as duas consultas `gh api` até o run ficar `completed`. Expected: run `completed success`; jobs `build-and-push` (três), `imagem-do-app-sobe`, `promover-stable` e `imagens-ok` com `success`; três linhas `publicada` e três `stable = 26.9.2`. Os nomes são os de `docker-compose.prod.yml` (`ghcr.io/lussandro/deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler`) e o número sai da tag sem o `v` (`publish-image.yml`, `type=semver,pattern={{version}}`). Se o docker local não tiver acesso ao GHCR, rodar o mesmo laço na VPS por `ssh root@2.25.222.110`. Qualquer divergência para a Task 7.

---

### Task 7: Atualizar a VPS e provar em tela

**Volta declarada:** se o Step 1 não der o esperado, se a prova do Step 2 reprovar algo que não se corrige de imediato, ou se o dono reprovar no Step 4, a VPS volta para a `v26.9.1` com o mesmo comando e `--to v26.9.1`:

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)" && SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" bash hostgator-setup-kit/update.sh --to v26.9.1 > /root/bacco-rollback-26.9.1.log 2>&1; echo "exit=$?"; tail -8 /root/bacco-rollback-26.9.1.log; curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | head -c 200; echo; curl -s -o /dev/null -w "raiz %{http_code}\n" https://adega-crm.baccosistemas.com.br/'
```
  Expected na volta: `exit=0`; `"version":"26.9.1"`; `raiz 307`. A correção sai numa `v26.9.3`, pelo mesmo caminho das Tasks 6 e 7.

- [ ] **Step 1: Atualizar** — o mesmo comando do Plano 4 Task 7 Step 5, com `--to v26.9.2`:

```bash
ssh root@2.25.222.110 'cd /opt/bacco-adega-crm && PW="$(grep ^POSTGRES_PASSWORD= /opt/supabase/docker/.env | cut -d= -f2-)" && SUPABASE_DB_ADMIN_URL="postgresql://postgres.bacco-adega:${PW}@172.17.0.1:5432/postgres" bash hostgator-setup-kit/update.sh --to v26.9.2 > /root/bacco-update-26.9.2.log 2>&1; echo "exit=$?"; tail -8 /root/bacco-update-26.9.2.log; curl -s https://adega-crm.baccosistemas.com.br/api/v1/health | head -c 200; echo; curl -s -o /dev/null -w "raiz %{http_code}\n" https://adega-crm.baccosistemas.com.br/; curl -s -o /dev/null -w "fachada %{http_code} %{content_type}\n" https://adega-crm.baccosistemas.com.br/fachada/lateral-direita.webp'
```
  Expected: `exit=0`; `"version":"26.9.2"`; `raiz 307` (redireciona para o login; `404` é roteamento perdido, ver `docs/runbooks/deploy.md`); `fachada 200 image/webp`. Qualquer outro resultado = volta declarada acima.

- [ ] **Step 2: Rodar a prova**

```bash
scp tests/e2e/bacco-evidencia.spec.ts root@2.25.222.110:/root/bacco-e2e/
ssh root@2.25.222.110 'set -a; . /root/.bacco_qa; set +a; cd /root/bacco-e2e && rm -f out/5c-*.png out/5c-medidas.jsonl; docker run --rm --network host -e BASE_URL=https://adega-crm.baccosistemas.com.br -e QA_EMAIL -e QA_SENHA -v /root/bacco-e2e:/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test bacco-evidencia.spec.ts --reporter=list 2>&1 | grep -vE "npm notice" | tail -30'
scp 'root@2.25.222.110:/root/bacco-e2e/out/5c-*.png' root@2.25.222.110:/root/bacco-e2e/out/5c-medidas.jsonl evidence/bacco-rebrand/
ls evidence/bacco-rebrand/5c-*-{light,dark}-{1366,400}.png | grep -v onboarding | wc -l
```
  Expected: `2 passed`; `40` (10 telas × 2 temas × 2 larguras); cada `expect.soft` verde; `evidence/bacco-rebrand/5c-medidas.jsonl` com uma linha por tela, tema e largura. O `medidas.jsonl` do Plano 1 não é tocado. Falha de medida = causa raiz no código, commit próprio, nova release `v26.9.3` — nunca afrouxar o esperado.

- [ ] **Step 3: Revisão** — `evidence/bacco-rebrand/5c-revisao.md`: cada PNG citado pelo caminho completo em crase, com o que foi visto e as medidas de `evidence/bacco-rebrand/5c-medidas.jsonl` (fundo, superfície, barra, ação, Playfair, pior contraste do texto secundário, transbordo, abas); declarar `/login/mfa` fora da prova com o motivo da spec §7 (ativar TOTP na conta QA de produção), a cobertura que existe (mesma casca `app/(public)/layout.tsx` medida nas outras cinco + teste unitário do 5B) e que a exceção está pendente de ciência do dono. `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0.
- [ ] **Step 4: Aprovação do dono** — mostrar as capturas e a exceção de `/login/mfa`. Pronto só com o ok dele às capturas e a ciência da exceção (spec §4.2 e §7); registrar as duas respostas em `evidence/bacco-rebrand/5c-revisao.md`. Reprovação = correção em `v26.9.3` ou volta declarada.
- [ ] **Step 5:** Commit `test(bacco): prova em tela do padrão visual na VPS` + trailer; `git push --no-tags origin bacco:main`.
- [ ] **Step 6: Vault** — gotchas duráveis em `/home/lussandro/Obsidian/Vault/projetos/bacco-adega-crm/CLAUDE.md` (ilustração em `<aside>` só por CSS por causa do `marca-logo.spec`; densidade da barra; imagens do kit recortadas de tela e o script que as trata; release do fork por tag manual com conferência das imagens, porque o `cortar-release` numera pelo upstream; planos que citam PNG só vão para a `main` depois do commit do PNG). Atualizar `ultima_revisao`.

## Fora deste plano

- Painel do contato de vinícola (compras, clube, visitas, preferências) — funcionalidade com dados, spec própria.
- Cabeçalho "Conversas" com botão de nova conversa da referência: não existe fluxo de iniciar conversa pela lista hoje.
- `/login/mfa` em tela: exceção da spec §7, pendente de ciência do dono.
