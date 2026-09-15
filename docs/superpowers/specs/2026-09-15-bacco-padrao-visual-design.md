# Bacco Adega CRM — padrão visual do sistema e fachada de acesso (design)

> Aprovado pelo dono em 2026-09-15, seção por seção (1, 2a, 2b, 3). Sucede a paleta da v26.9.1:
> o dono reprovou o rosé do tema escuro e mandou as referências e o kit de marca.
> Fonte: `docs/brand/bacco/kit-v2/` (kit do dono, versionado aqui).

## 1. Objetivo

Aplicar a TODAS as telas do sistema o padrão visual do kit Bacco Adega CRM, nos dois temas:
neutros quentes, ação principal em vinho, ouro pontual, Playfair nos títulos editoriais e Inter na
interface; redesenhar as seis telas de acesso como a referência de login; e levar a inbox ao
visual da referência, usando os componentes-padrão resultantes.

Referências (versionadas):

- `docs/brand/bacco/kit-v2/ui/screens/login-dark-premium.png` — login
- `docs/brand/bacco/kit-v2/ui/screens/inbox-dark.png` e `docs/brand/bacco/kit-v2/ui/screens/inbox-light.png` — tela principal
- `docs/brand/bacco/kit-v2/ui/tokens/bacco-adega-crm.tokens.json` — cores, raios, espaçamentos
- `docs/brand/bacco/kit-v2/UI-GUIDE.md`, `docs/brand/bacco/kit-v2/ui/prompts/PROMPT-MESTRE-UI.md`

## 2. Decisões do dono (2026-09-15)

| Tema | Decisão |
|---|---|
| Símbolo oficial | B com uvas (o do código; SVGs do kit = `docs/brand/bacco/`). O board com garrafa e balão não é a marca. |
| Alcance da fachada | As seis telas de acesso (`app/(public)`): Entrar, Criar conta, Esqueci a senha, Definir nova senha, Recuperar acesso, Verificação em duas etapas. |
| "Lembrar de mim" | Não entra: a sessão já é persistente (`lib/supabase/server.ts`, `browser.ts`) e não há mecanismo. Caixa sem efeito seria enganosa. |
| Fundo do login | Abordagem A: laterais (taça/garrafa à esquerda, vinhedo à direita) + centro em gradiente CSS; laterais somem abaixo de ~1024 px. |
| Tema da fachada | Segue o tema claro/escuro da pessoa; variante clara desenhada. |
| Frases da fachada | Texto real (i18n `es`, leitor de tela): "Mais que vinhos, grandes histórias"; "Vinhos · Pessoas · Resultados"; "Bacco Adega CRM — Gestão que brinda ao seu crescimento". |
| Ação principal no escuro | Vinho profundo, grau 600 da rampa (`#6A1730`; kit `#7C1D3A`, uma rampa só), abaixo de 3:1 contra a superfície — exceção só da paleta do produto; marca própria mantém o piso (§5.3). |
| Tokens | Os do kit, com cinco tons ajustados para texto (§5.1). |
| Ilustrações | As do kit v2; as que trazem texto ou interface gravados são limpas por nós e o texto vira HTML (§6). |
| Padrão | Vale para todas as telas: tokens globais + componentes reutilizáveis. |

## 3. Fora de escopo

- **Painel do contato de vinícola** ("Compras e histórico", "Clube e assinaturas", "Visitas e enoturismo",
  "Preferências de vinho"): não há dado nem tabela (medido: `baseline.sql` sem clube/preferência/visita;
  `components/inbox/CRMSidePanel.tsx` tem Contato, Demandas abertas, Memória do contato, campos do funil).
  Funcionalidade nova com modelo de dados → spec própria.
- Fotos de contato (dado de cada contato); seletor de organização e bloco do usuário no topo só ganham as cores.
- Símbolo novo, app icon em PWA/manifest (fica o favicon atual do B com uvas).

## 4. Fachada de acesso (seções 1 e 2a)

### 4.1 Estrutura

`app/(public)/layout.tsx` continua sendo a única casca das seis telas e ganha três camadas:

1. **Fundo** — `public/fachada/lateral-esquerda.webp` e `public/fachada/lateral-direita.webp` presas às
   bordas; centro em gradiente CSS. Abaixo de ~1024 px as laterais saem (`hidden lg:block`).
2. **Card** — superfície do tema, borda ouro 1 px, raio `lg` (16 px), logotipo (ou `<img>` do revendedor,
   regra atual inalterada), divisória ouro curta e `{children}`.
3. **Frases** — só em tela larga, como texto.

