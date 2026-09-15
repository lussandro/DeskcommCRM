# Bacco Adega CRM — Plano 1: Rebrand + vertical vinícola

> ⛔ **NÃO EXECUTAR ESTA VERSÃO.** Revisada por refutador (agente Claude, com experimentos em cópia) e por `codex exec` em 2026-09-15; os achados abaixo foram **verificados no código** e exigem reescrita. A ordem aprovada pelo dono é Plano 4 (CI + deploy na VPS) antes deste. Decisões posteriores à escrita: neutros e fundo do upstream ficam (só accent muda); gates rodam no CI do GitHub; teste a quente e evidência visual rodam na VPS com Docker, nunca local.
>
> **Correções obrigatórias na reescrita:**
> 1. **Task 1:** remover troca de `--color-bg`/`--color-text`/`neutral-50/900` (decisão do dono). Os testes de algoritmo que usam a Sage como controle positivo (`branding-contraste`: razões medidas, "Sage inteira cabe nos pisos", "caminhada anda", "Sage pura nasce colidida", `movimentosNoRun`, "separável do neutro"; `branding-pares-pintados`: "caminhada anda", "Sage pintada", "anel de foco") passam a ler régua Sage **congelada como fixture**, não `globals.css` — colar número novo desarma o teste. Remeter o grau do accent escuro **por medição** (grau 300 medido pior: 11 falhas). Números de linha: `--color-text` `:41`, accent escuro `:357`, soft `:359`, hover `:360`, `--ring` claro também em `:164` e `:311`.
> 2. **Task 1 Step 7:** `hostgator-setup-kit/test-validators.sh:1028` exige `background: #506d48; background: #506d48` — atualizar junto com `marca-emails.sh:140` (e o comentário `:115`), senão `test:shell` reprova.
> 3. **Task 2:** `h1` global aplica Playfair em 51 `<h1>` inclusive inbox/kanban — contraria spec §4.3. Aplicar `font-display` só em login, onboarding e marca.
> 4. **Task 3:** manter o script (medido: roda, 16 KB, typecheck verde, render conferido). Registrar que o logotipo da barra **omite** separador e tagline de propósito (ilegível no tamanho da barra) e atualizar spec §4.1. Nits: `desenho.ts:101-102`, `MarcaDoProduto.tsx:9` e comentários "Sage" em `rampa.ts:13`, `saida.ts:80`, `env.ts:339`.
> 5. **Task 4:** incluir `tests/unit/branding.test.ts:15` (`initial: "D"`) e `:134` (não `:146`), `tests/unit/branding-marca-resolve.test.ts:224`, `tests/unit/branding-saida.test.ts:194,217`, `tests/unit/lgpd-pdf-meet.test.ts:126` (garante que o PDF LGPD não leva a marca — trocar para "Bacco Adega CRM", não remover) e `tests/e2e/signup-journey.spec.ts:46`.
> 6. **Task 5:** PISTAS classificam errado frases comuns ("clube de assinatura com degustação" → enoturismo; "vinícola com visitas e loja virtual" → enoturismo; "vinícola", "vendemos vinho" → genérico). Revisar ordem/regex e adicionar esses casos ao teste (plural, feminino, sem acento).
> 7. **Task 6:** slugs `ecommerce_*` de `PROMPT_TEMPLATES` ficam (id técnico) — declarar. Conferência final por grep mais larga (`paciente|cl[ií]nica|odontol|corretor|imobili|e-?commerce|iPhone|Perfume`).
> 8. **Task 7:** reescrever `public/llms.txt` inteiro (linhas 17-27 citam upstream); incluir `Dockerfile.worker:11`, `Dockerfile.scheduler:12`; `publish-image.yml` matrix/títulos vão para o Plano 4. Não apagar `docs/brand/deskcomm-*.svg` sem ajustar `README.es.md:6-7` e `docs/brand/og-card.html`.
> 9. **Task 0 e verificação:** usar rodapé `Test Files`/`Tests`/`Errors` + exit code, nunca `grep FAIL` (`CLAUDE.md:328-369`); linha de base = primeira execução do CI no GitHub, não a local.
> 10. **Task 8:** sai deste plano — evidência visual roda na VPS (Plano 4 entrega o ambiente). `/admin/marca` exige platform admin (`e2e-dono` via `seed-e2e-system-update.ts`, que revoga `e2e-admin`); incluir onboarding e detalhe de lead.
> 11. **Tarefas faltando (spec §5.2, §7):** fragmento `.changes/` + `pnpm release:conferir`; revisão dos textos de captação (webhooks, RD Station, planilha de leads, ads).
> 12. Nit: `ACCENT_DO_PRODUTO` está em `lib/branding/saida.ts:90`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a marca do produto DeskcommCRM pela Bacco Adega CRM (paleta, fontes, símbolo, nome) e trocar os nichos do onboarding pelos três públicos da vinícola, com todos os gates do upstream verdes.

**Architecture:** Fork com marca de produto deliberada (spec §4.4): os valores do design system mudam na fonte (`app/globals.css`, `lib/branding/desenho.ts`, `lib/branding.ts`) e os testes-doutrina que fixam a marca antiga mudam no mesmo commit, com a razão escrita. A paleta sai do gerador do próprio repo (`rampaDeSemente`), nunca de hex digitado à mão. O símbolo sai dos SVGs oficiais convertidos em paths por um script versionado.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Vitest 4, Playwright, Python 3 + fontTools (só o script de conversão do logo), Node 22 via nvm, pnpm 9.15.9.

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` (§4, §5.1–§5.4, §7, §10)

## Global Constraints

- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22` antes de qualquer comando `pnpm`); pnpm 9.15.9.
- Branch `bacco`, base `v1.27.0`. Nenhum commit na `main`.
- Cores do produto (spec §4.1): borgonha `#4A0E1F`, creme `#F5F0E6`, ouro `#C49A4A`, grafite `#2E2E2E`. Hex sempre **minúsculo** no código (`tests/unit/marca-do-produto.test.tsx` usa `/#[0-9a-f]{6}/`).
- Rampa accent = saída de `rampaDeSemente("#4a0e1f")`, medida em 2026-09-15:
  `#fbf2f3 #f1dddf #dab5ba #b9828b #985461 #752f3f #4a0e1f #40131e #39161d #33171d #291619` (graus 50…950).
- Fontes (spec §4.3): Inter no corpo/interface; Playfair Display 600 só em `h1`; IBM Plex Mono mantida.
- Nome do produto: `Bacco Adega CRM`. Tagline do logo: "Relacionamento e atendimento inteligente".
- **Não renomear** identificadores técnicos: `sb-deskcomm-auth`, `X-Deskcomm-*`, `deskcomm-theme`, `deskcomm-impersonate`, MCP `deskcomm-crm`, `SUFIXO_ICAL_UID`, `lib/nuvemshop/config.ts` (spec §2, §4.4).
- Não tocar `app/design/**` além dos três títulos (showcase interno, `robots: noindex`, pulado pela catraca).
- Todo texto novo passado a `t(...)` ganha entrada `es` em `lib/i18n/dicionario.ts` (senão `tests/unit/i18n-espanhol-cobre-a-tela.test.ts:471` falha).
- Mensagem de commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Nada é "pronto" sem o comando de verificação rodado e a saída observada.
- **Evidência versionada precisa de citação exata** (`tests/unit/evidencia-citada.test.ts`): toda imagem commitada em `evidence/` tem de aparecer, em crase e com o caminho completo (sem glob, sem `${}`), em algum `.md` versionado — senão o teste reprova como órfã. Em crase, nome de imagem sem barra é resolvido contra a pasta do próprio documento: escreva sempre o caminho completo.

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `evidence/bacco-rebrand/00-baseline-*.log` | falhas pré-existentes na v1.27.0 | 0 |
| `app/globals.css` | tokens de cor (rampa, fundo, texto, accent escuro) e fonte | 1, 2 |
| `lib/branding/regua-do-produto.ts` | régua gerada do `globals.css` | 1 |
| `tests/unit/branding-{rampa,contraste,pares-pintados}.test.ts` | âncoras da paleta do produto | 1 |
| `supabase/templates/{confirmation,recovery}.html`, `hostgator-setup-kit/marca-emails.sh` | fallback de cor dos e-mails de acesso | 1 |
| `app/layout.tsx`, `tests/unit/tailwind-tokens.test.ts` | fontes via `next/font` | 2 |
| `docs/brand/bacco/texto-para-path.py` | converte os SVGs oficiais em `lib/branding/desenho.ts` | 3 |
| `lib/branding/desenho.ts` | geometria do símbolo/logotipo (GERADO) | 3 |
| `components/branding/MarcaDoProduto.tsx`, `app/icon.tsx` | desenho em duas cores | 3 |
| `lib/branding.ts` + testes de nome/catraca | nome do produto | 4 |
| `lib/email/templates/ai-budget-alarm.tsx` | última DIVIDA da catraca | 4 |
| `lib/onboarding/{pacotes-de-funil,sugerir-funil}.ts` + teste | nichos da vinícola | 5 |
| telas/dicionário/CSV/agente | copy de outros setores → vinho | 6 |
| `README.md`, `public/llms.txt`, `package.json`, `LICENSE`, `Dockerfile`, `docs/brand/README.md` | textos de produto | 7 |
| `tests/e2e/bacco-evidencia.spec.ts`, `evidence/bacco-rebrand/*.png` | prova em tela | 8 |

