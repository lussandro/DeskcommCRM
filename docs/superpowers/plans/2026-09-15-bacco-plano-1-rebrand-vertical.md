# Bacco Adega CRM — Plano 1: Rebrand + vertical vinícola (v2)

> **Status:** reescrito em 2026-09-15 a partir da v1 (⛔ recusada por refutador + `codex exec`).
> **Revisada em 2026-09-15 por refutador (experimentos em worktree) e `codex exec`: ambos
> "executável com correções"; correções aplicadas (v2.1).** Toda linha citada foi remedida contra o
> código do commit `2820a014` (branch `bacco`), não copiada da v1.
>
> **"Conteúdo da v1"** nos passos abaixo = o bloco de código literal do mesmo passo em
> `git show 2820a014:docs/superpowers/plans/2026-09-15-bacco-plano-1-rebrand-vertical.md`
> (script `texto-para-path.py`, pacotes de funil, `PROMPT_BODIES`, textos do README). Onde a v2
> diverge, vale a v2.

## As 12 correções da v1 e onde cada uma entrou

| # | Correção exigida | Onde |
|---|---|---|
| 1 | Neutros/fundo do upstream ficam; testes de algoritmo leem régua Sage congelada; grau do accent escuro por medição | Global Constraints, Task 1 |
| 2 | `test-validators.sh:1028` + `marca-emails.sh:115,140` juntos | Task 1 Step 7 |
| 3 | Playfair só em login/cadastro/onboarding, nunca `h1` global | Task 2 |
| 4 | Script mantido; omissão de separador/tagline declarada; spec §4.1; nits | Task 3 |
| 5 | Linhas extras de nome (`branding.test.ts:15,134`, `branding-marca-resolve:224`, `branding-saida:194,217`, `lgpd-pdf-meet:126`, `signup-journey:46`) | Task 4 |
| 6 | PISTAS reordenadas, casos de plural/feminino/sem acento, fallback de vinho | Task 5 |
| 7 | Slugs `ecommerce_*` ficam (declarado); conferência por grep larga | Task 6 |
| 8 | `llms.txt` inteiro; `Dockerfile.worker:11`, `Dockerfile.scheduler:12`; SVGs Deskcomm não são apagados | Task 7 |
| 9 | Verificação por exit code + rodapé `Test Files`/`Tests`/`Errors`; linha de base = CI | Global Constraints, Task 0 |
| 10 | Prova em tela sai do ambiente local e vai para a VPS | Task 10 |
| 11 | Fragmento `.changes/` + `release:conferir`; revisão dos textos de captação | Task 8, Task 6 Step 6 |
| 12 | `ACCENT_DO_PRODUTO` em `lib/branding/saida.ts:90` | Task 1 Step 8 |

## Decisões do dono que este plano aplica

- 2026-09-15: neutros e superfícies do upstream mantidos; creme só na marca (spec §4.2).
- 2026-09-15: gates no CI do GitHub; app, e2e e evidência visual só na VPS.
- 2026-09-15: Plano 1 inteiro nesta rodada (marca + vertical).
- 2026-09-15: texto de onboarding que só diz "vinícola"/"vinho" sem público → `clientes_vinicola`.
- 2026-09-15: prova em tela com conta QA criada por `/signup` na produção.

## Goal

Trocar a marca do produto DeskcommCRM pela Bacco Adega CRM (paleta de accent, fontes,
símbolo, nome) e os nichos do onboarding pelos três públicos da vinícola, com CI verde e prova
em tela na VPS.

**Spec:** `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` (§4, §5.1–§5.4, §7).
**ADR:** vault `projetos/_shared/decisoes/ADR-015-bacco-adega-crm-fork-deskcomm.md`.

## Global Constraints

- Branch `bacco` (tracking `origin/main` do fork). Push **sempre** `git push --no-tags origin bacco:main`.
- **Onde roda o quê:** local só comando puro (`pnpm exec vitest run <arquivos>`, `pnpm typecheck`,
  `pnpm lint`, `pnpm exec tsx` de medição, `rsvg-convert`, `bash -n`), com
  `source ~/.nvm/nvm.sh && nvm use 22`. `test:unit` inteiro, `test:db`, `test:shell`, build e
  imagens: **CI do GitHub**. App, e2e, telas: **VPS**.
- **Leitura de resultado de teste:** exit code é a autoridade; depois as linhas `Test Files`,
  `Tests` e `Errors` do rodapé. Nunca `grep FAIL` sozinho (`CLAUDE.md`, seção Testes). No CI,
  ler `Errors` no log do job `verify`.
- **Paleta (medida em 2026-09-15 com `rampaDeSemente` + `extrairRegua` + `medirPares` sobre o
  `globals.css` alterado em memória, script em Task 1 Step 0):**
  - Rampa accent `rampaDeSemente("#4a0e1f")`, graus 50…950:
    `#fbf2f3 #f1dddf #dab5ba #b9828b #985461 #752f3f #4a0e1f #40131e #39161d #33171d #291619`.
  - Claro: accent grau **600** (`#4a0e1f`), hover grau **500** (os graus 700–950 colapsam no 600),
    ring e outline seguem 500 (upstream). Medido: **0 reprovas**, accent×error sob dicromacia 0,2404.
  - Escuro: accent **300** (`#b9828b`), hover **200**, `--ring` 300, `:focus-visible` 300,
    `--color-accent-soft: rgba(152, 84, 97, 0.16)` (grau 400). Medido: **0 reprovas**;
    accent×error 0,0519 (piso 0,05); `derivarMarca` sinaliza
    `redundancia_nao_cromatica_necessaria/escuro/success` — o mesmo sinal que a Sage já dava.
  - Medições que descartam as outras opções: escuro em 400 = **12 reprovas** (accent, ring e
    outline × `surface-elevated` e × `accent-soft` compostos, 2,39–2,87 < 3). Escuro em 200 = 0
    reprovas, accent×error 0,1674, sem sinal — **alternativa se o dono reprovar o 300** na prova
    em tela (Task 10 Step 6).
  - `--color-bg`, `--color-text`, neutros e superfícies: **não mudam**.
- **Fontes:** Inter no corpo; Playfair Display 600 via utilitário `font-display` **só** nos 7
  `<h1>` de `app/(public)/login|signup` e nos 8 `<h2>` de título de passo do onboarding; IBM Plex Mono mantida.