`public/` é aceitável aqui: o fork é marca de produto (ADR-015) e as laterais são fotografia sem marca
de revendedor; o `<img>` do revendedor e `marcaEhADoProduto` seguem valendo dentro do card.

### 4.2 Formulários

- Componente novo `components/auth/CampoDeAcesso.tsx`: ícone à esquerda (barril `@/lib/ui/icons`, ADR-05:
  `Envelope`, `Lock`) e, em campo de senha, botão de olho real (`Eye`/`EyeSlash`) que alterna `type`, com
  `aria-label` e `aria-pressed`, textos com `es`.
- Aplicado em `LoginForm`, `SignupForm`, `ResetPasswordForm`, `ForgotPasswordForm`. `MfaForm` e o
  código de recuperação ganham só o estilo; o e-mail do `RecoveryForm` usa o campo novo. O botão de olho se chama
  "Mostrar"/"Ocultar", com `aria-controls` — nunca "senha", porque o `getByLabel` do Playwright lê `aria-label`.
- Placeholders "seu@email.com" e "Sua senha". Validação, erros e actions de auth não mudam.

### 4.3 Página de login

"Entrar" (Playfair) + "Acesse sua conta no {nome}" — o nome segue vindo de `branding()`
(`tests/e2e/icone-da-marca.spec.ts` cruza essa leitura). "Esqueci minha senha" em ouro-texto à direita
acima do botão; botão "Entrar →"; separador "ou"; "Não tem conta? Criar conta". Avisos por query
(`error=`, `reset=`) seguem dentro do card, iguais.

### 4.4 Temas da fachada

| | Escuro | Claro |
|---|---|---|
| Fundo | laterais como vêm; centro `#13110F` → transparente | laterais sob véu creme `#F5F0E6` ~70 %; centro creme |
| Card | `surface` escuro, borda ouro `#C49A4A` 1 px | `surface` claro, borda ouro 1 px, sombra suave |
| Título | creme `#F5F0E6` | borgonha `#4A0E1F` |
| Links / frases | ouro `#C49A4A` | ouro-texto `#855F00` |
| Botão | `primary` escuro | `primary` claro |

## 5. Padrão visual do sistema (seção 2b)

### 5.1 Tokens (em `app/globals.css`, blocos `:root`/`[data-theme="light"]` e `[data-theme="dark"]`)

**Claro**

| Papel | Valor | Pior contraste medido |
|---|---|---|
| fundo / superfície / superfície suave | `#FBF8F2` / `#FFFDF8` / `#F5F0E6` | — |
| texto | `#2E2A27` | 12,52 |
| texto secundário | `#6C645D` (kit `#776F68`, ajustado; `#746C65` reprovava 4,02 sobre a seleção `--color-accent-soft`) | 4,53 |
| borda | `#E8DED1` | decorativa |
| ação principal / hover | `#6A1730` / grau 700 da rampa `#581A2A` (kit `#541025`, ΔE 0,022), texto branco | 11,81 |
| ouro (traço, ícone) / ouro-texto | `#C49A4A` / `#855F00` (ajustado; `#8E6603` reprovava 4,04 sobre a seleção) | — / 4,51 |
| sucesso (ícone, badge) / sucesso-texto | `#5A8A63` / `#406F4A` (ajustado; `#497852` reprovava 3,98 sobre o fundo translúcido da badge) | — / 4,54 |
| perigo / perigo-texto | `#A94452` / `#A5404F` (ajustado; 4,30 sobre a badge) | 5,09 / 4,54 |
| ação como texto e borda (`--color-accent-text`, novo) | grau 600 da rampa (`#6A1730`) | 9,21 |
| barra lateral (token novo) | `#FAF6F0` (captura clara) | — |

**Escuro**

| Papel | Valor | Pior contraste medido |
|---|---|---|
| fundo / superfície / superfície suave | `#13110F` / `#1A1715` / `#211D1A` | — |
| texto / texto secundário | `#F5F0E6` / `#A69C92` | 14,73 / 6,21 |
| borda | `#332C27` | decorativa |
| hover da ação | grau 500 da rampa (`#94344D`; kit `#962749`, ΔE 0,021), texto branco | 7,35 |
| ouro (inclusive texto) | `#C49A4A` | 6,43 |
| sucesso / sucesso-texto | `#719E76` / `#78A57D` (ajustado; 4,16 sobre a badge) | 5,46 / 4,54 |
| perigo-texto / botão de perigo | `#DE737C` (ajustado; `#CE646E` reprovava 3,74 sobre a badge) / `#BE5561` com texto branco | 4,51 / 4,51 |
| ação principal (fill) | grau 600 da rampa (`#6A1730`), decisão do dono 2026-09-15 no lugar de `#7C1D3A` (uma rampa só) | texto branco 11,81 |
| ação como texto e borda (`--color-accent-text`, novo) | grau 300 da rampa (`#CE8693`) | 5,33 |
| barra lateral (token novo) | `#1D0F12` (captura escura, tingida de vinho) | — |

