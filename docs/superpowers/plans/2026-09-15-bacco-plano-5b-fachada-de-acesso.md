# Bacco Adega CRM — Plano 5B: fachada das seis telas de acesso

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a casca das seis telas de acesso como a referência de login do kit Bacco (laterais fotográficas, card com borda ouro, campos com ícone e olho de senha, frases em texto real), nos dois temas.

**Architecture:** Toda a mudança visual mora na casca única `app/(public)/layout.tsx` (fundo decorativo em CSS, card, frases) e num componente de campo reutilizado pelos formulários de `components/auth/`. Imagens são `background-image` em `div aria-hidden` — nunca `<img>`, porque a fachada sem logo não pode ter `<img>` (`tests/unit/marca-na-fachada-de-acesso.test.tsx`). Nenhuma action de autenticação muda.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, Tailwind 4, Vitest 4 + Testing Library (jsdom), Pillow (só o script de imagens).

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-padrao-visual-design.md` (§4, §6, §7). **Depende do Plano 5A executado** (tokens `gold`, `gold-text`, `accent-text`).

## Global Constraints

- Branch `bacco`; push `git push --no-tags origin bacco:main`; sem tag (release `v26.9.2` no fim do 5C).
- Local só comando puro (`source ~/.nvm/nvm.sh && nvm use 22`): vitest por arquivo, typecheck com `NODE_OPTIONS=--max-old-space-size=6144`, lint, `python3`. Suíte inteira e build no CI. Tela na VPS (5C).
- Sem "Lembrar de mim" (spec §2: não há mecanismo; caixa sem efeito é enganosa).
- `id`, `name`, `autoComplete`, `aria-invalid`, `register(...)` e mensagens de erro dos campos **não mudam** — `tests/e2e/marca-logo.spec.ts` usa `#email`, `#password` e o botão `/entrar/i`.
- O nome da marca na fachada vem da resolução (`marca.nome` / `branding().name`), nunca literal — instalação de revendedor não pode ver "Bacco Adega CRM".
- O subtítulo do login mantém o nome da marca como texto exato isolado (`tests/e2e/icone-da-marca.spec.ts` faz `getByText(marca, { exact: true })`).
- Ícones pelo barril `@/lib/ui/icons` (ADR-05), não direto de `@phosphor-icons/react`.
- Todo texto novo passado a `t(...)`/`traduzir(...)` ganha `es` em `lib/i18n/dicionario.ts`.
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Não-prova declarada

Este plano não prova a tela. A prova (Playwright na VPS, dois temas, 1366 px e 400 px, `getComputedStyle`)
é a Task final do Plano 5C, depois do deploy da `v26.9.2`. Até lá o status visual da fachada é
**não validado**, mesmo com CI verde.

---

### Task 0: Conferir a base

- [ ] **Step 1:** `git status -sb && git log --oneline -8` — o Plano 5A está commitado (`grep -c -- "--color-gold-text" app/globals.css` ≥ 2).
- [ ] **Step 2:** `python3 -c "import PIL; print(PIL.__version__)"` → versão impressa.

---

### Task 1: Imagens das laterais

**Files:**
- Existe: `docs/brand/bacco/limpar-laterais-login.py` (commitado com este plano)
- Create (gerado): `public/fachada/lateral-esquerda.webp`, `public/fachada/lateral-direita.webp`
- Create: `evidence/bacco-rebrand/5b-lateral-esquerda.png`, `evidence/bacco-rebrand/5b-lateral-direita.png`, `evidence/bacco-rebrand/5b-laterais.md`

- [ ] **Step 1:** `python3 docs/brand/bacco/limpar-laterais-login.py`
  Expected:
  ```
  public/fachada/lateral-esquerda.webp 390x1086 13 KB
  public/fachada/lateral-direita.webp 448x1086 4 KB
  ```
- [ ] **Step 2: Evidência** — `python3 -c "from PIL import Image; [Image.open(f'public/fachada/lateral-{l}.webp').save(f'evidence/bacco-rebrand/5b-lateral-{l}.png') for l in ('esquerda','direita')]"` e abrir as duas: nenhuma letra, traço dourado ou borda de card visível. Registrar em `evidence/bacco-rebrand/5b-laterais.md`, citando `evidence/bacco-rebrand/5b-lateral-esquerda.png` e `evidence/bacco-rebrand/5b-lateral-direita.png` pelo caminho completo em crase, com a origem (kit v2, recorte de tela gerada) e o que foi desfocado.
- [ ] **Step 3:** `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` (depois de `git add` dos PNG e do `.md`) → exit 0.
- [ ] **Step 4: Commit** — `feat(bacco): laterais fotográficas da fachada de acesso` + trailer.