---

### Task 0: Linha de base na v1.27.0 intacta

**Files:**
- Create: `evidence/bacco-rebrand/00-baseline-gov-verify.log`

**Interfaces:**
- Produces: lista de testes que já falham antes de qualquer mudança — toda tarefa seguinte compara contra ela.

- [ ] **Step 1: Conferir que a árvore está na base**

Run: `cd /home/lussandro/Bacco-Crm && git status -sb && git diff --stat v1.27.0 -- app lib components tests`
Expected: `## bacco`, e o diff contra `v1.27.0` vazio (só `docs/` mudou).

- [ ] **Step 2: Rodar os gates e guardar a saída**

```bash
cd /home/lussandro/Bacco-Crm && source ~/.nvm/nvm.sh && nvm use 22
pnpm install --frozen-lockfile
mkdir -p evidence/bacco-rebrand
pnpm gov:verify > evidence/bacco-rebrand/00-baseline-gov-verify.log 2>&1; echo "exit=$?" >> evidence/bacco-rebrand/00-baseline-gov-verify.log
tail -40 evidence/bacco-rebrand/00-baseline-gov-verify.log
```
Expected: o log termina com `exit=<n>`. Anote no topo do log, à mão, a lista de arquivos de teste que falharam (linhas `FAIL`). `typecheck` já foi medido verde em 2026-09-15.

- [ ] **Step 3: Commit**

```bash
git add evidence/bacco-rebrand/00-baseline-gov-verify.log
git commit -m "chore(bacco): linha de base do gov:verify na v1.27.0

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Paleta Bacco no design system

**Files:**
- Modify: `tests/unit/branding-rampa.test.ts:105-116`
- Modify: `tests/unit/branding-contraste.test.ts:61`
- Modify: `app/globals.css:35,40,50-64,253-275,346-362,414`
- Modify: `lib/branding/regua-do-produto.ts` (literal inteiro, colado da falha do teste)
- Modify: `tests/unit/branding-pares-pintados.test.ts:340` (só se falhar por âncora Sage)
- Modify: `supabase/templates/confirmation.html:27`, `supabase/templates/recovery.html:22`, `hostgator-setup-kit/marca-emails.sh:140`

**Interfaces:**
- Produces: tokens `--color-accent-50…950` borgonha; `--color-accent` = grau 600 no claro; `ACCENT_DO_PRODUTO` (`lib/branding/saida.ts:94`) passa a valer `#4a0e1f` automaticamente, porque lê a régua.

- [ ] **Step 1: Confirmar a rampa pelo gerador**

Run: `pnpm exec tsx -e 'import { rampaDeSemente } from "./lib/branding/rampa"; console.log(rampaDeSemente("#4a0e1f").join(" "))'`
Expected: `#fbf2f3 #f1dddf #dab5ba #b9828b #985461 #752f3f #4a0e1f #40131e #39161d #33171d #291619`

- [ ] **Step 2: Mudar as âncoras dos testes (vão falhar)**

Em `tests/unit/branding-rampa.test.ts`, no `describe("rampaDeSemente — catraca de calibração contra o design system")`:

```ts
    expect(esperados[K]).toBe("#4a0e1f");
  });

  it("reproduz os 11 stops borgonha a partir de #4a0e1f com Δ ≤ 2/255 por canal", () => {
    const derivada = rampaDeSemente("#4a0e1f");
```

Em `tests/unit/branding-contraste.test.ts:61`:

```ts
    expect(REGUA.rampaDoProduto[6]).toBe("#4a0e1f");
```