- **Versão do fork:** `vAA.M.P` (Plano 4: primeira `v26.9.0`, tag anotada feita à mão). Esta entrega
  é **`v26.9.1`** — o `CHANGELOG.md`/`cortar-release.ts` seguem a numeração do upstream (`1.27.0` →
  `1.28.0`, medido), que o `sort -V` do `update.sh:45`/`agent.sh:111` poria **abaixo** da `v26.9.0`.
- Nome `Bacco Adega CRM`; inicial `B`; prefixo de arquivo `bacco-adega-crm`.
- **Não renomear** (identificador técnico ou contrato): `sb-deskcomm-auth`, `X-Deskcomm-*`,
  `deskcomm-theme`, `deskcomm-impersonate`, MCP `deskcomm-crm`, `SUFIXO_ICAL_UID`/`PREFIXO_PROPRIEDADE`,
  `lib/nuvemshop/config.ts`, `'X-Client-Id': 'deskcomm-worker'`, `deskcomm.show_ai_citations`,
  `deskcomm.designshowcase.v1`, `@keyframes deskcomm-card-pulse`, slugs `ecommerce_*` de
  `PromptTemplate`, `package.json` `version`.
- Todo texto novo passado a `t(...)`/`traduzir(...)` ganha entrada `es` em `lib/i18n/dicionario.ts`.
- Hex minúsculo no código.
- **Evidência:** toda imagem em `evidence/` citada pelo caminho completo, em crase, num `.md`
  versionado (`tests/unit/evidencia-citada.test.ts`).
- Commit termina com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 0: Linha de base

**Files:** Create `evidence/bacco-rebrand/00-linha-de-base.md`

- [ ] **Step 1: O código de produto é o do último CI verde**

```bash
cd /home/lussandro/Bacco-Crm && git status -sb
git diff --stat f52796ab HEAD -- app lib components hooks workers tests supabase hostgator-setup-kit scripts .github
```
Expected: árvore limpa; diff vazio (os commits depois de `f52796ab` são só `evidence/`/docs).
Linha de base = run `34990752387` (`ci` success, `evidence/bacco-deploy/01-ci.md`). Se o diff
não for vazio: parar e rodar o CI no HEAD antes de seguir.

- [ ] **Step 2: Retrato do que ainda diz "deskcomm"**

```bash
grep -rIniE "deskcomm" app components lib hooks workers public Dockerfile* \
  | grep -vE "\.test\.|/design/" > /tmp/deskcomm-antes.txt; wc -l /tmp/deskcomm-antes.txt
```
Registrar no `00-linha-de-base.md` o total e a classificação de cada arquivo (visível ao usuário ×
comentário × identificador técnico da lista "Não renomear"). Registrar o número que o comando der
(não copiar de nota). Visíveis conhecidos: `lib/branding.ts:19`, `lib/email/templates/ai-budget-alarm.tsx:35`
(template sem chamador — fica como DIVIDA, Task 4), `public/llms.txt`, `Dockerfile:2-3,58`,
`Dockerfile.worker:11`, `Dockerfile.scheduler:12`; `app/design/*` é tratado à parte (o grep o exclui).

- [ ] **Step 3: Commit** — `chore(bacco): linha de base do rebrand`.

---

### Task 1: Paleta borgonha no design system

**Files:**
- Create: `tests/fixtures/branding/regua-sage.ts`
- Modify: `tests/unit/branding-contraste.test.ts`, `tests/unit/branding-pares-pintados.test.ts`, `tests/unit/branding-rampa.test.ts`, `tests/unit/branding-marca-resolve.test.ts:265-268`
- Modify: `app/globals.css:28,50-60,64,265,346-356,357,359,360,414,731`
- Modify (gerado): `lib/branding/regua-do-produto.ts`
- Modify: `supabase/templates/confirmation.html:27`, `supabase/templates/recovery.html:22`, `hostgator-setup-kit/marca-emails.sh:115,140`, `hostgator-setup-kit/test-validators.sh:1028`
- Modify (comentários/exemplos): `lib/branding/rampa.ts:13`, `lib/branding/saida.ts:79-80`, `lib/env.ts:339`, `.env.example:329`

- [ ] **Step 0: Reproduzir a medição da paleta**

Script versionado em `docs/superpowers/plans/anexos/medir-grau-escuro.ts`: altera o `globals.css`
**em memória** e imprime reprovas por tema, accent×error e motivos de `derivarMarca` para os graus
escuros 400/300/200/100/50.

Run: `pnpm exec tsx docs/superpowers/plans/anexos/medir-grau-escuro.ts`
Expected: os números das Global Constraints. Número diferente = parar e reportar.

- [ ] **Step 1: Congelar a régua Sage ANTES de tocar o CSS**

```bash
mkdir -p tests/fixtures/branding
pnpm exec tsx -e '
import { REGUA_DO_PRODUTO } from "./lib/branding/regua-do-produto";
const cab = `/**
 * Régua SAGE congelada — controle positivo dos testes de ALGORITMO de branding.
 *
 * É o \`REGUA_DO_PRODUTO\` do upstream (DeskcommCRM v1.27.0) no momento em que o fork
 * Bacco trocou a paleta. Os testes de algoritmo (contraste, reconciliação, caminhada,
 * pares pintados) têm números medidos contra a Sage; ler o globals.css do produto
 * faria colar números novos em controle positivo, o que desarma o teste.
 * Asserções sobre a paleta DO PRODUTO leem o globals.css, nunca este arquivo.
 * NÃO regenere.
 */
import type { Regua } from "@/lib/branding/contraste";

export const REGUA_SAGE: Regua = `;
process.stdout.write(cab + JSON.stringify(REGUA_DO_PRODUTO, null, 2) + ";\n");
' > tests/fixtures/branding/regua-sage.ts
grep -c "#506d48" tests/fixtures/branding/regua-sage.ts
```
Expected: `≥1`.

- [ ] **Step 2: Repontar os testes de algoritmo para a fixture (CSS ainda Sage — tudo verde)**

`tests/unit/branding-contraste.test.ts` (hoje `:30-31` lê `REGUA = extrairRegua(CSS)` para o arquivo inteiro):

