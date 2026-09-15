# Revisão — prova em tela do padrão visual do kit (Plano 5C, Task 7)

Rodada final contra `https://adega-crm.baccosistemas.com.br` na **v26.9.3** (2026-09-15, 22:27Z), com a
conta QA, Playwright `mcr.microsoft.com/playwright:v1.63.0-noble` na VPS: **2 passed** (1366 px e 400 px),
40 capturas, medidas em `evidence/bacco-rebrand/5c-medidas.jsonl` (uma linha por tela, tema e largura).

## Histórico

- **v26.9.2** (21:48Z): 400 px passou; 1366 px reprovou num único ponto, nos dois temas — abas da inbox
  com `abas.conteudo` 258 contra `abas.visivel` 247 ("Automático" cortado). Causa: cinco rótulos com
  `gap-2` numa coluna de 247 px (já existia no upstream, com contadores zerados). Conserto `gap-1` na
  v26.9.3; o esperado não foi afrouxado.
- **v26.9.3**: tudo verde. As capturas abaixo são desta rodada.

## Medidas (iguais nas duas larguras)

| Medida | Claro | Escuro |
|---|---|---|
| Fundo (`--color-bg`) | `rgb(251, 248, 242)` | `rgb(19, 17, 15)` |
| Superfície (`--color-surface`) | `rgb(255, 253, 248)` | `rgb(26, 23, 21)` |
| Barra lateral (`--color-sidebar`) | `rgb(250, 246, 240)` | `rgb(29, 15, 18)` |
| Ação (`--color-accent`) | `rgb(106, 23, 48)` | `rgb(106, 23, 48)` |
| Pior contraste do texto secundário (inbox / funis / kanban) | 5,47 / 5,11 / 5,47 | 6,99 / 6,21 / 6,62 |
| Abas da inbox (conteúdo/visível) 1366 · 400 | 247/247 · 327/327 | 247/247 · 327/327 |

Em todas as 40: `transbordaPagina` falso e nenhum elemento de `main` passando da borda. Títulos
editoriais em Playfair Display; gravura do vinhedo com altura dentro de `main` na inbox em 1366 px;
fachada com as 4 camadas de fundo em 1366 px.

## Capturas

Telas de acesso (fachada: laterais fotográficas, card com borda ouro, frases):

- `evidence/bacco-rebrand/5c-login-light-1366.png`, `evidence/bacco-rebrand/5c-login-dark-1366.png`,
  `evidence/bacco-rebrand/5c-login-light-400.png`, `evidence/bacco-rebrand/5c-login-dark-400.png`
- `evidence/bacco-rebrand/5c-cadastro-light-1366.png`, `evidence/bacco-rebrand/5c-cadastro-dark-1366.png`,
  `evidence/bacco-rebrand/5c-cadastro-light-400.png`, `evidence/bacco-rebrand/5c-cadastro-dark-400.png`
- `evidence/bacco-rebrand/5c-esqueci-light-1366.png`, `evidence/bacco-rebrand/5c-esqueci-dark-1366.png`,
  `evidence/bacco-rebrand/5c-esqueci-light-400.png`, `evidence/bacco-rebrand/5c-esqueci-dark-400.png`
- `evidence/bacco-rebrand/5c-redefinir-light-1366.png`, `evidence/bacco-rebrand/5c-redefinir-dark-1366.png`,
  `evidence/bacco-rebrand/5c-redefinir-light-400.png`, `evidence/bacco-rebrand/5c-redefinir-dark-400.png`
- `evidence/bacco-rebrand/5c-recuperacao-light-1366.png`, `evidence/bacco-rebrand/5c-recuperacao-dark-1366.png`,
  `evidence/bacco-rebrand/5c-recuperacao-light-400.png`, `evidence/bacco-rebrand/5c-recuperacao-dark-400.png`

Aplicação (barra lateral do kit, item ativo em vinho suave):

- Inbox editorial (gravura, citação, "Selecione um contato", abas inteiras):
  `evidence/bacco-rebrand/5c-inbox-light-1366.png`, `evidence/bacco-rebrand/5c-inbox-dark-1366.png`,
  `evidence/bacco-rebrand/5c-inbox-light-400.png`, `evidence/bacco-rebrand/5c-inbox-dark-400.png`
- `evidence/bacco-rebrand/5c-funis-light-1366.png`, `evidence/bacco-rebrand/5c-funis-dark-1366.png`,
  `evidence/bacco-rebrand/5c-funis-light-400.png`, `evidence/bacco-rebrand/5c-funis-dark-400.png`
- `evidence/bacco-rebrand/5c-kanban-light-1366.png`, `evidence/bacco-rebrand/5c-kanban-dark-1366.png`,
  `evidence/bacco-rebrand/5c-kanban-light-400.png`, `evidence/bacco-rebrand/5c-kanban-dark-400.png`
- `evidence/bacco-rebrand/5c-catalogo-light-1366.png`, `evidence/bacco-rebrand/5c-catalogo-dark-1366.png`,
  `evidence/bacco-rebrand/5c-catalogo-light-400.png`, `evidence/bacco-rebrand/5c-catalogo-dark-400.png`
- `evidence/bacco-rebrand/5c-configuracoes-light-1366.png`, `evidence/bacco-rebrand/5c-configuracoes-dark-1366.png`,
  `evidence/bacco-rebrand/5c-configuracoes-light-400.png`, `evidence/bacco-rebrand/5c-configuracoes-dark-400.png`

## Fora da prova

- **`/login/mfa`** (spec §7): capturá-la exigiria ativar fator TOTP na conta QA de produção. Cobertura que
  existe: a mesma casca `app/(public)/layout.tsx`, medida nas outras cinco telas de acesso, e o teste
  unitário do Plano 5B. **Dono ciente em 2026-09-15** ("ciente do mfa, pode seguir").

## Aprovação do dono

- Exceção `/login/mfa`: ciente (2026-09-15).
- Capturas finais da v26.9.3: **aprovadas** pelo dono em 2026-09-15, logado no sistema vendo as telas.
