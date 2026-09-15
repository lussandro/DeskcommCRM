# Evidência — Task 1 do Plano 5C: ilustrações da barra lateral e da inbox

Folha: `evidence/bacco-rebrand/5c-ilustracoes.png` (claro à esquerda, escuro à direita; de
cima para baixo em cada coluna: vinhedo, citação, rodapé).

## Origem

`docs/brand/bacco/kit-v2/ui/illustrations/{light,dark}/`:

- `vinhedo`: `empty-state-vineyard-{light,dark}.png`, usado como vem (625x305 claro,
  625x285 escuro) — o fundo emenda com `--color-bg` do tema.
- `citação`: `quote-card-image-{light,dark}.png`, recortado em x 0–134 (134x120 nos
  dois temas). O arquivo do kit traz um sinal de aspas solto em x 136–141, linhas
  38–45; o dono aprovou as ilustrações em 2026-09-15 pedindo para tirá-lo. A arte do
  claro termina em x 132. A borda arredondada é suavizada por `mask-image` no CSS do
  componente que consome esta peça.
- `rodapé`: `sidebar-footer-vineyard-{light,dark}.png`, recortado em x 0–100, y
  36–106 (100x70) — só a gravura do vinhedo, sem o texto "Configurações" (linhas
  2–20 do arquivo do kit) e sem a frase (x > 100). Medição por linha em 2026-09-15
  (diferença máxima contra o canto do fundo): linhas 34–42 vazias nos dois temas,
  arte a partir da linha 43 — o corte em y=36 fica dentro da margem vazia, com
  folga. O corte em x=100 pega a borda da arte; a barra lateral que a consome
  dissolve essa borda com `mask-image`.

## Conferência visual

Abri `evidence/bacco-rebrand/5c-ilustracoes.png` e cada peça ampliada 3x
individualmente: nenhuma letra, filete de texto cortado ou pedaço de elemento de
interface (botão, campo, ícone de UI) nas seis. Depois do recorte da `citação`,
nenhuma peça tem glifo solto. Aprovadas pelo dono em 2026-09-15.

Script gerador: `docs/brand/bacco/preparar-ilustracoes.py`.