(`FIXTURE` nas linhas 55-58 fica como está: `#506d48` ali é controle positivo de algoritmo, não a cor do produto.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm exec vitest run tests/unit/branding-rampa.test.ts tests/unit/branding-contraste.test.ts`
Expected: FAIL — `expected '#506d48' to be '#4a0e1f'`.

- [ ] **Step 4: Trocar os tokens no `app/globals.css`**

No `:root` (linhas 50-60) e no `[data-theme="dark"]` (linhas 346-356), a rampa inteira:

```css
  --color-accent-50:  #fbf2f3;
  --color-accent-100: #f1dddf;
  --color-accent-200: #dab5ba;
  --color-accent-300: #b9828b;
  --color-accent-400: #985461;
  --color-accent-500: #752f3f;
  --color-accent-600: #4a0e1f;
  --color-accent-700: #40131e;
  --color-accent-800: #39161d;
  --color-accent-900: #33171d;
  --color-accent-950: #291619;
```

Troque o comentário `/* Accent — Sage (11 stops) */` por `/* Accent — Borgonha Bacco (11 stops, rampaDeSemente("#4a0e1f")) */` e o cabeçalho da linha 28 por `Bacco Adega CRM — Design System tokens (Borgonha · density Aerada)`.

Hover no claro vai para o grau **mais claro**: a semente já é escura e os graus 700–950 saem quase iguais ao 600 (medido). No `:root` (linha 64) e no `[data-theme="light"]` (linha 265):

```css
  --color-accent-hover: var(--color-accent-500);
```

Fundo creme e texto grafite do board, no `:root` (linhas 35, 40, 67, 76) e no `[data-theme="light"]` (linhas 253, 257, 266, 275):

```css
  --color-bg: #f5f0e6;
  --color-text: #2e2e2e;
  --color-neutral-50:  #f5f0e6;
  --color-neutral-900: #2e2e2e;
```

Accent suave do tema escuro, hoje verde fixo (`globals.css:358`), passa a ser o grau 400 borgonha (`#985461` = 152, 84, 97):

```css
  --color-accent-soft: rgba(152, 84, 97, 0.16);
```

- [ ] **Step 5: Regenerar a régua do produto**

Run: `pnpm exec vitest run tests/unit/branding-regua-do-produto.test.ts`
Expected: FAIL com a mensagem `Substitua o objeto de lib/branding/regua-do-produto.ts por:` seguida de um JSON. Cole esse objeto como valor de `export const REGUA_DO_PRODUTO: Regua = ...` em `lib/branding/regua-do-produto.ts` (mantendo o cabeçalho e o `import type`). Rode de novo.
Expected: PASS.

- [ ] **Step 6: Rodar a família de branding e ler cada falha**

Run: `pnpm exec vitest run tests/unit/branding-*.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/logo-nao-some-no-tema-escuro.test.ts`

Regras para cada falha, nesta ordem:
1. Falha que compara com valor da **paleta Sage do produto** (`#506d48`, `#82a077`, razões de contraste medidas da Sage — ex.: `branding-pares-pintados.test.ts:340`): substitua pelo valor que a mensagem de falha imprime para a régua nova, e troque "Sage" por "Borgonha" no título do `it`.
2. Falha de **piso de contraste** (`PISOS` texto 4.5 / componente 3.0) no **tema escuro**: o accent escuro é o grau 400 `#985461`, que mede 3.29 sobre `#161510`. Suba um grau no bloco `[data-theme="dark"]`:
   ```css
     --color-accent: var(--color-accent-300);
     --color-accent-hover: var(--color-accent-200);
   ```
   e `--ring: var(--color-accent-300);` (linha 414), `outline-color: var(--color-accent-300);` (linha ~731); regenere a régua (Step 5) e rode de novo.
3. Falha de **piso no tema claro** ou de separação accent × erro: pare e reporte — não mexa em `contraste.ts` nem nos pisos.

Expected ao final: PASS em todos, exceto os que já falhavam na Task 0.

- [ ] **Step 7: Fallback de cor dos e-mails de acesso**

`supabase/templates/confirmation.html:27` e `supabase/templates/recovery.html:22`: troque `background: #506d48;` por `background: #4a0e1f;` (mantendo o `background: __ACCENT__;` logo depois).

`hostgator-setup-kit/marca-emails.sh:140`: `*) ACCENT="#4a0e1f";;`

Run: `pnpm exec vitest run tests/unit/branding.test.ts && pnpm test:shell`
Expected: PASS (a catraca do GoTrue exige `__ACCENT__` e nenhuma marca nos templates; o fallback é hex, não marca).

- [ ] **Step 8: Typecheck e commit**

```bash
pnpm typecheck
git add app/globals.css lib/branding/regua-do-produto.ts tests/unit supabase/templates hostgator-setup-kit/marca-emails.sh
git commit -m "feat(bacco): paleta borgonha no design system

Rampa gerada por rampaDeSemente(#4a0e1f); fundo creme e texto grafite do
board; hover sobe para o grau 500 porque os graus escuros colapsam.
Âncoras Sage dos testes de branding trocadas pela régua nova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fontes Inter + Playfair Display

**Files:**
- Modify: `tests/unit/tailwind-tokens.test.ts:89`
- Modify: `app/layout.tsx:2,28-33,281`
- Modify: `app/globals.css:535-538,701`

**Interfaces:**
- Produces: custom properties `--font-inter` e `--font-display` declaradas no `<html>`; utilitário Tailwind `font-display`; todo `h1` em Playfair Display.

- [ ] **Step 1: Teste primeiro**

`tests/unit/tailwind-tokens.test.ts:89`:

```ts
    const DE_FORA_DO_CSS = ["--font-inter", "--font-display", "--font-mono"];
```

Run: `pnpm exec vitest run tests/unit/tailwind-tokens.test.ts`
Expected: FAIL — `--font-inter deixou de ser declarada pelo next/font`.

- [ ] **Step 2: `app/layout.tsx`**

Linha 2:

```ts
import { IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";
```

Linhas 28-33 (substitui o bloco `atkinson`):

```ts
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["600"],
  display: "swap",
  variable: "--font-display",
});
```

Linha 281:

```tsx
      className={`${inter.variable} ${playfair.variable} ${plexMono.variable}`}
```

- [ ] **Step 3: `app/globals.css`**

Linhas 535-538 (bloco `/* Tipografia */` do `@theme inline`):

```css
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", Roboto, sans-serif;
  --font-display: var(--font-display), Georgia, "Times New Roman", serif;
  --font-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco,
    Consolas, monospace;
```

Linha 701 (`body`):

```css
    font-family: var(--font-inter), ui-sans-serif, system-ui, -apple-system,
```

Logo após a regra `code, kbd, pre, samp` (~linha 710), dentro do mesmo `@layer base`:

```css
  h1 {
    font-family: var(--font-display), Georgia, "Times New Roman", serif;
  }
```

- [ ] **Step 4: Verificar**

Run: `pnpm exec vitest run tests/unit/tailwind-tokens.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS; `grep -rn 'font-atkinson' app lib components tests --include='*.ts*' --include='*.css'` sem resultado.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css tests/unit/tailwind-tokens.test.ts
git commit -m "feat(bacco): Inter na interface e Playfair Display nos títulos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Símbolo e logotipo Bacco em duas cores

**Files:**
- Create: `docs/brand/bacco/texto-para-path.py`
- Modify (gerado): `lib/branding/desenho.ts`
- Modify: `components/branding/MarcaDoProduto.tsx:1,29-41,50-89`
- Modify: `app/icon.tsx:4,97-100`
- Modify: `tests/unit/marca-do-produto.test.tsx:141-145`

**Interfaces:**
- Consumes: `docs/brand/bacco/bacco-adega-crm-simbolo.svg`, `docs/brand/bacco/bacco-adega-crm-logo-bordo.svg`.
- Produces (em `lib/branding/desenho.ts`):
  ```ts
  export type Uva = { readonly cx: number; readonly cy: number; readonly r: number };
  export type Desenho = { readonly corpo: readonly string[]; readonly uvas: readonly Uva[] };
  export const SIMBOLO: Desenho & { readonly viewBox: string };
  export const LOGOTIPO: {
    readonly viewBox: string;
    readonly proporcao: number;
    readonly simbolo: Desenho;
    readonly nome: readonly string[];
    readonly sufixo: readonly string[];
  };
  export const CORES_DA_MARCA: {
    readonly claro: { corpo: "#4a0e1f"; uvas: "#c49a4a"; nome: "#4a0e1f"; sufixo: "#c49a4a" };
    readonly escuro: { corpo: "#f5f0e6"; uvas: "#c49a4a"; nome: "#f5f0e6"; sufixo: "#c49a4a" };
  };
  ```
  e em `MarcaDoProduto.tsx`: `CLASSES_DE_COR` com as chaves `corpo`, `uvas`, `nome`, `sufixo`.

- [ ] **Step 1: Teste do favicon primeiro**

`tests/unit/marca-do-produto.test.tsx:141-145`:

```ts
  it("desenha o símbolo quando a marca é a do produto, e a inicial quando não é", () => {
    expect(icone).toMatch(/marcaEhADoProduto\(\{ name: marca\.nome, logoUrl: marca\.logoUrl \}\)/);
    expect(icone).toMatch(/SIMBOLO\.corpo\.map/);
    expect(icone).toMatch(/SIMBOLO\.uvas\.map/);
    expect(icone).toMatch(/letraDoIcone\(marca\.nome\)/);
  });
```

Run: `pnpm exec vitest run tests/unit/marca-do-produto.test.tsx`
Expected: FAIL — `SIMBOLO\.corpo\.map` não casa.

- [ ] **Step 2: Script de conversão**

Create `docs/brand/bacco/texto-para-path.py`:

```python
#!/usr/bin/env python3
"""Gera lib/branding/desenho.ts a partir dos SVGs oficiais do Bacco Adega CRM.

Os SVGs recebidos usam <text> com Playfair Display / Inter; o app e o favicon
(satori) precisam de paths. Uso:

  FONTES=$(mktemp -d)
  curl -fsSL -o "$FONTES/Playfair.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
  curl -fsSL -o "$FONTES/Inter.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
  python3 docs/brand/bacco/texto-para-path.py "$FONTES" > lib/branding/desenho.ts

Requer: python3 com fontTools (pip install fonttools). Sem kerning: conferir
o render contra docs/brand/bacco/preview.png.
"""
import json
import re
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

AQUI = Path(__file__).parent
FONTES = Path(sys.argv[1])
_fontes = {}


def fonte(classe, peso):
    chave = (classe, peso)
    if chave not in _fontes:
        serif = classe == "serif"
        f = TTFont(FONTES / ("Playfair.ttf" if serif else "Inter.ttf"))
        eixos = {"wght": peso} if serif else {"wght": peso, "opsz": 14}
        _fontes[chave] = instantiateVariableFont(f, eixos)
    return _fontes[chave]


def attr(tag, nome, padrao=None):
    m = re.search(rf'\s{nome}="([^"]*)"', tag)
    return m.group(1) if m else padrao


def arredonda(d):
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."), d)


class Caixa:
    def __init__(self):
        self.x0 = self.y0 = float("inf")
        self.x1 = self.y1 = float("-inf")

    def soma(self, x0, y0, x1, y1):
        self.x0, self.y0 = min(self.x0, x0), min(self.y0, y0)
        self.x1, self.y1 = max(self.x1, x1), max(self.y1, y1)

    def viewbox(self, margem=0.04):
        w, h = self.x1 - self.x0, self.y1 - self.y0
        m = max(w, h) * margem
        return round(self.x0 - m, 1), round(self.y0 - m, 1), round(w + 2 * m, 1), round(h + 2 * m, 1)


def texto(tag, conteudo, dx, dy, caixa):
    classe = "serif" if "serif" in attr(tag, "class", "") else "sans"
    f = fonte(classe, int(attr(tag, "font-weight", "400")))
    tamanho = float(attr(tag, "font-size"))
    x, y = float(attr(tag, "x")) + dx, float(attr(tag, "y")) + dy
    espaco = float(attr(tag, "letter-spacing", "0"))
    cmap, glifos, hmtx = f.getBestCmap(), f.getGlyphSet(), f["hmtx"]
    escala = tamanho / f["head"].unitsPerEm
    caneta, limites = SVGPathPen(glifos), BoundsPen(glifos)
    for ch in conteudo:
        g = cmap[ord(ch)]
        matriz = (escala, 0, 0, -escala, x, y)
        glifos[g].draw(TransformPen(caneta, matriz))
        glifos[g].draw(TransformPen(limites, matriz))
        x += hmtx[g][0] * escala + espaco
    if limites.bounds:
        caixa.soma(*limites.bounds)
    return arredonda(caneta.getCommands())


def caminho(d, dx, dy, caixa):
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs, ys = nums[0::2], nums[1::2]
    caixa.soma(min(xs) + dx, min(ys) + dy, max(xs) + dx, max(ys) + dy)
    if dx == 0 and dy == 0:
        return d
    return re.sub(
        r"(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)",
        lambda m: f"{float(m.group(1)) + dx:g} {float(m.group(2)) + dy:g}",
        d,
    )


def uvas(svg, dx, dy, caixa):
    saida = []
    for c in re.findall(r"<circle[^>]*/>", svg):
        cx, cy, r = float(attr(c, "cx")) + dx, float(attr(c, "cy")) + dy, float(attr(c, "r"))
        caixa.soma(cx - r, cy - r, cx + r, cy + r)
        saida.append({"cx": cx, "cy": cy, "r": r})
    return saida


simbolo_svg = (AQUI / "bacco-adega-crm-simbolo.svg").read_text()
cx_simbolo = Caixa()
folha = re.search(r'<path d="([^"]+)"', simbolo_svg).group(1)
b_tag, b_txt = re.search(r"<text([^>]*)>([^<]*)</text>", simbolo_svg).groups()
simbolo = {
    "corpo": [caminho(folha, 0, 0, cx_simbolo), texto(b_tag, b_txt, 0, 0, cx_simbolo)],
    "uvas": uvas(simbolo_svg, 0, 0, cx_simbolo),
}
vb_s = cx_simbolo.viewbox()

logo_svg = (AQUI / "bacco-adega-crm-logo-bordo.svg").read_text()
dx, dy = map(float, re.search(r'translate\(([-\d.]+) ([-\d.]+)\)', logo_svg).groups())
cx_logo = Caixa()
textos = re.findall(r"<text([^>]*)>([^<]*)</text>", logo_svg)
por_conteudo = {conteudo: tag for tag, conteudo in textos}
logotipo = {
    "simbolo": {
        "corpo": [texto(por_conteudo["B"], "B", dx, dy, cx_logo)],
        "uvas": uvas(logo_svg, dx, dy, cx_logo),
    },
    "nome": [texto(por_conteudo["Bacco"], "Bacco", dx, dy, cx_logo)],
    "sufixo": [
        texto(por_conteudo["ADEGA"], "ADEGA", dx, dy, cx_logo),
        texto(por_conteudo["CRM"], "CRM", dx, dy, cx_logo),
    ],
}
vb_l = cx_logo.viewbox()

print('''/**
 * O DESENHO da marca do produto — símbolo e logotipo do Bacco Adega CRM.
 *
 * ESTE ARQUIVO É GERADO por `docs/brand/bacco/texto-para-path.py` a partir de
 * `docs/brand/bacco/bacco-adega-crm-simbolo.svg` e `bacco-adega-crm-logo-bordo.svg`
 * (texto convertido em paths com Playfair Display 600). Não edite à mão.
 *
 * Mora aqui, e não num `.svg` em `public/`, pelas razões de sempre da marca
 * própria: o favicon (`app/icon.tsx`) é gerado pelo satori, que aceita SVG inline
 * mas não lê arquivo, e um arquivo em `public/` vazaria para quem configurou
 * marca própria. As cores ficam em `CORES_DA_MARCA`; quem desenha escolhe o tema.
 */

export type Uva = { readonly cx: number; readonly cy: number; readonly r: number };
export type Desenho = { readonly corpo: readonly string[]; readonly uvas: readonly Uva[] };
''')
print(f'export const SIMBOLO: Desenho & {{ readonly viewBox: string }} = {{\n  viewBox: "{" ".join(map(str, vb_s))}",\n  corpo: {json.dumps(simbolo["corpo"])},\n  uvas: {json.dumps(simbolo["uvas"])},\n}};\n')
print(f'export const LOGOTIPO = {{\n  viewBox: "{" ".join(map(str, vb_l))}",\n  /** Proporção largura/altura do `viewBox`, para dimensionar por altura. */\n  proporcao: {vb_l[2]} / {vb_l[3]},\n  simbolo: {json.dumps(logotipo["simbolo"])} as Desenho,\n  nome: {json.dumps(logotipo["nome"])} as readonly string[],\n  sufixo: {json.dumps(logotipo["sufixo"])} as readonly string[],\n}} as const;\n')
print('''/**
 * Cores da marca por tema: borgonha e ouro no claro; creme e ouro no escuro
 * (negativo sobre borgonha de `docs/brand/bacco/preview.png`).
 */
export const CORES_DA_MARCA = {
  claro: { corpo: "#4a0e1f", uvas: "#c49a4a", nome: "#4a0e1f", sufixo: "#c49a4a" },
  escuro: { corpo: "#f5f0e6", uvas: "#c49a4a", nome: "#f5f0e6", sufixo: "#c49a4a" },
} as const;''')
```

- [ ] **Step 3: Gerar `desenho.ts`**

```bash
python3 -c "import fontTools" || pip install --user fonttools
FONTES=$(mktemp -d)
curl -fsSL -o "$FONTES/Playfair.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
curl -fsSL -o "$FONTES/Inter.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
python3 docs/brand/bacco/texto-para-path.py "$FONTES" > lib/branding/desenho.ts
grep -c 'export const' lib/branding/desenho.ts && wc -c lib/branding/desenho.ts
```
Expected: `3` exports (`SIMBOLO`, `LOGOTIPO`, `CORES_DA_MARCA`) e arquivo com dezenas de KB, sem `<text`.

- [ ] **Step 4: `components/branding/MarcaDoProduto.tsx`**

Linha 1:

```ts
import { LOGOTIPO, SIMBOLO, type Desenho } from "@/lib/branding/desenho";
```

Linhas 29-41 (cores e `CLASSES_DE_COR`):

```ts
const CORPO_CLARO_ESCURO = "fill-[#4a0e1f] dark:fill-[#f5f0e6]";
const UVAS_CLARO_ESCURO = "fill-[#c49a4a] dark:fill-[#c49a4a]";
const NOME_CLARO_ESCURO = "fill-[#4a0e1f] dark:fill-[#f5f0e6]";
const SUFIXO_CLARO_ESCURO = "fill-[#c49a4a] dark:fill-[#c49a4a]";

// As classes acima repetem os hexes de `CORES_DA_MARCA` porque o Tailwind só
// gera utilitário para valor LITERAL no fonte. Quem impede os dois de divergirem
// é `tests/unit/marca-do-produto.test.tsx`, que compara as classes à paleta —
// e não uma asserção em runtime: um throw aqui derrubaria a casca inteira.
export const CLASSES_DE_COR = {
  corpo: CORPO_CLARO_ESCURO,
  uvas: UVAS_CLARO_ESCURO,
  nome: NOME_CLARO_ESCURO,
  sufixo: SUFIXO_CLARO_ESCURO,
} as const;
```