---

### Task 2: Campo de acesso com ícone e olho de senha

**Files:**
- Modify: `lib/ui/icons.ts` (exportar `Envelope`, `EyeSlash` do bloco `@phosphor-icons/react/dist/ssr`)
- Create: `components/auth/CampoDeAcesso.tsx`
- Test: `tests/unit/campo-de-acesso.test.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Produces: `export const CampoDeAcesso: React.ForwardRefExoticComponent<React.ComponentProps<"input"> & { icone: "email" | "senha" }>` — repassa todas as props ao `Input`; `icone="senha"` controla `type` (`password`/`text`) e desenha o botão de olho.

- [ ] **Step 1: Teste que falha** — `tests/unit/campo-de-acesso.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampoDeAcesso } from "@/components/auth/CampoDeAcesso";

describe("CampoDeAcesso", () => {
  afterEach(() => cleanup());

  it("campo de e-mail repassa id, type e autoComplete, e o ícone é decorativo", () => {
    const { container } = render(<CampoDeAcesso icone="email" id="email" type="email" autoComplete="email" placeholder="seu@email.com" />);
    const input = container.querySelector("input#email");
    expect(input?.getAttribute("type")).toBe("email");
    expect(input?.getAttribute("autocomplete")).toBe("email");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("campo de senha alterna mostrar/ocultar sem perder o id", () => {
    const { container } = render(<CampoDeAcesso icone="senha" id="password" autoComplete="current-password" />);
    const input = () => container.querySelector("input#password");
    expect(input()?.getAttribute("type")).toBe("password");

    const botao = screen.getByRole("button", { name: "Mostrar senha" });
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(botao);

    expect(input()?.getAttribute("type")).toBe("text");
    const ocultar = screen.getByRole("button", { name: "Ocultar senha" });
    expect(ocultar.getAttribute("aria-pressed")).toBe("true");
    expect(ocultar.getAttribute("type")).toBe("button");
  });
});
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/campo-de-acesso.test.tsx` → FAIL (módulo ausente).

- [ ] **Step 3: Barril** — em `lib/ui/icons.ts`, antes de `} from "@phosphor-icons/react/dist/ssr";`:

```ts
  // fachada de acesso: ícone do campo de e-mail e "ocultar senha"
  Envelope,
  EyeSlash,
```

- [ ] **Step 4:** `components/auth/CampoDeAcesso.tsx`:

```tsx
"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { Envelope, Eye, EyeSlash, Lock } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"input"> & { icone: "email" | "senha" };

/**
 * Campo das telas de acesso (spec Bacco §4.2): ícone à esquerda e, em senha, um botão REAL
 * de mostrar/ocultar (troca o `type`). Todas as outras props — `id`, `autoComplete`,
 * `aria-invalid`, o `ref`/`onChange` do `register` — passam intactas ao `Input`.
 */
export const CampoDeAcesso = React.forwardRef<HTMLInputElement, Props>(function CampoDeAcesso(
  { icone, className, type, ...props },
  ref,
) {
  const t = useT();
  const [visivel, setVisivel] = React.useState(false);
  const ehSenha = icone === "senha";
  const Icone = ehSenha ? Lock : Envelope;

  return (
    <div className="relative">
      <Icone
        aria-hidden
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
      />
      <Input
        ref={ref}
        type={ehSenha ? (visivel ? "text" : "password") : type}
        className={cn("pl-10", ehSenha && "pr-11", className)}
        {...props}
      />
      {ehSenha && (
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? t("Ocultar senha") : t("Mostrar senha")}
          aria-pressed={visivel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-text-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {visivel ? <EyeSlash aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
        </button>
      )}
    </div>
  );
});
```

- [ ] **Step 5: Dicionário** — em `lib/i18n/dicionario.ts`, logo depois de `"Entrar": { es: "Entrar" },`:

```ts
  // ─── Fachada de acesso Bacco (app/(public)/layout.tsx, components/auth/) ───
  "Acesse sua conta no": { es: "Accede a tu cuenta en" },
  "ou": { es: "o" },
  "seu@email.com": { es: "tu@email.com" },
  "Sua senha": { es: "Tu contraseña" },
  "Mostrar senha": { es: "Mostrar contraseña" },
  "Ocultar senha": { es: "Ocultar contraseña" },
  "Mais que vinhos, grandes histórias": { es: "Más que vinos, grandes historias" },
  "Vinhos · Pessoas · Resultados": { es: "Vinos · Personas · Resultados" },
  "Gestão que brinda ao seu crescimento": { es: "Gestión que brinda por tu crecimiento" },
```

  Antes, `grep -nE '^  "(ou|Sua senha|Mostrar senha)":' lib/i18n/dicionario.ts` → vazio (medido 2026-09-15). Chave duplicada quebra o objeto: se alguma já existir, não repetir.

- [ ] **Step 6:** `pnpm exec vitest run tests/unit/campo-de-acesso.test.tsx lib/ui/icons.test.ts` → exit 0.
- [ ] **Step 7: Commit** — `feat(bacco): campo de acesso com ícone e olho de senha` + trailer.

---

### Task 3: Formulários usam o campo

**Files:**
- Modify: `components/auth/LoginForm.tsx`, `components/auth/SignupForm.tsx`, `components/auth/ForgotPasswordForm.tsx`, `components/auth/ResetPasswordForm.tsx`, `components/auth/RecoveryForm.tsx`
- Modify: `app/(public)/login/page.tsx`

**Interfaces:**
- Consumes: `CampoDeAcesso` (Task 2).

- [ ] **Step 1: `LoginForm.tsx`**
  - Imports: trocar `import { Input } from "@/components/ui/input";` por `import { CampoDeAcesso } from "@/components/auth/CampoDeAcesso";`; acrescentar `import Link from "next/link";` e `import { ArrowRight } from "@/lib/ui/icons";`.
  - Campo de e-mail: `<Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={…} {...register("email")} />` → `<CampoDeAcesso icone="email" id="email" type="email" autoComplete="email" autoFocus placeholder={t("seu@email.com")} aria-invalid={errors.email ? true : undefined} {...register("email")} />`.
  - Campo de senha: `<Input id="password" type="password" autoComplete="current-password" …` → `<CampoDeAcesso icone="senha" id="password" autoComplete="current-password" placeholder={t("Sua senha")} aria-invalid={errors.password ? true : undefined} {...register("password")} />`.
  - Depois do bloco do campo de senha (antes de `{serverError && (`):

```tsx
      <div className="flex justify-end">
        <Link
          href="/login/forgot"
          className="text-sm text-gold-text underline decoration-dotted underline-offset-4 hover:decoration-solid"
        >
          {t("Esqueci minha senha")}
        </Link>
      </div>
```

  - Botão: `{isPending ? t("Entrando...") : t("Entrar")}` → `{isPending ? t("Entrando...") : (<>{t("Entrar")}<ArrowRight aria-hidden size={18} className="ml-2" /></>)}`.

- [ ] **Step 2: `app/(public)/login/page.tsx`**
  - Subtítulo: `<p className="text-sm text-muted-foreground">{branding().name}</p>` →

```tsx
        <p className="text-sm text-muted-foreground">
          {t("Acesse sua conta no")} <strong className="font-medium text-text">{branding().name}</strong>
        </p>
```

  - Rodapé: substituir o bloco final `<div className="space-y-2 text-center text-sm">…</div>` (que tem "Esqueci minha senha" e "Não tem conta?") por:

```tsx
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t("ou")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {t("Não tem conta?")}{" "}
        <Link href="/signup" className="font-medium text-gold-text underline underline-offset-4">
          {t("Criar conta")}
        </Link>
      </p>
```

- [ ] **Step 3: `SignupForm.tsx`** — `Input` de `email` → `CampoDeAcesso icone="email"` com `placeholder={t("seu@email.com")}` (mantendo `readOnly={Boolean(convite)}`); `Input` de `password` e de `password_confirm` → `CampoDeAcesso icone="senha"` sem `type` (mantendo `autoComplete="new-password"`); `full_name` e `org_name` continuam `Input`. Import de `CampoDeAcesso` acrescentado; `Input` fica.
- [ ] **Step 4: `ForgotPasswordForm.tsx`** — `Input` de `email` → `CampoDeAcesso icone="email"` com `placeholder={t("seu@email.com")}`; trocar o import de `Input` por `CampoDeAcesso`.
- [ ] **Step 5: `ResetPasswordForm.tsx`** — `Input` de `password` e `password_confirm` → `CampoDeAcesso icone="senha"` sem `type`; `mfa_code` continua `Input`. Import de `CampoDeAcesso` acrescentado; `Input` fica.
- [ ] **Step 6: `RecoveryForm.tsx`** — `Input` de `email` → `CampoDeAcesso icone="email"` (mantendo `required`, `value`, `onChange`); `recovery-code` continua `Input`.
- [ ] **Step 7:** `pnpm exec vitest run tests/unit/campo-de-acesso.test.tsx tests/unit/i18n-espanhol-cobre-a-tela.test.ts $(grep -rlE "LoginForm|SignupForm|ForgotPasswordForm|ResetPasswordForm|RecoveryForm" tests/unit components app --include=*.test.ts --include=*.test.tsx | tr '\n' ' ') && NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 8: Commit** — `feat(bacco): formulários de acesso com ícone, olho de senha e links em ouro` + trailer.

---

### Task 4: Casca da fachada

**Files:**
- Modify: `app/(public)/layout.tsx` (o `return` inteiro; o comentário de cabeçalho fica e ganha um parágrafo)
- Test: `tests/unit/marca-na-fachada-de-acesso.test.tsx` (novos `it`, reaproveitando o helper `fachada()`)

**Interfaces:**
- Consumes: tokens `gold`, `gold-text` (5A); `public/fachada/*.webp` (Task 1); `traduzir`, `normalizarIdioma`.

- [ ] **Step 1: Testes que falham** — acrescentar ao `describe("a casca das telas de acesso")` de `tests/unit/marca-na-fachada-de-acesso.test.tsx`:

```tsx
  it("o fundo fotográfico é decorativo e em CSS — nunca <img>", async () => {
    const html = await fachada(MARCA);
    expect(html).not.toContain("<img");
    expect(html).toContain("/fachada/lateral-esquerda.webp");
    expect(html).toContain("/fachada/lateral-direita.webp");
    // As duas laterais e os véus não são lidos por leitor de tela.
    const decorativos = html.match(/aria-hidden="true"[^>]*data-fachada="fundo"|data-fachada="fundo"[^>]*aria-hidden="true"/g) ?? [];
    expect(decorativos.length).toBeGreaterThanOrEqual(2);
  });

  it("as frases são texto real e o nome é o da marca resolvida", async () => {
    const html = await fachada(MARCA);
    expect(html).toContain("Mais que vinhos, grandes histórias");
    expect(html).toContain("Vinhos · Pessoas · Resultados");
    expect(html).toContain("Gestão que brinda ao seu crescimento");
    expect(html).toContain("Vendas Turbo");
    expect(html).not.toContain("Bacco Adega CRM");
    expect(html).toContain("formulário");
  });
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/marca-na-fachada-de-acesso.test.tsx` → os dois novos FAIL; os três antigos PASS.

- [ ] **Step 3: `app/(public)/layout.tsx`**
  - Imports acrescentados: `import { traduzir } from "@/lib/i18n/dicionario";` e `import { normalizarIdioma } from "@/lib/i18n/idiomas";`.
  - Depois de `const locale = …`: `const t = (texto: string) => traduzir(texto, normalizarIdioma(locale));`
  - Substituir **todo** o `return ( <IdiomaProvider …> … </IdiomaProvider> );` por:

```tsx
  return (
    <IdiomaProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
        {/* Fundo — decorativo, em CSS (nunca <img>: a fachada sem logo não tem imagem). */}
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[27vw] max-w-[390px] bg-[url('/fachada/lateral-esquerda.webp')] bg-cover bg-right lg:block"
        />
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[31vw] max-w-[448px] bg-[url('/fachada/lateral-direita.webp')] bg-cover bg-left lg:block"
        />
        {/* Véu: clareia as fotos no tema claro; no escuro some. O gradiente funde as bordas no fundo. */}
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-bg/70 lg:block dark:bg-transparent"
        />
        <div
          data-fachada="fundo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-bg)_40%,transparent_78%)]"
        />

        {/* Frases — texto real, só em tela larga. */}
        <p className="pointer-events-none absolute right-[5vw] top-1/2 hidden max-w-[12rem] -translate-y-1/2 font-display text-sm uppercase leading-8 tracking-[0.35em] text-gold-text xl:block">
          {t("Mais que vinhos, grandes histórias")}
          <span aria-hidden="true" className="mt-4 block h-px w-14 bg-gold" />
        </p>
        <p className="pointer-events-none absolute bottom-10 left-10 hidden font-display text-xs uppercase tracking-[0.3em] text-gold-text xl:block">
          <span aria-hidden="true" className="mb-3 block h-px w-10 bg-gold" />
          {t("Vinhos · Pessoas · Resultados")}
        </p>
        <p className="pointer-events-none absolute bottom-10 right-10 hidden text-right font-display text-xs uppercase tracking-[0.3em] text-gold-text xl:block">
          <span aria-hidden="true" className="mb-3 ml-auto block h-px w-10 bg-gold" />
          {marca.nome}
          <span className="mt-1 block text-muted-foreground">{t("Gestão que brinda ao seu crescimento")}</span>
        </p>

        {/* Card */}
        <div className="relative z-10 w-full max-w-md space-y-6 rounded-xl border border-gold bg-surface p-8 shadow-lg">
          {marca.logoUrl ? (
            <div className="flex justify-center">
              {/*
                <img> em vez de next/image pelo mesmo motivo da barra lateral: a URL
                é de quem hospeda e o `next/image` exige allowlist de domínios
                fechada em BUILD — a imagem pré-buildada do self-host recusaria o
                domínio do operador. Altura fixa e largura livre para não distorcer
                arte de proporção desconhecida.

                O `alt` é o nome DESTA resolução (`marca.nome`), e não o de
                `branding()`: é a legenda da imagem que está ali, e nomeá-la com a
                marca de outra fonte descreveria uma marca que não é a do logo.

                O `data-testid` é lido por `tests/e2e/marca-logo.spec.ts`, que prova
                que o logo da EMPRESA não vaza para cá. Sem ele a spec caía na
                "primeira <img> da página", e uma asserção de negação com seletor
                largo passa sozinha assim que outra imagem entra na tela.
              */}
              {/* O chip `dark:bg-white` é o mesmo da barra lateral
                (`components/shell/Sidebar.tsx`): esta tela também respeita
                `data-theme` (o `ThemeProvider` embrulha a raiz inteira, login
                incluso), então um logo escuro contra `--color-surface` escuro tem
                o mesmo problema de contraste aqui. */}
              <div className="rounded-md dark:bg-white dark:px-3 dark:py-2 dark:shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="logo-da-fachada"
                  src={marca.logoUrl}
                  alt={marca.nome}
                  className="h-10 w-auto max-w-[12rem] object-contain"
                />
              </div>
            </div>
          ) : marcaEhADoProduto({ name: marca.nome, logoUrl: null }) ? (
            <div className="flex justify-center">
              <LogotipoDoProduto nome={marca.nome} className="h-12 w-auto" />
            </div>
          ) : null}
          <div aria-hidden="true" className="mx-auto h-px w-12 bg-gold" />
          {children}
        </div>
      </div>
    </IdiomaProvider>
  );
```

  O ramo `marca.logoUrl ?` acima é o de hoje, byte a byte (comentários, chip `dark:bg-white` e `<img data-testid="logo-da-fachada">`): `tests/unit/logo-nao-some-no-tema-escuro.test.ts` exige o `<img>` dentro do chip e `tests/e2e/marca-logo.spec.ts` lê o `data-testid`. Conferir com `git diff app/(public)/layout.tsx` que essas linhas aparecem só como movidas, sem alteração.
  - No comentário de cabeçalho do arquivo, acrescentar um parágrafo: "── Fachada Bacco (Plano 5B) ── Fundo em `background-image` com `aria-hidden` (a fachada sem logo não pode ter `<img>`); frases em texto traduzido com o nome da marca RESOLVIDA; card com borda ouro. Laterais geradas por `docs/brand/bacco/limpar-laterais-login.py`."

- [ ] **Step 4:** `pnpm exec vitest run tests/unit/marca-na-fachada-de-acesso.test.tsx tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/branding.test.ts` → exit 0.
- [ ] **Step 5:** `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 6: Commit** — `feat(bacco): fachada de acesso com laterais, card ouro e frases` + trailer.

---

### Task 5: Entrega ao CI

- [ ] **Step 1:** `.changes/bacco-fachada-de-acesso.md`:

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Telas de acesso redesenhadas com a identidade Bacco
---

Entrar, criar conta, recuperar senha e verificação em duas etapas ganham o visual do kit Bacco:
fotos laterais, card com borda dourada, ícones nos campos e botão para mostrar a senha. As
telas seguem o tema claro ou escuro escolhido. Nada muda no login em si.
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/fragmentos-de-release.test.ts tests/unit/evidencia-citada.test.ts` → exit 0. Commit `chore(bacco): fragmento de release da fachada` + trailer.
- [ ] **Step 3:** `git push --no-tags origin bacco:main`; acompanhar `ci`/`perf`/`publish-image` do SHA; ler `Test Files`/`Tests`/`Errors` do `verify`. Vermelho = causa raiz, commit próprio.

## Fora deste plano

- Barra lateral, inbox e estado vazio editorial (5C). Prova em tela e release `v26.9.2` (fim do 5C).