- `const REGUA_DO_CSS = extrairRegua(CSS);` e `const REGUA: Regua = REGUA_SAGE;` com comentário
  apontando para o cabeçalho da fixture.
- Usam `REGUA_DO_CSS` (extração e produto): `it` de `:59` ("acha os dois temas"), `:71`, `:84`,
  `:94`. Todo o resto do arquivo usa `REGUA` (Sage) — inclusive `:117` "razões medidas à mão",
  `:127` "a Sage inteira… cabe nos pisos", `:218` caminhada, `:306`/`:325` reconciliação,
  `:350` `movimentosNoRun`, `:386`/`:399` acromática e "separável do neutro".
- Novo `it` ao lado de `:127`: `"a paleta do produto, como está no CSS, cabe nos pisos"` — mesmo
  corpo, lendo `REGUA_DO_CSS`. É o gate real da borgonha.
- `:61` fica `#506d48` neste passo (muda no Step 4).

`tests/unit/branding-pares-pintados.test.ts`:

- `const REGUA = REGUA_SAGE;` (`:40`) e `corDe` (`:58`) passa `REGUA_SAGE` a `resolverMarca` em
  vez de `REGUA_DO_PRODUTO`. Todos os `it` existentes seguem Sage (incluindo `:245` anel de foco,
  `:312` caminhada = 13, `:340` "a Sage reproduz, pintada").
`tests/unit/branding-marca-resolve.test.ts:265-268` ("nenhum motivo carrega o hex da marca"): é teste
de algoritmo — passar `REGUA_SAGE` onde hoje passa `REGUA_DO_PRODUTO`. (Medido pelo refutador: sobre a
régua borgonha `#0f172a` não gera motivo e o `it` cai em `expected 0 to be greater than 0`.)

`tests/unit/branding-rampa.test.ts`: novo `it` de CONTROLE, ao lado de `:116`:
`"reproduz os 11 stops Sage congelados a partir de #506d48 com Δ ≤ 2/255 por canal"`, lendo
`REGUA_SAGE.rampaDoProduto` (mesmo corpo do `it` de `:116`). É o que continua calibrando o algoritmo
depois que o CSS deixa de ser Sage.

Run: `pnpm exec vitest run tests/unit/branding-contraste.test.ts tests/unit/branding-pares-pintados.test.ts tests/unit/branding-rampa.test.ts tests/unit/branding-marca-resolve.test.ts`
Expected: exit 0 — prova de que a fixture é equivalente à régua de hoje.

- [ ] **Step 3: Âncoras do PRODUTO para borgonha (vão falhar)**

- `branding-contraste.test.ts:61` → `toBe("#4a0e1f")`; `:81` (anel de foco do escuro) → `indice: 3`.
- `branding-rampa.test.ts`: `:51` renomear `stopsSageDoCss` → `stopsDoProdutoNoCss`; `:113` →
  `#4a0e1f`; `:116-117` → título `"reproduz os 11 stops do produto a partir de #4a0e1f…"` e
  `rampaDeSemente("#4a0e1f")`. `:68`, `:76` (entradas de `normalizarHex`) ficam.
- `branding-pares-pintados.test.ts`: novo `describe("a marca do produto, sem instalação configurada")`:
  `resolverMarca` com `APP_ACCENT_HEX: "#4a0e1f"` sobre `REGUA_DO_PRODUTO` → `deslocamento` 0 nos dois
  temas e zero pares reprovados (sem números colados). Medido: antes do CSS mudar dá `expected -1 to be +0`.

Run: mesmo comando. Expected: falha só nesses `it`/`describe`.

- [ ] **Step 4: `app/globals.css`**

- `:28` → `Bacco Adega CRM — Design System tokens (accent Borgonha · density Aerada)`.
- `:root` `:50-60` e `[data-theme="dark"]` `:346-356`: a rampa das Global Constraints
  (`--color-accent-50` … `--color-accent-950`); comentário do bloco → `Accent — Borgonha Bacco (rampaDeSemente("#4a0e1f"))`.
- `:64` e `:265`: `--color-accent-hover: var(--color-accent-500);`
- `:357`: `--color-accent: var(--color-accent-300);`
- `:359`: `--color-accent-soft: rgba(152, 84, 97, 0.16);`
- `:360`: `--color-accent-hover: var(--color-accent-200);`
- `:414`: `--ring: var(--color-accent-300);`
- `:731`: `outline-color: var(--color-accent-300);`
- **Não tocar:** `:35,:41,:67,:76,:164,:253,:257,:266,:275,:311,:331,:337,:363,:372`.

- [ ] **Step 5: Regenerar a régua**

Run: `pnpm exec vitest run tests/unit/branding-regua-do-produto.test.ts`
Expected: FAIL com `Substitua o objeto de lib/branding/regua-do-produto.ts por:` + JSON. Colar como
valor de `REGUA_DO_PRODUTO` (mantendo cabeçalho e `import type`). Rodar de novo → PASS.

- [ ] **Step 6: Família de branding**

```bash
pnpm exec vitest run tests/unit/branding-*.test.ts tests/unit/tailwind-tokens.test.ts \
  tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/marca-do-produto.test.tsx \
  lib/branding > /tmp/vt-t1.log 2>&1; echo "exit=$?"
grep -aE "^ *(Test Files|Tests|Errors) " /tmp/vt-t1.log
```
Regras:
1. Falha em `it` que lê `REGUA_SAGE` = a fixture vazou → **parar**.
2. Falha de piso em `"a paleta do produto… cabe nos pisos"` = divergência da medição do Step 0 → **parar e reportar** (não trocar grau sem medir).
3. Falha que compara hex/razão do produto com Sage (ex.: comentário `:88` sobre `rgba(130,160,119)`) → atualizar para o valor medido e explicar no `it`.

Expected: exit 0; `Errors` ausente.

- [ ] **Step 7: Fallback de cor dos e-mails de acesso (as quatro pontas juntas)**

- `supabase/templates/confirmation.html:27` e `recovery.html:22`: `background: #506d48;` → `background: #4a0e1f;`
- `hostgator-setup-kit/marca-emails.sh:140`: `*) ACCENT="#4a0e1f";;`; comentário `:115` → grau 600 da rampa borgonha.
- `hostgator-setup-kit/test-validators.sh:1028`: `'background: #4a0e1f; background: #4a0e1f'`.

