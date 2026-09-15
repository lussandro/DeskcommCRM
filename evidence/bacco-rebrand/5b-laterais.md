# Laterais da fachada de acesso — evidência (Plano 5B, Task 1)

Geradas por `docs/brand/bacco/limpar-laterais-login.py` a partir de duas
ilustrações do kit v2 (`docs/brand/bacco/kit-v2/ui/illustrations/login/`,
still-life à esquerda e vinhedo à direita) — recortes de tela gerada, com
texto de interface gravado nos pixels. O script desfoca+escurece só as
regiões com texto/traço de interface; nenhum pixel é inventado, a região
"limpa" é a própria imagem borrada.

Saída:
- `public/fachada/lateral-esquerda.webp` (390x1086, 13 KB)
- `public/fachada/lateral-direita.webp` (448x1086, 4 KB)

Evidência visual (PNG, mesmo conteúdo do webp, só formato):
- `evidence/bacco-rebrand/5b-lateral-esquerda.png`
- `evidence/bacco-rebrand/5b-lateral-direita.png`

Conferido por inspeção visual das duas imagens acima:
- Nenhum texto de interface legível.
- Nenhum traço dourado nem borda de card visível.
- O "B" gravado no rótulo da garrafa (esquerda) e na rolha (esquerda) é arte
  do produto (logo Bacco na etiqueta/rolha), não texto de interface — fica,
  conforme o brief.

O que foi desfocado, por região (coordenadas do script):
- Esquerda: rodapé `(0, 900, 270, h)` — onde estava o texto "VINHOS PESSOAS
  RESULTADOS", sem degradê nas bordas direita/inferior (a região encosta na
  borda da imagem).
- Direita: `(0, 0, 110, h)` — faixa da borda dourada do card, colada à
  esquerda; `(80, 540, w, 840)` — frase vertical com seu traço; `(80, 880, w,
  h)` — rodapé com a segunda frase.
