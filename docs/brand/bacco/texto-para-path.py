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
    # "ADEGA" leva a cor do nome e só "CRM" vai em ouro: é a horizontal colorida
    # de docs/brand/bacco/preview.png (spec §4.4).
    "nome": [
        texto(por_conteudo["Bacco"], "Bacco", dx, dy, cx_logo),
        texto(por_conteudo["ADEGA"], "ADEGA", dx, dy, cx_logo),
    ],
    "sufixo": [texto(por_conteudo["CRM"], "CRM", dx, dy, cx_logo)],
}
vb_l = cx_logo.viewbox()

print('''/**
 * O DESENHO da marca do produto — símbolo e logotipo do Bacco Adega CRM.
 *
 * ESTE ARQUIVO É GERADO por `docs/brand/bacco/texto-para-path.py` a partir de
 * `docs/brand/bacco/bacco-adega-crm-simbolo.svg` e `bacco-adega-crm-logo-bordo.svg`
 * (texto convertido em paths com Playfair Display 600). Não edite à mão.
 *
 * O LOGOTIPO omite de propósito três peças do SVG horizontal: a linha separadora,
 * a tagline ("Relacionamento e atendimento inteligente") — ilegíveis na altura da
 * barra lateral — e a folha, que o SVG horizontal não tem. O SÍMBOLO traz a folha.
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