Substitua `SimboloDoProduto` e `LogotipoDoProduto` (linhas 49-89) por:

```tsx
function Partes({ desenho }: { readonly desenho: Desenho }) {
  return (
    <>
      <g className={CORPO_CLARO_ESCURO}>
        {desenho.corpo.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={UVAS_CLARO_ESCURO}>
        {desenho.uvas.map((u, i) => (
          <circle key={i} cx={u.cx} cy={u.cy} r={u.r} />
        ))}
      </g>
    </>
  );
}

/** O símbolo sozinho — para a barra recolhida, avatar e cantos apertados. */
export function SimboloDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={SIMBOLO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <Partes desenho={SIMBOLO} />
    </svg>
  );
}

/** Símbolo + nome — para a barra aberta e a fachada de entrada. */
export function LogotipoDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={LOGOTIPO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <Partes desenho={LOGOTIPO.simbolo} />
      <g className={NOME_CLARO_ESCURO}>
        {LOGOTIPO.nome.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g className={SUFIXO_CLARO_ESCURO}>
        {LOGOTIPO.sufixo.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
```

Atualize o comentário do topo (linhas 9-10): "as cores seguem o TEMA: borgonha e ouro no claro, creme e ouro no escuro".

- [ ] **Step 5: `app/icon.tsx`**

Linhas 97-100 (dentro do ramo `marcaEhADoProduto`):

```tsx
          <svg viewBox={SIMBOLO.viewBox} width={lado} height={lado}>
            <g fill={CORES_DA_MARCA.claro.corpo}>
              {SIMBOLO.corpo.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <g fill={CORES_DA_MARCA.claro.uvas}>
              {SIMBOLO.uvas.map((u, i) => (
                <circle key={i} cx={u.cx} cy={u.cy} r={u.r} />
              ))}
            </g>
          </svg>
```

Troque o comentário das linhas 83-84 por: `// 78% da aresta: o viewBox do símbolo já é recortado pelo bbox real (margem de 4%).`

- [ ] **Step 6: Verificar**

Run: `pnpm exec vitest run tests/unit/marca-do-produto.test.tsx tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/barra-lateral-nao-perde-o-sticky.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. (`as cores do desenho` passa porque o multiconjunto de hex das classes é igual ao de `CORES_DA_MARCA`.)

Render de conferência (fora do app):

```bash
S=$(mktemp -d)
pnpm exec tsx -e '
import { SIMBOLO, LOGOTIPO, CORES_DA_MARCA as C } from "./lib/branding/desenho";
import { writeFileSync } from "node:fs";
const p = (d: readonly string[], f: string) => d.map((x) => `<path d="${x}" fill="${f}"/>`).join("");
const u = (us: { cx: number; cy: number; r: number }[], f: string) => us.map((x) => `<circle cx="${x.cx}" cy="${x.cy}" r="${x.r}" fill="${f}"/>`).join("");
writeFileSync(process.argv[1] + "/simbolo.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SIMBOLO.viewBox}">${p(SIMBOLO.corpo, C.claro.corpo)}${u([...SIMBOLO.uvas], C.claro.uvas)}</svg>`);
writeFileSync(process.argv[1] + "/logotipo.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGOTIPO.viewBox}">${p(LOGOTIPO.simbolo.corpo, C.claro.corpo)}${u([...LOGOTIPO.simbolo.uvas], C.claro.uvas)}${p(LOGOTIPO.nome, C.claro.nome)}${p(LOGOTIPO.sufixo, C.claro.sufixo)}</svg>`);
' "$S"
rsvg-convert -b '#f5f0e6' -w 512 "$S/simbolo.svg" -o evidence/bacco-rebrand/03-simbolo.png
rsvg-convert -b '#f5f0e6' -h 160 "$S/logotipo.svg" -o evidence/bacco-rebrand/03-logotipo.png
```
Expected: abrir os dois PNG e comparar com `docs/brand/bacco/preview.png` (B com folha e cacho no símbolo; "B + uvas · Bacco · ADEGA CRM" no logotipo). Símbolo centrado, sem corte.

Registre a conferência em `evidence/bacco-rebrand/03-revisao.md`, citando as duas imagens geradas no comando acima (símbolo e logotipo) pelo caminho exato em crase, com uma linha do que foi visto em cada uma. (Este plano não as cita pelo nome porque ainda não existem — o teste reprovaria o próprio plano.) Depois:

Run: `pnpm exec vitest run tests/unit/evidencia-citada.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/brand/bacco/texto-para-path.py lib/branding/desenho.ts components/branding/MarcaDoProduto.tsx app/icon.tsx tests/unit/marca-do-produto.test.tsx evidence/bacco-rebrand/03-*.png evidence/bacco-rebrand/03-revisao.md
git commit -m "feat(bacco): símbolo e logotipo Bacco em duas cores

desenho.ts passa a ser gerado dos SVGs oficiais (texto em paths) e o
símbolo ganha papel de cor para as uvas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Nome do produto e catraca de marca

**Files:**
- Modify: `tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts:57,66,71`
- Modify: `tests/unit/branding.test.ts:146,~304-311,~327-331,482-497`
- Modify: `lib/branding.ts:19`
- Modify: `lib/email/templates/ai-budget-alarm.tsx:35`
- Modify: `app/design/page.tsx:51,110`, `app/design/layout.tsx:7`
- Modify: `tests/e2e/logo-moldura-no-tema-escuro.spec.ts:522`

**Interfaces:**
- Produces: `DEFAULT_APP_NAME === "Bacco Adega CRM"`; `resolveBranding()` → `{ name: "Bacco Adega CRM", logoUrl: null, initial: "B" }`; `prefixoDoArquivo(DEFAULT_APP_NAME) === "bacco-adega-crm"`.

- [ ] **Step 1: Testes primeiro**

`tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts:57`:

```ts
const MARCA_DO_PRODUTO = "Bacco Adega CRM";
```

Linha 66, título do `it`: `"é Bacco Adega CRM — marca de produto do fork Bacco (spec §4.4); instalação personaliza pelo banco"`. No `it` seguinte, a inicial esperada (`initial: "D"`) vira `initial: "B"`.

`tests/unit/branding.test.ts:146`:

```ts
    expect(prefixoDoArquivo(DEFAULT_APP_NAME)).toBe("bacco-adega-crm");
```

`tests/unit/branding.test.ts:482-497` — o caso da DIVIDA:

```ts
  it("não sobra dívida de marca: o alarme de orçamento usa o nome do produto", () => {
    // No fork Bacco a última DIVIDA (assunto do alarme de orçamento com o nome
    // cravado) foi paga lendo DEFAULT_APP_NAME. Dívida nova aqui precisa de
    // decisão, não de mais uma linha na lista.
    const dividas = Object.entries(MARCA_CONGELADA)
      .filter(([, e]) => e.categoria === "DIVIDA")
      .map(([arquivo]) => arquivo);
    expect(dividas).toEqual([]);
  });
```

Em `MARCA_CONGELADA`, apague as entradas `"lib/email/templates/ai-budget-alarm.tsx"` (categoria DIVIDA, ~linha 304) e `"lib/branding.ts"` (categoria PADRAO, ~linha 326).

Run: `pnpm exec vitest run tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts tests/unit/branding.test.ts`
Expected: FAIL — `DEFAULT_APP_NAME` ainda é `DeskcommCRM` e os dois arquivos ainda têm marca.

- [ ] **Step 2: Implementar**

`lib/branding.ts:19`:

```ts
export const DEFAULT_APP_NAME = "Bacco Adega CRM";
```

`lib/email/templates/ai-budget-alarm.tsx` — import no topo e linha 35:

```ts
import { DEFAULT_APP_NAME } from "@/lib/branding";
```

```ts
  const subject = `Alerta IA: orçamento atingiu ${pctStr} — ${DEFAULT_APP_NAME}`;
```

`app/design/page.tsx:51` → `<h1>Bacco Adega CRM</h1>`; `:110` → `<h1>Showcase de Design System — Bacco Adega CRM</h1>`; `app/design/layout.tsx:7` → `title: "Design Showcase — Bacco Adega CRM",`.

`tests/e2e/logo-moldura-no-tema-escuro.spec.ts:522`:

```ts
    const marca = barra.getByRole("img", { name: "Bacco Adega CRM" });
```

- [ ] **Step 3: Verificar**

Run: `pnpm exec vitest run tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts tests/unit/branding.test.ts tests/unit/marca-do-produto.test.tsx && pnpm typecheck`
Expected: PASS. Se o `it("toda DIVIDA nomeia a fase que a resolve, e só DIVIDA tem fase")` falhar por lista vazia, leia a asserção e ajuste só para aceitar zero DIVIDAs — sem afrouxar a regra "só DIVIDA tem fase".

- [ ] **Step 4: Commit**

```bash
git add lib/branding.ts lib/email/templates/ai-budget-alarm.tsx app/design tests/unit/branding.test.ts tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts tests/e2e/logo-moldura-no-tema-escuro.spec.ts
git commit -m "feat(bacco): Bacco Adega CRM é o nome do produto

Fork com marca de produto (spec §4.4). A última DIVIDA da catraca de
marca é paga lendo DEFAULT_APP_NAME.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Funis exclusivos da vinícola

**Files:**
- Modify: `lib/onboarding/sugerir-funil.test.ts:19,36-54,57-69,105-111`
- Modify: `lib/onboarding/pacotes-de-funil.ts:34-131`
- Modify: `lib/onboarding/sugerir-funil.ts:44-52`
- Modify: `lib/i18n/dicionario.ts:5252-5258`
- Modify: `lib/agenda/tipos.ts:21-25` (só o comentário)

**Interfaces:**
- Produces: `PACOTES` com ids `clientes_vinicola`, `enoturismo_interesse`, `consumidor_vinho`, `generico` (nessa ordem); `escolherPacotePorTexto(texto)` reconhecendo os três.

- [ ] **Step 1: Teste primeiro**

`lib/onboarding/sugerir-funil.test.ts:19`:

```ts
const CTX = { nome: "Vinícola Serra Alta", oQueFaz: "Vendemos vinho para restaurantes e empórios" };
```

Linhas 36-54 (os três `it` do primeiro `describe`):

```ts
  it("reconhece o ramo pelas palavras que ele usaria", () => {
    expect(escolherPacotePorTexto("Vendemos para restaurantes e empórios").id).toBe("clientes_vinicola");
    expect(escolherPacotePorTexto("Recebemos turistas para degustação").id).toBe("enoturismo_interesse");
    expect(escolherPacotePorTexto("Loja virtual de vinhos para o consumidor").id).toBe("consumidor_vinho");
  });

  it("cai no genérico quando não reconhece — nunca em nada", () => {
    expect(escolherPacotePorTexto("xyzzy").id).toBe(PACOTE_PADRAO.id);
    expect(escolherPacotePorTexto("").id).toBe(PACOTE_PADRAO.id);
  });

  it("não se importa com acento nem caixa", () => {
    // O dono digita no celular, sem acento e em minúscula.
    expect(escolherPacotePorTexto("RESTAURANTES E EMPORIOS").id).toBe("clientes_vinicola");
    expect(escolherPacotePorTexto("degustacao").id).toBe("enoturismo_interesse");
  });
```

Linhas 57-69 (`describe("o pedido")`, os dois primeiros `it`):

```ts
  it("leva o exemplo do ramo, não uma descrição do formato em prosa", () => {
    // Descrever o formato produz JSON válido com conteúdo de manual de vendas.
    const { prompt } = pedidoDeSugestao(CTX, escolherPacotePorTexto("restaurante"));
    expect(prompt).toContain("Pedido fechado");
    expect(prompt).toContain("Vinícola Serra Alta");
    expect(prompt).toContain("Vendemos vinho para restaurantes e empórios");
  });

  it("manda não copiar o exemplo", () => {
    // Sem isto o modelo devolve o exemplo de volta, e toda vinícola do mundo
    // termina com o mesmo quadro.
    const { prompt } = pedidoDeSugestao(CTX, escolherPacotePorTexto("restaurante"));
    expect(prompt).toMatch(/não copie/i);
  });
```

Linhas 105-111 (`cai no pacote do RAMO`):

```ts
  it("cai no pacote do RAMO quando o modelo não responde JSON", async () => {
    // E o pacote é o de clientes da vinícola, não o genérico: quem já disse o que
    // faz não deve receber o quadro de "outro tipo de negócio".
    const s = await sugerirFunil(CTX, responde("Desculpe, não entendi."));
    expect(s.origem).toBe("pacote");
    expect(s.origem === "pacote" && s.pacote.id).toBe("clientes_vinicola");
    expect(s.origem === "pacote" && s.porque).toBeTruthy();
  });
```

(A fixture `BOM`, com "Agendamentos"/"Consulta marcada", é resposta simulada da IA e não depende dos pacotes — fica.)

Run: `pnpm exec vitest run lib/onboarding/sugerir-funil.test.ts`
Expected: FAIL — `expected 'generico' to be 'clientes_vinicola'`.

- [ ] **Step 2: `lib/onboarding/pacotes-de-funil.ts`**

Substitua os cinco pacotes de outros setores (ids `clinica`, `imobiliaria`, `servicos`, `curso`, `loja`, linhas 34-115) pelos três abaixo, mantendo o `generico` como último:

```ts
export const PACOTES: readonly PacoteDeFunil[] = [
  {
    id: "clientes_vinicola",
    comoSeApresenta: "Vender para restaurantes, empórios e distribuidores",
    proposta: {
      nome: "Clientes da vinícola",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo o negócio dele", passo: "qualifying" },
        { nome: "Enviei tabela ou amostra", passo: "qualified" },
        { nome: "Negociando pedido", passo: "negotiating" },
        { nome: "Pedido fechado", passo: "won" },
        { nome: "Não fechou", passo: "lost" },
      ],
    },
  },
  {
    id: "enoturismo_interesse",
    comoSeApresenta: "Enoturismo — visitas e degustações",
    proposta: {
      nome: "Visitas",
      etapas: [
        { nome: "Novo interessado", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Tirando dúvidas", passo: "qualifying" },
        { nome: "Quer visitar", passo: "qualified" },
        { nome: "Combinando data", passo: "negotiating" },
        { nome: "Encaminhado para reserva", passo: "won" },
        { nome: "Desistiu", passo: "lost" },
      ],
    },
  },
  {
    id: "consumidor_vinho",
    comoSeApresenta: "Vender vinho direto ao consumidor",
    proposta: {
      nome: "Vendas ao consumidor",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo o gosto", passo: "qualifying" },
        { nome: "Indiquei rótulos", passo: "qualified" },
        { nome: "Fechando pedido", passo: "negotiating" },
        { nome: "Pedido pago", passo: "won" },
        { nome: "Não comprou", passo: "lost" },
      ],
    },
  },
  {
    id: "generico",
```

(o bloco do `generico` segue inalterado até o `] as const;`). No cabeçalho do arquivo (linha 15), troque "o que o dono de uma clínica chama as coisas" por "o que o dono de uma vinícola chama as coisas".

- [ ] **Step 3: `lib/onboarding/sugerir-funil.ts:44-52`**

```ts
const PISTAS: Record<string, RegExp> = {
  clientes_vinicola:
    /\b(restaurant|emp[óo]ri|distribuid|revend|atacad|bares\b|bar\b|hot[ée]is|hotel|sommelier|carta de vinho)/i,
  enoturismo_interesse: /\b(enoturism|visita|degusta[çc]|turist|passeio|tour\b|harmoniza[çc])/i,
  consumidor_vinho: /\b(consumidor|cliente final|varej|loja virtual|e-?commerce|clube|delivery|venda direta)/i,
};
```

(O texto sem acento `EMPORIOS` casa `emp[óo]ri`; `degustacao` casa `degusta[çc]`.)

- [ ] **Step 4: Dicionário ES (`lib/i18n/dicionario.ts:5252-5258`)**

```ts
  // ─── Onboarding: funil — pacotes prontos (lib/onboarding/pacotes-de-funil.ts) ───
  "Vender para restaurantes, empórios e distribuidores": {
    es: "Vender a restaurantes, tiendas gourmet y distribuidores",
  },
  "Enoturismo — visitas e degustações": { es: "Enoturismo — visitas y degustaciones" },
  "Vender vinho direto ao consumidor": { es: "Vender vino directo al consumidor" },
  "Outro tipo de negócio": { es: "Otro tipo de negocio" },