Run: `bash -n hostgator-setup-kit/marca-emails.sh hostgator-setup-kit/test-validators.sh && pnpm exec vitest run tests/unit/branding.test.ts lib/email`
Expected: exit 0. `test:shell` é conferido no CI (Task 9).

- [ ] **Step 8: Comentários que viraram falsos**

- `lib/branding/rampa.ts:13`: a régua do produto hoje é borgonha; a tabela de lightness de `:206`
  foi calibrada na Sage e continua sendo calibração do algoritmo (não mexer nos números).
- `lib/branding/saida.ts:79-80`: grau 600 da rampa do produto é `#4a0e1f`; remover o número de
  linha `(:34)`/`(:175)` (envelhece) — `ACCENT_DO_PRODUTO` (`:90`) continua lendo a régua.
- `lib/env.ts:339` e `.env.example:329`: exemplo `#4a0e1f`.

- [ ] **Step 9:** `pnpm typecheck && pnpm lint` → exit 0. Commit `feat(bacco): accent borgonha no design system` com o corpo: rampa, graus medidos (claro 600/500, escuro 300/200), régua Sage congelada como controle.

---

### Task 2: Inter na interface, Playfair nos títulos públicos

**Files:**
- Modify: `app/layout.tsx:2,28-33,281`, `app/globals.css:535-536,701`, `tests/unit/tailwind-tokens.test.ts:89`
- Modify (classe `font-display`): `app/(public)/login/page.tsx:33`, `login/forgot/page.tsx:23`,
  `login/reset/page.tsx:21`, `login/recovery/page.tsx:28`, `login/mfa/page.tsx:34`,
  `app/(public)/signup/page.tsx:62,85`, `app/onboarding/welcome/page.tsx:24`,
  `funil/page.tsx:33`, `setup-ai/page.tsx:49`, `connect-whatsapp/page.tsx:33`,
  `connect-nuvemshop/page.tsx:14`, `invite-team/page.tsx:15`, `testar/page.tsx:39`,
  `done/_client.tsx:26`

- [ ] **Step 1: Teste primeiro** — `tailwind-tokens.test.ts:89`:
  `const DE_FORA_DO_CSS = ["--font-inter", "--font-playfair", "--font-mono"];`
  Run `pnpm exec vitest run tests/unit/tailwind-tokens.test.ts` → FAIL.

- [ ] **Step 2: `app/layout.tsx`** — `:2` `import { IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";`;
  `:28-33` troca o bloco `atkinson` por `inter` (`subsets: ["latin","latin-ext"]`, `display: "swap"`,
  `variable: "--font-inter"`) e `playfair` (mesmo, `weight: ["600"]`, `variable: "--font-playfair"`);
  `:281` `` className={`${inter.variable} ${playfair.variable} ${plexMono.variable}`} ``.
  (Variável do next/font com nome **diferente** do token `--font-display`, para o `@theme inline`
  não referenciar a si mesmo.)

- [ ] **Step 3: `app/globals.css`** — `:535` `--font-sans: var(--font-inter), ui-sans-serif, …`;
  logo abaixo, `--font-display: var(--font-playfair), Georgia, "Times New Roman", serif;`;
  `:701` `font-family: var(--font-inter), ui-sans-serif, …`. **Sem** regra global de `h1`.

- [ ] **Step 4: Aplicar `font-display`** nos 15 elementos listados em Files (acrescentar a classe
  ao `className` existente). Conferência (exclui o showcase `app/design`, que tem `--ds-font-display`
  próprio): `grep -rnE 'className="[^"]*\bfont-display\b' app --include=*.tsx | grep -v app/design | wc -l` → 15.

- [ ] **Step 5:** `pnpm exec vitest run tests/unit/tailwind-tokens.test.ts && pnpm typecheck && pnpm lint`
  → exit 0; `grep -rn "font-atkinson" app lib components tests --include='*.ts*' --include='*.css' | grep -v app/design`
  vazio (medido: `app/design/lib/fonts.ts`, `variant-context.tsx`, `SectionTypography.tsx` citam a Atkinson
  do showcase e ficam).
  Commit `feat(bacco): Inter na interface e Playfair nos títulos públicos`.

---

### Task 3: Símbolo e logotipo Bacco em duas cores

**Files:**
- Create: `docs/brand/bacco/texto-para-path.py`
- Modify (gerado): `lib/branding/desenho.ts`
- Modify: `components/branding/MarcaDoProduto.tsx:1,9-10,29-41,49-89`, `app/icon.tsx:4,83-84,97-100`, `tests/unit/marca-do-produto.test.tsx:141-145`
- Modify: `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` §4.1 (linha do logotipo)

O conteúdo dos Steps 1–5 é o da v1 (script `texto-para-path.py`, contrato `SIMBOLO`/`LOGOTIPO`/
`CORES_DA_MARCA` com papéis `corpo`/`uvas`/`nome`/`sufixo`, `Partes`, favicon), já **medido** pelo
refutador: roda, gera 16 KB, typecheck verde, render conferido. Mudanças em relação à v1:

- **Omissão declarada:** o logotipo da barra usa `bacco-adega-crm-logo-bordo.svg` **sem** a linha
  separadora e **sem** a tagline (ilegíveis na altura da barra) e sem a folha (o SVG horizontal não
  a tem). Escrever isso no cabeçalho gerado pelo script e na spec §4.1.
- `MarcaDoProduto.tsx:9-10`: comentário "as cores seguem o TEMA: borgonha e ouro no claro, creme e ouro no escuro".
- `desenho.ts` é gerado inteiro: o comentário de `CORES_DA_MARCA` (hoje "sálvia 600/400", `:96-99`) sai do script.
- `CLASSES_DE_COR` com as chaves `corpo`, `uvas`, `nome`, `sufixo` — os `it` de `:113` e `:121`
  iteram as chaves, então passam sem edição se classes e paleta baterem.