Medições: `pnpm exec tsx` sobre `lib/branding/contraste.ts` (`razaoDeContraste`, `deltaESimulado`) em
2026-09-15. Separação ação principal × perigo sob dicromacia: 0,167 (claro), 0,205 (escuro), piso 0,05.
Tons ajustados: só a lightness em OKLCH, matiz e croma do kit preservados.

Também do kit: raios `sm 6 / md 10 / lg 16 / xl 22` px; espaçamentos `4 / 8 / 12 / 16 / 24 / 32` px;
Playfair Display em títulos editoriais, Inter no resto. Seleção: claro com o grau suave da ação principal
(item ativo ~`#F3DCDD`, card selecionado ~`#F9EEEE`); escuro com vinho profundo (item ativo ~`#4C1D29`,
card selecionado ~`#33151B` com borda ~`#521324`). Badges de contagem em rosé nos dois temas. Os
valores com "~" saem da amostragem das capturas e são fixados no plano por medição de contraste.
A borda do card selecionado no escuro é o grau 800 da rampa (`#4A1B26`, `dark:border-accent-800`): entre os
graus existentes é o mais próximo da amostra ~`#521324` (ΔE OKLab 0,0214; grau 700 `#581A2A` 0,0220; grau 600
`#6A1730` 0,0588), medido em Python em 2026-09-15. É decorativa (1,05:1 contra o fundo selecionado, grau 900),
e no claro a borda existe com cor transparente, para a seleção não mudar o layout (Plano 5C, Task 3).

### 5.2 Rampa e marca por instalação

A rampa `--color-accent-50…950` passa a ser UMA rampa, `rampaDeSemente("#6a1730")`, igual nos dois temas (decisão do dono de 2026-09-15:
a ação do escuro é o grau 600 dessa rampa, e não `#7C1D3A`, para não refatorar a régua para uma rampa por
tema). O que continua desenhado à parte por tema são os GRAUS de cada papel (accent, hover, soft, texto,
anel), não a rampa
("Light + dark drawn separately"). `platform_branding`/`organizations.settings.branding` continuam
podendo sobrepor o accent (marca própria); o padrão do produto é o do kit. A régua gerada
(`lib/branding/regua-do-produto.ts`) é regenerada; a régua Sage congelada segue isolando os testes de
algoritmo.

### 5.3 Mudança da régua de contraste (tema escuro)

Hoje o produto exige accent × superfície ≥ 3:1. No escuro a ação principal do kit mede ~1,6. Exceção **só da
paleta do produto** (decisão do dono, 2026-09-15 — organização com marca própria mantém o piso, porque a mesma
régua deriva a marca dela), só no escuro e só para o fill da ação principal: **texto sobre o fill ≥ 4,5:1** e **anel de foco ≥ 3:1
contra as superfícies**. O botão se identifica pelo texto; quem navega por teclado vê o anel. A exceção
fica declarada no teste com esta razão, e qualquer outro papel continua no piso atual.

**Fill × texto (medido na implementação):** `--color-accent` era usado ao mesmo tempo como fill
(`bg-accent`, 87 usos) e como texto/borda (`text-accent` 36 + 3, `border-accent` 21, `ring-accent` 4,
`outline-accent` 2). No escuro o vinho de fill mede 1,6:1 como texto. Por isso nasce
`--color-accent-text` (claro grau 600, escuro grau 300), medido pela régua como papel de TEXTO contra todas
as superfícies, e os usos de texto/borda migram para ele por codemod com lista conferida.

### 5.4 Componentes-padrão

- **Estado vazio editorial** (`components/empty/EmptyState.tsx`, o componente que já existe, ganhando o modo
  `editorial`; não nasce componente novo): título Playfair, subtítulo, ilustração opcional (decorativa, em
  `background-image` num `div aria-hidden`, nunca `<img>`), citação opcional em ouro. Usado onde há "nada selecionado"
  ou "nada ainda"; a inbox é a primeira.
- **Tag colorida** (`components/ui/Etiqueta.tsx` + `lib/etiquetas/cor.ts`): cor CALCULADA do nome
  normalizado (hash estável → paleta pastel de 6 tons por tema, cada tom medido ≥ 4,5:1 texto × fundo).
  Sem coluna nova (DIRC: Calcular). Mesma tag, mesma cor em qualquer tela.
