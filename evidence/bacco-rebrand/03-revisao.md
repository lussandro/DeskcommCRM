# Símbolo e logotipo gerados — revisão visual (2026-09-15)

Plano 1 v2.1, Task 3. `lib/branding/desenho.ts` gerado por `docs/brand/bacco/texto-para-path.py`
(16.414 bytes, 3 exports, zero `<text`) a partir de `docs/brand/bacco/bacco-adega-crm-simbolo.svg` e
`docs/brand/bacco/bacco-adega-crm-logo-bordo.svg`, com Playfair Display e Inter (OFL, `google/fonts`).
Render com `rsvg-convert` fora do app, comparado com `docs/brand/bacco/preview.png`.

| Imagem | O que foi visto |
|---|---|
| `evidence/bacco-rebrand/03-simbolo.png` (512 px, fundo creme) | B serifado borgonha com a folha no topo e cacho de 6 uvas em ouro à esquerda; igual à aplicação "símbolo" do preview. Recorte pelo bbox: sem corte, margem uniforme. A 32 px (favicon) a folha e o cacho continuam distinguíveis. |
| `evidence/bacco-rebrand/03-logotipo.png` (160 px de altura, claro) | B + uvas · "Bacco" · "ADEGA" em borgonha · "CRM" em ouro — a horizontal colorida do preview. |
| `evidence/bacco-rebrand/03-logotipo-escuro.png` (160 px, fundo `#161510`) | Mesmo desenho em creme, uvas e "CRM" em ouro; legível sobre o fundo escuro do tema. |

## Diferenças em relação ao preview

- **Omissão deliberada:** o logotipo não tem a linha separadora, a tagline nem a folha (spec §4.1).
- **Espaço entre "Bacco" e "ADEGA":** fica o vão que a linha e a tagline ocupavam no SVG horizontal. Fechar
  o vão exige mover glifos, isto é, geometria que a arte oficial não tem. **Decisão do dono** na prova em
  tela (Task 10).
- **Primeira geração corrigida:** "ADEGA" saía em ouro junto com "CRM"; o script passou "ADEGA" para a
  cor do nome, como na horizontal colorida.
- Sem kerning (fontTools puro): nenhuma colisão de letra visível nos três renders.