- [ ] **Step 1: Teste do favicon** (`:141-145` → `SIMBOLO\.corpo\.map`, `SIMBOLO\.uvas\.map`) → FAIL.
- [ ] **Step 2: Script** (texto integral da v1, Task 3 Step 2, com o cabeçalho acrescido da omissão).
- [ ] **Step 3: Gerar** — `python3 -c "import fontTools"` (medido: 4.63.0 instalado); baixar as duas
  fontes OFL para `mktemp -d`; `python3 docs/brand/bacco/texto-para-path.py "$FONTES" > lib/branding/desenho.ts`.
  Expected: 3 `export const`, sem `<text`.
- [ ] **Step 4: `MarcaDoProduto.tsx`** e **Step 5: `app/icon.tsx`** — como na v1.
- [ ] **Step 6: Verificar**
  `pnpm exec vitest run tests/unit/marca-do-produto.test.tsx tests/unit/logo-nao-some-no-tema-escuro.test.ts tests/unit/barra-lateral-nao-perde-o-sticky.test.ts && pnpm typecheck && pnpm lint` → exit 0.
  Render de conferência com `rsvg-convert` (script da v1) para `evidence/bacco-rebrand/03-simbolo.png`
  e `evidence/bacco-rebrand/03-logotipo.png`; comparar com `docs/brand/bacco/preview.png`; registrar em
  `evidence/bacco-rebrand/03-revisao.md` citando os dois caminhos. `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0.
- [ ] **Step 7:** Commit `feat(bacco): símbolo e logotipo Bacco em duas cores`.

---

### Task 4: Nome do produto

**Files:**
- Modify: `lib/branding.ts:19`, `app/design/page.tsx:51,110`, `app/design/layout.tsx:7`,
  `docs/superpowers/specs/2026-09-15-bacco-adega-crm-design.md` §4.4
- Modify (achado na execução): `hostgator-setup-kit/install.sh:1261` (padrão do `APP_NAME`) e
  `hostgator-setup-kit/marca-emails.sh:112` (fallback do nome nos e-mails de acesso) → "Bacco Adega CRM".
  Mensagens de operador do kit que citam "DeskcommCRM" e têm teste em `test-validators.sh`
  (`install.sh:1018-1041`, `diagnostico.sh`, `supabase-provision.sh`) ficam para o plano de docs/kit.
- Modify (testes): `tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts:57,67,79`,
  `tests/unit/branding.test.ts:15,134,326-331`,
  `tests/unit/branding-marca-resolve.test.ts:224`, `tests/unit/branding-saida.test.ts:194,217`,
  `tests/unit/lgpd-pdf-meet.test.ts:126`, `tests/e2e/signup-journey.spec.ts:46`,
  `tests/e2e/logo-moldura-no-tema-escuro.spec.ts:522`

- [ ] **Step 1: Testes primeiro**
  - `marca-do-produto-nao-se-edita-no-codigo.test.ts`: `:57` `"Bacco Adega CRM"`; `:67` título
    `"é Bacco Adega CRM — marca de produto do fork Bacco (spec §4.4); instalação personaliza pelo banco"`; `:79` `initial: "B"`.
  - `branding.test.ts`: `:15` `initial: "B"`; `:134` `"bacco-adega-crm"`; remover de `MARCA_CONGELADA`
    **só** a entrada `lib/branding.ts` (`:326-331`, PADRAO). A DIVIDA `ai-budget-alarm.tsx` (`:304-311`)
    e os `it` de `:482`/`:499` **ficam como estão**: `buildBudgetAlarmEmail` não tem chamador (medido:
    `grep -rn buildBudgetAlarmEmail app lib workers scripts` → só a definição), e trocar o assunto por
    `DEFAULT_APP_NAME` violaria "saída sem DOM usa `marcaDaSaida()`" (`CLAUDE.md`, Marca própria).
    Quem ligar o alarme paga a dívida com `marcaDaSaida()`.
  - `branding-marca-resolve.test.ts:224`, `branding-saida.test.ts:194,217` → `"Bacco Adega CRM"`.
  - `lgpd-pdf-meet.test.ts:126` → `"Bacco Adega CRM"` (continua provando que o PDF de LGPD não leva a marca do produto).
  - `signup-journey.spec.ts:46` → `"Boas-vindas ao Bacco Adega CRM"`; `logo-moldura-no-tema-escuro.spec.ts:522` → `name: "Bacco Adega CRM"`.

  Run: `pnpm exec vitest run tests/unit/marca-do-produto-nao-se-edita-no-codigo.test.ts tests/unit/branding.test.ts tests/unit/branding-marca-resolve.test.ts tests/unit/branding-saida.test.ts tests/unit/lgpd-pdf-meet.test.ts` → FAIL.

- [ ] **Step 2: Implementar**
  - `lib/branding.ts:19` `export const DEFAULT_APP_NAME = "Bacco Adega CRM";`
  - `app/design/page.tsx:51,110`, `app/design/layout.tsx:7` → "Bacco Adega CRM".
  - Spec §4.4: registrar que o alarme de orçamento fica como DIVIDA (motivo acima), que a linha certa do
    prefixo é `branding.test.ts:134`, e que `README*`/`VISION.md` saíram para o plano de docs.

- [ ] **Step 3:** mesmo run do Step 1 + `tests/unit/marca-do-produto.test.tsx` + `pnpm typecheck` → exit 0.
  Commit `feat(bacco): Bacco Adega CRM é o nome do produto`.

---

### Task 5: Funis exclusivos da vinícola

**Files:**
- Modify: `lib/onboarding/pacotes-de-funil.ts:15,34-115`, `lib/onboarding/sugerir-funil.ts:44-66`, `lib/onboarding/sugerir-funil.test.ts:20,35-54,57-69,105-111`
- Modify: `lib/i18n/dicionario.ts:5252-5258`, `lib/agenda/tipos.ts:21-25` (comentário)

- [ ] **Step 1: Teste primeiro** (`sugerir-funil.test.ts`)
  - `:20` `CTX = { nome: "Vinícola Serra Alta", oQueFaz: "Vendemos vinho para restaurantes e empórios" }`.
  - `:35-54` → um `it.each` com os casos (entrada → id; os 17 medidos pelo refutador contra as regex do Step 3, 0 divergências):

    | Entrada | id |
    |---|---|
    | `Vendemos para restaurantes e empórios` | `clientes_vinicola` |
    | `distribuidora de vinhos` | `clientes_vinicola` |
    | `Venda para hotéis e bares` | `clientes_vinicola` |
    | `RESTAURANTES E EMPORIOS` | `clientes_vinicola` |
    | `Recebemos turistas para degustação` | `enoturismo_interesse` |
    | `degustacoes e visitas guiadas` | `enoturismo_interesse` |
    | `enoturismo` | `enoturismo_interesse` |
    | `Loja virtual de vinhos para o consumidor` | `consumidor_vinho` |
    | `clube de assinatura com degustação` | `consumidor_vinho` |
    | `vinícola com visitas e loja virtual` | `consumidor_vinho` |
    | `vinícola` | `clientes_vinicola` |
    | `VINICOLA` | `clientes_vinicola` |
    | `vendemos vinho` | `clientes_vinicola` |
    | `xyzzy` / `` (vazio) / `consultório odontológico` | `generico` |

  - `:57-69` e `:105-111`: como na v1 (`"Pedido fechado"`, `"Vinícola Serra Alta"`, pacote do ramo = `clientes_vinicola`).

  Run `pnpm exec vitest run lib/onboarding/sugerir-funil.test.ts` → FAIL.

- [ ] **Step 2: `pacotes-de-funil.ts`** — os três pacotes da v1 (Task 5 Step 2) no lugar de
  `clinica`/`imobiliaria`/`servicos`/`curso`/`loja` (`:34-115`), `generico` intacto e último; `:15` "dono de uma vinícola".

- [ ] **Step 3: `sugerir-funil.ts`** — `escolherPacotePorTexto` (`:61`) é **primeiro que casa, na
  ordem de `PISTAS`**. Ordem e regex:

```ts
const PISTAS: Record<string, RegExp> = {
  clientes_vinicola:
    /\b(restaurant|emp[óo]ri|distribuid|revend|atacad|bares\b|bar\b|hot[ée]is|hotel|sommelier|carta de vinho)/i,
  consumidor_vinho:
    /\b(consumidor|cliente final|varej|loja virtual|loja online|e-?commerce|clube|assinatura|delivery|venda direta)/i,
  enoturismo_interesse: /\b(enoturism|visita|degusta[çc]|turist|passeio|tour\b|harmoniza[çc]|vindima)/i,
};