- **Barra lateral**: token de superfície próprio; rodapé com a ilustração do vinhedo e a frase "Grandes
  vinhos criam grandes conexões" como texto.
- **Inbox**: cards da lista, abas com contagem, conversa selecionada, estado vazio com a gravura e a
  citação "Mais que clientes, apreciadores de boas histórias.", card de citação na coluna direita
  ("O vinho aproxima pessoas e transforma momentos em memórias.").

## 6. Ilustrações

Origem: kit v2 do dono, `docs/brand/bacco/kit-v2/ui/illustrations/` — recortes das telas geradas (o README
do kit declara). Destino: `public/ilustracoes/*.webp` (e `public/fachada/` para o login).

| Arquivo do kit | Estado | Tratamento |
|---|---|---|
| `light|dark/empty-state-vineyard-*` (625×305 / 625×285) | limpo; fundo emenda (razão 1,001–1,026) | WebP; máscara de borda por segurança |
| `light|dark/quote-card-image-*` (142×120) | limpo; cantos inferiores até 1,299 | WebP; `mask-image` em degradê |
| `light|dark/quote-card-*` (315×120) | citação gravada | não usado (substituído por imagem + texto HTML) |
| `light|dark/sidebar-footer-vineyard-*` (223×106) | "Configurações" e frase gravados; canto até 1,145 | recortar só a arte, desfocar resíduo, máscara; frase em HTML |
| `login/login-still-life-left` (390×1086) | "VINHOS PESSOAS RESULTADOS" gravado | desfocar a região do texto; frase em HTML |
| `login/login-vineyard-right` (448×1086) | borda do card e duas frases gravadas | desfocar card e frases; frases em HTML |

Cada arquivo tratado é renderizado e aprovado pelo dono em `evidence/` antes do deploy. Resolução limitada
à das capturas (decorativo; sem versão 2x).

## 7. Testes e prova (seção 3)

**Unidade (CI `verify`):** régua de contraste dos tokens novos nos dois temas; teste explícito da exceção
§5.3 (texto 4,5 e anel 3); os cinco tons ajustados amarrados ao papel com o piso; cor de etiqueta
(determinística, 6 tons passam nos dois temas, nome vazio não quebra); `EmptyState` editorial (título, citação,
ilustração decorativa); `CampoDeAcesso` (olho alterna `type`, rótulo acessível, `es`); testes de fachada
atuais (logo do revendedor, chip no escuro, título da aba) ajustados só onde a casca muda, com razão
escrita; `i18n-espanhol-cobre-a-tela`.

**Tela (Playwright na VPS, produção, depois do deploy):** as seis telas de acesso + inbox, funis, kanban,
catálogo e uma de configuração, nos dois temas, em 1366 px e 400 px. Medido por `getComputedStyle`:
fundo, superfície e barra lateral = tokens; ação principal = kit; título editorial em Playfair; contraste
do texto secundário ≥ 4,5 medido na tela; em 400 px as laterais do login ausentes. Capturas citadas em
`evidence/`, aprovação do dono.

**Exceção na prova em tela: Verificação em duas etapas (`/login/mfa`) — dono ciente em 2026-09-15.** Das seis
telas de acesso, cinco são provadas em tela; `/login/mfa` fica fora. Para capturá-la seria preciso ativar um
fator TOTP na conta QA de produção, uma ação sensível de segurança que muda como essa conta entra e deixa um
segredo de segundo fator para guardar. O que cobre a tela: ela usa a mesma casca `app/(public)/layout.tsx`
das outras cinco, medida nos dois temas e nas duas larguras, e o teste unitário da fachada do Plano 5B cobre a
casca e o `MfaForm`. A exceção é declarada na revisão da prova (`evidence/bacco-rebrand/5c-revisao.md`) e só
vale depois de o dono tomar ciência.

**Entrega:** plano → refutador + Codex → CI verde → tag anotada `v26.9.2` → `update.sh` → prova na VPS;
fragmento `.changes/` `capacidade_nova`.

## 8. Riscos declarados

- A exceção §5.3 baixa o contraste do contorno do botão principal no escuro; mitigada por texto e anel.
- Ilustrações em resolução de captura podem parecer suaves em tela 2x.
- Mudar neutros e rampa move números de testes de produto (`branding-*`): cada mudança sai com a medição.
- O upstream muda `app/globals.css` com frequência: conflito previsível a cada merge de tag (ADR-015).