```

- [ ] **Step 5: Comentário-espelho da agenda (`lib/agenda/tipos.ts:21-25`)**

```ts
/**
 * O que esta organização marca. Os códigos vêm do upstream e espelham o CHECK
 * da migration 0177; os nichos do onboarding do Bacco Adega CRM
 * (`lib/onboarding/pacotes-de-funil.ts`) são clientes da vinícola, enoturismo e
 * consumidor de vinho — visita e degustação caem em `visita`.
 */
```

- [ ] **Step 6: Verificar**

Run: `pnpm exec vitest run lib/onboarding tests/unit/i18n-espanhol-cobre-a-tela.test.ts && pnpm typecheck`
Expected: PASS — incluindo `proposta-de-funil.test.ts` (todos os pacotes passam no validador, sem jargão, ids únicos, `PACOTE_PADRAO.id === "generico"`).

- [ ] **Step 7: Commit**

```bash
git add lib/onboarding lib/i18n/dicionario.ts lib/agenda/tipos.ts
git commit -m "feat(bacco): funis exclusivos da vinícola no onboarding

Clientes da vinícola, enoturismo e consumidor de vinho substituem os
nichos de outros setores (spec §5.1).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Copy de outros setores → vinho (onboarding, agenda, catálogo, agente)

**Files:**
- Modify: `app/onboarding/welcome/_form.tsx:75,94`
- Modify: `app/app/agenda/_client.tsx:819`
- Modify: `app/app/products/_client.tsx:210` (depois do link da planilha modelo)
- Modify: `app/api/v1/products/import/route.ts:251-255`
- Modify: `app/actions/onboarding/createDefaultAgent.ts:40-47`
- Modify: `lib/i18n/dicionario.ts:4806-4811,6326`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: textos novos com chave ES.

- [ ] **Step 1: Welcome**

`app/onboarding/welcome/_form.tsx:75`:

```tsx
          {t("É o nome que aparece para o seu time e nos relatórios. Pode ser o nome da vinícola, da adega ou da loja.")}
```

`:94`:

```tsx
          placeholder={t("Ex.: vinícola com loja própria, venda para restaurantes e visitas com degustação")}
```

`lib/i18n/dicionario.ts:4806-4811` (substitui as duas entradas antigas):

```ts
  "É o nome que aparece para o seu time e nos relatórios. Pode ser o nome da vinícola, da adega ou da loja.": {
    es: "Es el nombre que aparece para tu equipo y en los reportes. Puede ser el nombre de la bodega, de la vinoteca o de la tienda.",
  },
  "O que vocês fazem?": { es: "¿A qué se dedican?" },
  "Ex.: vinícola com loja própria, venda para restaurantes e visitas com degustação": {
    es: "Ej.: bodega con tienda propia, venta a restaurantes y visitas con degustación",
  },
```

- [ ] **Step 2: Agenda**

`app/app/agenda/_client.tsx:819`:

```tsx
              placeholder={t("O cliente pediu para remarcar por telefone")}
```

`lib/i18n/dicionario.ts:6326`:

```ts
  "O cliente pediu para remarcar por telefone": { es: "El cliente pidió reprogramar por teléfono" },
```

- [ ] **Step 3: Catálogo — convenção de nome e planilha modelo**

`app/app/products/_client.tsx`, logo após o `</a>` do link `modelo-planilha` (dentro do mesmo ramo `podeEditar`), envolvendo os dois num fragmento:

```tsx
      {podeEditar ? (
        <>
          <a
            href="/api/v1/products/import"
            download="modelo-catalogo.csv"
            className="mb-4 inline-block text-xs text-muted-foreground underline"
            data-testid="modelo-planilha"
          >
            {t("Baixar planilha modelo")}
          </a>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("Coloque safra, uva e volume no nome (ex.: Malbec Reserva 2021 750ml) — é pelo nome que o atendente encontra o vinho.")}
          </p>
        </>
      ) : null}
```

`lib/i18n/dicionario.ts`, logo depois de `"Baixar planilha modelo"` (linha 7434):

```ts
  "Coloque safra, uva e volume no nome (ex.: Malbec Reserva 2021 750ml) — é pelo nome que o atendente encontra o vinho.": {
    es: "Pon cosecha, uva y volumen en el nombre (ej.: Malbec Reserva 2021 750ml) — es por el nombre que el asistente encuentra el vino.",
  },
```

`app/api/v1/products/import/route.ts:251-255`:

```ts
  const modelo = [
    "codigo,nome,marca,categoria,preco,custo,estoque",
    "MAL-RES-21,Malbec Reserva 2021 750ml,Vinícola Exemplo,Vinho tinto,129.90,62.00,24",
    "ESP-BRU-NV,Espumante Brut 750ml,Vinícola Exemplo,Espumante,89.90,41.00,36",
  ].join("\n");
```

- [ ] **Step 4: Agente padrão**

`app/actions/onboarding/createDefaultAgent.ts:40-47` — substitua o bloco `PROMPT_BODIES` inteiro por:

```ts
/**
 * A regra de adega vale para os três tons: o atendente de uma vinícola não pode
 * inventar rótulo nem prometer vaga de visita — reserva não é feita no CRM
 * (spec §2, §5.4).
 */
const REGRA_DA_ADEGA =
  " Indique só vinhos que existem no catálogo — nunca invente rótulo, safra, preço ou estoque." +
  " Para visitas e degustações, anote o interesse e diga que a equipe confirma data e vaga.";

const PROMPT_BODIES: Record<PromptTemplate, (onde: string) => string> = {
  ecommerce_friendly: (n) =>
    `Você atende os clientes de ${n}. Fale de forma calorosa e próxima, como alguém que gosta de ajudar. Cumprimente, entenda o que a pessoa precisa e ofereça opções claras. Confirme os detalhes antes de agir.${REGRA_DA_ADEGA}`,
  ecommerce_professional: (n) =>
    `Você atende os clientes de ${n}. Fale de forma objetiva, cordial e profissional. Vá direto ao ponto, sem parecer frio, e sempre termine indicando o próximo passo.${REGRA_DA_ADEGA}`,
  support_minimal: (n) =>
    `Você atende os clientes de ${n}. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.${REGRA_DA_ADEGA}`,
};
```

- [ ] **Step 5: Verificar**

Run: `pnpm exec vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts app/api/v1/products tests/unit/onboarding-agente-nao-publicado.test.ts tests/unit/onboarding-setup-ai-aviso.test.tsx tests/unit/agente-pausado-nao-atende.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS. Conferência: `grep -rnE "paciente|cl[ií]nica odontol|corretor de im" app/onboarding app/app/agenda/_client.tsx` sem resultado em texto visível.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding/welcome/_form.tsx app/app/agenda/_client.tsx app/app/products/_client.tsx app/api/v1/products/import/route.ts app/actions/onboarding/createDefaultAgent.ts lib/i18n/dicionario.ts
git commit -m "feat(bacco): textos de onboarding, agenda, catálogo e agente para vinícola

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Textos de produto (README, llms.txt, package, LICENSE, Dockerfile, docs/brand)

**Files:**
- Modify: `README.md` (bloco inicial até antes de `## ⚡ Instalar`)
- Modify: `public/llms.txt:1`
- Modify: `package.json` (`name`, `description`)
- Modify: `LICENSE`
- Modify: `Dockerfile:2-3,58`
- Modify: `docs/brand/README.md`
- Delete: `docs/brand/deskcomm-logo.svg`, `docs/brand/deskcomm-logo-dark.svg`, `docs/brand/deskcomm-icon.svg`