/** Quem só diz que é vinícola, sem nomear o público, recebe o B2B (decisão do dono, 2026-09-15). */
const PISTA_DE_VINICOLA = /\b(vin[íi]col|vinh|adega)/i;
```

  e, no fim do laço de `escolherPacotePorTexto`, antes de `return PACOTE_PADRAO`:
  `if (PISTA_DE_VINICOLA.test(texto)) { const p = PACOTES.find((x) => x.id === "clientes_vinicola"); if (p) return p; }`.
  Atualizar o comentário de desempate (`:56-58`) com a ordem e o porquê (canal de venda explícito vence visita).

- [ ] **Step 4: Dicionário** — `:5252-5258`: remover as 5 entradas antigas, incluir as 3 novas da v1
  (Task 5 Step 4), manter `"Outro tipo de negócio"`.
- [ ] **Step 5: `lib/agenda/tipos.ts:21-25`** — comentário da v1.
- [ ] **Step 6:** `pnpm exec vitest run lib/onboarding tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/selecao-por-pacote.test.ts && pnpm typecheck` → exit 0.
  Commit `feat(bacco): funis exclusivos da vinícola no onboarding`.

---

### Task 6: Copy de outros setores → vinho

**Files:**
- Modify: `app/onboarding/welcome/_form.tsx:75,94`, `app/app/agenda/_client.tsx:819`,
  `app/app/products/_client.tsx:203-211`, `app/api/v1/products/import/route.ts:251-255`,
  `app/actions/onboarding/createDefaultAgent.ts` (`PROMPT_BODIES`), `lib/i18n/dicionario.ts:4806-4811,6326,7434`

- [ ] **Steps 1–4:** textos, dicionário, planilha modelo e `PROMPT_BODIES` com `REGRA_DA_ADEGA` —
  conteúdo da v1 (Task 6 Steps 1–4), nas linhas remedidas acima. As chaves de `PROMPT_BODIES`
  continuam `ecommerce_friendly`/`ecommerce_professional`/`support_minimal`: são o id técnico de
  `PromptTemplate` gravado em versão de agente; renomear exigiria migration e não muda o que o usuário lê.
- [ ] **Step 5:** `pnpm exec vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts app/api/v1/products tests/unit/onboarding-agente-nao-publicado.test.ts tests/unit/onboarding-setup-ai-aviso.test.tsx tests/unit/agente-pausado-nao-atende.test.ts && pnpm typecheck && pnpm lint` → exit 0.
- [ ] **Step 6: Conferência larga e captação**

```bash
grep -rnIE "paciente|cl[ií]nica|odontol|corretor|imobili|e-?commerce|iPhone|Perfume" app components lib \
  --include=*.ts --include=*.tsx | grep -vE "\.test\.|/design/" > /tmp/copy-restante.txt; wc -l /tmp/copy-restante.txt
```
  Classificar cada ocorrência em `evidence/bacco-rebrand/06-copy-restante.md`: **texto visível** (corrigir
  aqui) × comentário × regex/corpus (`lib/opt-out/deteccao.ts`) × id técnico. Captação (webhooks, RD
  Station, planilha de leads, ads) — medido em 2026-09-15:
  `grep -rnIiE "paciente|cl[ií]nica|imobili|corretor|odonto|dentist|im[óo]ve(l|is)" app/app/webhooks app/app/ads app/app/leads app/app/contacts app/app/integrations`
  → zero ocorrências; repetir e registrar o resultado.
- [ ] **Step 7:** Commit `feat(bacco): textos de onboarding, agenda, catálogo e agente para vinícola`.

---

### Task 7: Textos de produto

**Files:** `README.md`, `public/llms.txt`, `package.json:2`, `LICENSE`, `Dockerfile:2-3,58`,
`Dockerfile.worker:11`, `Dockerfile.scheduler:12`, `docs/brand/README.md`

- [ ] **Step 1: `README.md`** — bloco inicial da v1 (Task 7 Step 1).
- [ ] **Step 2: `public/llms.txt`** — reescrever **inteiro** (hoje `:1-27` descrevem o upstream e
  linkam `github.com/melgarafael/DeskcommCRM`): título, descrição do Bacco Adega CRM (CRM exclusivo
  para vinícolas; WhatsApp + agentes de IA; três públicos), fatos técnicos que continuam verdadeiros, e
  **uma** linha de atribuição ao DeskcommCRM (MIT). Sem link para o repositório privado do fork.
- [ ] **Step 3: `package.json`** — antes, `grep -rnE "package\.json" tests scripts hostgator-setup-kit .github | grep -iE "\.name|\"name\"|\bname\b"`;
  se algum teste/script ler o `name`, parar e reportar. (`deskcomm-crm` também aparece como nome do MCP em
  `branding.test.ts:234,240` e do contêiner em `scripts/test-db.sh` — não é o pacote, fica.) Senão `"name": "bacco-adega-crm"` e
  `description` da v1. `version` **não muda**.
- [ ] **Step 4: `LICENSE`** — acrescentar `Copyright (c) 2026 Bacco Sistemas` abaixo da linha original.
- [ ] **Step 5: Dockerfiles** — `Dockerfile:2-3` (comentário e `-t bacco-adega-crm`), `:58`
  `title="Bacco Adega CRM"`; `Dockerfile.worker:11` `title="Bacco Adega CRM worker"`; `Dockerfile.scheduler:12` `title="Bacco Adega CRM scheduler"`.
- [ ] **Step 6: `docs/brand/README.md`** — seção da v1 (Task 7 Step 6). **Não apagar**
  `docs/brand/deskcomm-*.svg`: `README.es.md:6-7` e `docs/brand/og-card.html` os referenciam.
- [ ] **Step 7:** `pnpm lint && pnpm exec vitest run tests/unit/branding.test.ts` → exit 0.
  Commit `docs(bacco): textos de produto e fonte da marca`.

---

### Task 8: Fragmento de release

**Files:** Create `.changes/bacco-marca-e-vinicola.md`

- [ ] **Step 1:**

```markdown
---
impacto: capacidade_nova
secao: alterado
titulo: Marca Bacco Adega CRM e funis de vinícola
---

A interface passa a ter a marca Bacco Adega CRM: accent borgonha, símbolo com as uvas,
Inter na interface e Playfair Display nos títulos de entrada. O onboarding sugere os
funis de clientes da vinícola, enoturismo e consumidor de vinho. Instalação existente
não precisa fazer nada; marca configurada em Configurações › Marca continua valendo.
```

- [ ] **Step 2:** `pnpm exec vitest run tests/unit/fragmentos-de-release.test.ts && pnpm release:conferir` → exit 0
  (valida a FORMA). O número que o `release:conferir` imprime (`1.28.0`, medido) **não é usado** — ver
  Global Constraints, Versão do fork. Commit `chore(bacco): fragmento de release do rebrand`.

---

### Task 9: CI, tag e imagens

- [ ] **Step 1:** `git push --no-tags origin bacco:main`.
- [ ] **Step 2:** acompanhar `ci`, `perf`, `publish-image` do commit (`gh run list -R lussandro/bacco-adega-crm -L 10`, filtro por `headSha` com `jq`; o `gh` local não tem `--branch`). No job `verify`, ler `Test Files`/`Tests`/`Errors` do log; no `Kit self-host (bash)`, conferir o caso `APP_ACCENT_HEX inválido cai no accent do produto`.
  Vermelho = causa raiz, commit próprio, volta ao Step 1. Registrar runs em `evidence/bacco-rebrand/09-ci.md`.
- [ ] **Step 3: Release `v26.9.1` à mão, no esquema do fork.** O `release.yml` (App
  `deskcomm-release[bot]`, numeração do CHANGELOG do upstream) está desligado e não serve ao fork.
  **Não** rodar `cortar-release.ts --escrever`. O fragmento fica em `.changes/` (histórico do que a
  versão trouxe; o upstream não o conhece, então não conflita). Tag **anotada**, como a `v26.9.0` (medido
  `git cat-file -t v26.9.0` = `tag`) e como o `release.yml:247` documenta para o `agent.sh`:
  `git tag -a v26.9.1 -m "Bacco Adega CRM 26.9.1 — marca Bacco e funis de vinícola" <sha com ci success> && git push origin v26.9.1`
  (uma tag, nunca `--tags`).
- [ ] **Step 4:** `publish-image` do push da tag success; `ghcr.io/lussandro/deskcommcrm:26.9.1`,
  `ghcr.io/lussandro/deskcomm-worker:26.9.1`, `ghcr.io/lussandro/deskcomm-scheduler:26.9.1` existem
  (nomes da matriz de `publish-image.yml:111-117`, medidos em `evidence/bacco-deploy/01-ci.md`). Registrar em `09-ci.md`.

---

### Task 10: Prova em tela na VPS

**Files:** Create `tests/e2e/bacco-evidencia.spec.ts`, `evidence/bacco-rebrand/10-*.png`, `evidence/bacco-rebrand/10-revisao.md`

- [ ] **Step 1: Atualizar a VPS para a versão nova** — comando de `update.sh` de
  `docs/superpowers/plans/2026-09-15-bacco-plano-4-ci-deploy-vps.md` Task 7 Step 5, com `--to v$versao`.
  Expected: `exit=0`; `curl -s https://adega-crm.baccosistemas.com.br/api/v1/health` ok;
  `/icon` `200 image/png`; `docker logs` do app com `[telemetria] Desligada` (`SENTRY_DSN=off` sobreviveu).

- [ ] **Step 1b: Marca gravada no banco da VPS** — medido em 2026-09-15: `.env` com
  `APP_NAME="DeskcommCRM"` (padrão antigo do `install.sh:1261`, trocado nesta entrega) e
  `platform_branding.app_name = 'DeskcommCRM'`, `seeded_from_env = true`. O banco vence o `.env`
  (`lib/branding/instalacao.ts`), então sem corrigir a tela segue dizendo "DeskcommCRM" e
  `marcaEhADoProduto` não desenha o símbolo. **Com ok do dono** (dado de produção): trocar o nome
  pela tela `/admin/marca` (dono é platform admin) para "Bacco Adega CRM" — ou limpar —, e ajustar
  `APP_NAME="Bacco Adega CRM"` no `.env` (piso de rollback) + recriar `app`. Conferir com o `select`
  de `platform_branding` antes/depois e registrar em `10-revisao.md`.