**Interfaces:**
- Consumes: nome e tagline das Global Constraints.

- [ ] **Step 1: `README.md`** — substitua tudo antes de `## ⚡ Instalar na sua VPS` por:

```markdown
# Bacco Adega CRM

**CRM exclusivo para vinícolas — relacionamento e atendimento inteligente.**

Capta e converte clientes da vinícola (restaurantes, empórios, distribuidores), interessados em
enoturismo e consumidores de vinho, com atendimento por WhatsApp e agentes de IA.

Produto da **Bacco Sistemas**, construído sobre o [DeskcommCRM](https://github.com/melgarafael/DeskcommCRM)
(licença MIT). Instalação e operação: ver `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` §6
até o kit Bacco (Plano 4) substituir as instruções abaixo, que ainda são as do upstream.

---
```

- [ ] **Step 2: `public/llms.txt:1`** → `# Bacco Adega CRM`, e a linha de descrição seguinte (se houver) → `CRM exclusivo para vinícolas, com atendimento por WhatsApp e agentes de IA. Baseado no DeskcommCRM (MIT).`

- [ ] **Step 3: `package.json`**

```json
  "name": "bacco-adega-crm",
  "version": "0.1.0",
  "private": true,
  "description": "Bacco Adega CRM — CRM exclusivo para vinícolas, com WhatsApp e agentes de IA. Baseado no DeskcommCRM (MIT).",
```

- [ ] **Step 4: `LICENSE`** — acrescente abaixo da linha `Copyright (c) 2026 Rafael Melgaço` (que fica):

```
Copyright (c) 2026 Bacco Sistemas
```

- [ ] **Step 5: `Dockerfile`** — linhas 2-3: `# Bacco Adega CRM — imagem de produção (Next.js standalone).` / `# Build: docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... -t bacco-adega-crm .`; linha 58: `org.opencontainers.image.title="Bacco Adega CRM"`.

- [ ] **Step 6: `docs/brand/README.md`** — substitua as seções sobre os SVGs Deskcomm por:

```markdown
## Marca do produto: Bacco Adega CRM

Fonte: `docs/brand/bacco/` — arte oficial (`bacco-adega-crm-*.svg`), `preview.png` e o board
`referencia-board-2026-09-15.png`. O app NÃO lê esses arquivos: a geometria vive em
`lib/branding/desenho.ts`, **gerado** por `docs/brand/bacco/texto-para-path.py` (instruções no
cabeçalho do script). Ao revisar a arte, troque os SVGs e rode o script de novo.

Cores: borgonha `#4a0e1f`, creme `#f5f0e6`, ouro `#c49a4a`, grafite `#2e2e2e`.
Fontes: Inter (interface), Playfair Display 600 (títulos), IBM Plex Mono (código).
```

e apague os três SVGs `docs/brand/deskcomm-*.svg`.

- [ ] **Step 7: Verificar e commitar**

Run: `pnpm gov:verify && pnpm test:shell`
Expected: PASS, exceto falhas já listadas na Task 0. Se `test:shell` citar o nome do pacote (`deskcomm-crm`), reverta só o `name` do `package.json` e registre o motivo no commit.

```bash
git add -A README.md public/llms.txt package.json LICENSE Dockerfile docs/brand
git commit -m "docs(bacco): textos de produto e fonte da marca

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Prova em tela (claro e escuro)

**Files:**
- Create: `tests/e2e/bacco-evidencia.spec.ts`
- Create: `evidence/bacco-rebrand/*.png`

**Interfaces:**
- Consumes: `loginComoAdmin(page, creds)` de `tests/e2e/helpers/login-admin.ts:102`; credenciais do `scripts/seed-e2e-credentials.ts`.

- [ ] **Step 1: Subir o ambiente e2e (mesma ordem do CI, `.github/workflows/e2e.yml:646-889`)**

```bash
npx supabase start
pnpm e2e:env
pnpm e2e:build
pnpm exec playwright install --with-deps chromium
pnpm exec tsx scripts/seed-e2e-credentials.ts
```
Expected: cada comando sai com 0; `.env.e2e` existe.

- [ ] **Step 2: Rodar as specs de marca existentes**

Run: `pnpm exec playwright test --workers=1 tests/e2e/icone-da-marca.spec.ts tests/e2e/marca-logo.spec.ts tests/e2e/logo-moldura-no-tema-escuro.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 3: Spec de evidência**

Create `tests/e2e/bacco-evidencia.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const TELAS = ["/login", "/app/inbox", "/app/kanban", "/app/products", "/admin/marca"] as const;
const TEMAS = ["light", "dark"] as const;

test.describe("evidência visual do rebrand Bacco", () => {
  for (const tema of TEMAS) {
    test(`telas principais no tema ${tema}`, async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem("deskcomm-theme", t), tema);
      await page.goto("/login");
      await page.screenshot({ path: `evidence/bacco-rebrand/08-login-${tema}.png`, fullPage: true });
      await loginComoAdmin(page, lerCreds());
      for (const rota of TELAS.slice(1)) {
        await page.goto(rota);
        await expect(page.locator("body")).toBeVisible();
        const nome = rota.replaceAll("/", "-").replace(/^-/, "");
        await page.screenshot({ path: `evidence/bacco-rebrand/08-${nome}-${tema}.png`, fullPage: true });
      }
    });
  }
});
```

(`lerCreds(): CredsE2E` e `loginComoAdmin(page, creds)` são exports de `tests/e2e/helpers/login-admin.ts:42,102`.)

Run: `pnpm exec playwright test --workers=1 tests/e2e/bacco-evidencia.spec.ts --reporter=list`
Expected: PASS e 10 PNG em `evidence/bacco-rebrand/`.

- [ ] **Step 4: Revisão visual**

Abra cada PNG. Conferir: logotipo Bacco na barra lateral (claro: borgonha/ouro; escuro: creme/ouro), botões primários borgonha distinguíveis de botões de erro, fundo creme no claro, títulos `h1` em Playfair, corpo em Inter, favicon com o B e as uvas. Anote em `evidence/bacco-rebrand/08-revisao.md` o que foi visto por tela, incluindo defeitos, **citando cada um dos 10 PNG pelo caminho exato em crase** (liste com `ls evidence/bacco-rebrand/08-*.png` e copie os nomes; glob não conta como citação).

Run: `pnpm exec vitest run tests/unit/evidencia-citada.test.ts`
Expected: PASS.

- [ ] **Step 5: Aprovação do dono**

Mostre os PNG ao dono. **Paleta, hover e tema escuro só são "prontos" com o ok dele** (spec §4.2). Ajuste pedido → volte à Task 1, Step 4.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/bacco-evidencia.spec.ts evidence/bacco-rebrand
git commit -m "test(bacco): evidência visual do rebrand nos dois temas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Fora deste plano

- Guardrail de maioridade → Plano 2. Enforcement da suspensão → Plano 3. Kit, imagens GHCR e deploy → Plano 4.
- Skill `deskcomm-cliente-novo` reescrita para os três públicos (spec §5.1): conteúdo de guia de operação, não bloqueia o produto — tarefa própria depois do Plano 1.
- `VISION.md`, `README.en.md`, `README.es.md`: documentos do upstream; reescrita junto com o Plano 4 (instruções de instalação mudam lá).
- Fonte Playfair nos e-mails: clientes de e-mail não carregam webfont de forma confiável; e-mails seguem com a pilha atual.