- [ ] **Step 2: Cadastro aberto?** — a política vem de `platform_settings` acima do `.env`
  (`lib/auth/politica-de-cadastro.ts`); `.env` da VPS não declara `SIGNUP_MODE` (medido). Conferir na
  tela de cadastro (ou na tela de configurações da plataforma) que o modo é `aberto`. Se for `so_convite`: parar e perguntar ao dono.

- [ ] **Step 3: Conta QA** — o dono informa um e-mail de QA que ele lê. Cadastro por `/signup` dirigido
  pelo Playwright; GoTrue exige confirmação (`ENABLE_EMAIL_AUTOCONFIRM=false`, medido) → o dono clica o
  link. Credenciais só em `/root/.bacco_qa` (modo 600) na VPS, nunca no repo nem na conversa.

- [ ] **Step 4: Spec de evidência, autocontida** — `tests/e2e/bacco-evidencia.spec.ts` só importa
  `@playwright/test` (nenhum helper do repo, nenhum `playwright.config`); lê `BASE_URL`, `QA_EMAIL`,
  `QA_SENHA` do ambiente; screenshots com caminho absoluto `/work/out/10-<tela>-<tema>.png`. **Um só
  `test`, uma só sessão**, porque o onboarding só existe uma vez por organização
  (`app/app/layout.tsx:108` manda para `/onboarding` sem `onboarded_at`; `app/onboarding/layout.tsx:25`
  manda organização onboardada para `/app/inbox`). Tema trocado com `localStorage` `deskcomm-theme` +
  `page.reload()`:
  1. Deslogado: `/login` claro e escuro.
  2. Login → `/onboarding/welcome` claro e escuro; preencher "Vendemos vinho para restaurantes e empórios" → `/onboarding/funil` claro e escuro (deve propor "Clientes da vinícola").
  3. Seguir os passos até `done`, pulando WhatsApp e equipe pelos controles de pular que a tela oferecer
     (medir no Step 5a quais são; se algum passo não puder ser pulado, parar e reportar).
  4. `/app/inbox`, `/app/kanban`, `/app/products`, detalhe de um lead criado pela tela — cada um claro e escuro.
  Em cada tela, **medir por ferramenta** (`getComputedStyle`): `background-color` do botão primário
  (`rgb(74, 14, 31)` claro, `rgb(185, 130, 139)` escuro), `font-family` do `body` começando por Inter, do
  título público (`<h1>`/`<h2>` com `font-display`) começando por Playfair, e do título da inbox **sem**
  Playfair; `/icon` responde `image/png`. Asserções falham o teste; valores vão para o log.

- [ ] **Step 5a: Fumaça do runner na VPS** (resolução de `@playwright/test` sem `node_modules` não é garantida — instalar explícito):

```bash
ssh root@2.25.222.110 'mkdir -p /root/bacco-e2e/out && cd /root/bacco-e2e && docker run --rm \
  -v /root/bacco-e2e:/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c "npm init -y >/dev/null && npm i -D @playwright/test@1.63.0 >/dev/null && npx playwright --version"'
```
  Expected: `Version 1.63.0` (`pnpm-lock.yaml:1215`, medido). Depois, com o dono logado ou pela conta QA,
  abrir `/onboarding` à mão uma vez e anotar os controles de pular dos passos WhatsApp e equipe.

- [ ] **Step 5: Rodar na VPS**

```bash
scp tests/e2e/bacco-evidencia.spec.ts root@2.25.222.110:/root/bacco-e2e/
ssh root@2.25.222.110 'set -a; . /root/.bacco_qa; set +a; docker run --rm --network host \
  -e BASE_URL=https://adega-crm.baccosistemas.com.br -e QA_EMAIL -e QA_SENHA \
  -v /root/bacco-e2e:/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test bacco-evidencia.spec.ts --reporter=list'; echo "exit=$?"
scp 'root@2.25.222.110:/root/bacco-e2e/out/10-*.png' evidence/bacco-rebrand/
```
  Expected: `exit=0`, 16 PNG (login 2 + welcome 2 + funil 2 + 4 telas × 2).

- [ ] **Step 6: Revisão e aprovação** — `10-revisao.md` cita **cada** PNG pelo caminho completo em
  crase, com os valores medidos e defeitos vistos. `pnpm exec vitest run tests/unit/evidencia-citada.test.ts` → exit 0.
  Mostrar ao dono. **Paleta, hover e escuro só são "prontos" com o ok dele** (spec §4.2). Se reprovar o
  escuro 300: trocar para 200 (medido nas Global Constraints), voltar à Task 1 Step 4 e repetir Tasks 9–10.

- [ ] **Step 7:** Commit `test(bacco): evidência visual do rebrand na VPS`; push `--no-tags`.

- [ ] **Step 8: Vault** — gotchas duráveis no `projetos/bacco-adega-crm/CLAUDE.md`: régua Sage congelada
  como controle; grau do accent escuro medido (400 reprova 12, 300 passa); `font-display` só em telas
  públicas. Atualizar `ultima_revisao`. Sem log de sessão.

---

## Fora deste plano

- Guardrail de maioridade → Plano 2. Enforcement da suspensão → Plano 3.
- Pendências do Plano 4: mensagem WhatsApp ponta a ponta, `update.sh --force` idempotente na mesma
  versão, reboot da VPS, runbook `deploy-vps.md`.
- Organização QA na produção: fica até o dono decidir apagar (dado de produção, não se apaga sem ok).
- `docs/white-label.md` (cita Atkinson e "fonte não configurável"): tem tradução selada
  (`scripts/selar-traducao.ts`); editar sem re-traduzir é o anti-pattern que o selo existe para barrar.
  Reescrita junto com `VISION.md`, `README.en.md`, `README.es.md`.
- Skill `deskcomm-cliente-novo` para os três públicos.
- Fonte Playfair nos e-mails (webfont não é confiável em cliente de e-mail).
- Títulos/matriz do `publish-image.yml` e `scripts/cortar-release.ts:27` citando o upstream.
