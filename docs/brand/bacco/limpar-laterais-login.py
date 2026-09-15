#!/usr/bin/env python3
"""Gera public/fachada/lateral-{esquerda,direita}.webp a partir das ilustrações do kit v2.

As duas imagens do kit foram RECORTADAS das telas geradas e trazem texto e interface gravados
nos pixels (docs/brand/bacco/kit-v2/ui/illustrations/README.md). Texto gravado não traduz,
não é lido por leitor de tela e duplicaria as frases que a fachada escreve em HTML — por isso
este script desfoca e escurece só essas regiões. Nenhum pixel é inventado: a região limpa é a
própria imagem borrada.

  - esquerda: "VINHOS PESSOAS RESULTADOS" no rodapé (encosta na borda: sem degradê à esquerda/embaixo);
  - direita: a borda dourada do card (faixa colada à esquerda) e as duas frases com seus traços.

Os parâmetros foram conferidos por zoom em 2026-09-15 (Plano 5B); mudar coordenada exige
conferir de novo. Uso, da raiz do repositório:

  python3 docs/brand/bacco/limpar-laterais-login.py

Requer: python3 com Pillow.
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[3]
KIT = RAIZ / "docs/brand/bacco/kit-v2/ui/illustrations/login"
SAIDA = RAIZ / "public/fachada"


def regiao(img, caixa, blur, escurecer, cor, degrade):
    """Desfoca+escurece `caixa`, com degradê só nos lados listados em `degrade` (topo/dir/baixo/esq)."""
    x0, y0, x1, y1 = caixa
    reg = img.crop(caixa).filter(ImageFilter.GaussianBlur(blur))
    reg = Image.blend(reg, Image.new("RGB", reg.size, cor), escurecer)
    w, h = reg.size
    mascara = Image.new("L", reg.size, 0)
    px = mascara.load()
    for y in range(h):
        for x in range(w):
            a = 1.0
            if "topo" in degrade[0]:
                a = min(a, (y + 1) / degrade[1])
            if "baixo" in degrade[0]:
                a = min(a, (h - y) / degrade[1])
            if "esq" in degrade[0]:
                a = min(a, (x + 1) / degrade[1])
            if "dir" in degrade[0]:
                a = min(a, (w - x) / degrade[1])
            px[x, y] = int(255 * max(0.0, a))
    img.paste(reg, (x0, y0), mascara)


def esquerda():
    img = Image.open(KIT / "login-still-life-left.png").convert("RGB")
    w, h = img.size
    regiao(img, (0, 900, 270, h), 26, 0.55, (22, 11, 9), (("topo", "dir"), 60))
    return img


def direita():
    img = Image.open(KIT / "login-vineyard-right.png").convert("RGB")
    w, h = img.size
    regiao(img, (0, 0, 110, h), 22, 0.75, (22, 17, 15), (("dir",), 40))           # borda do card
    regiao(img, (80, 540, w, 840), 34, 0.75, (24, 19, 17), (("topo", "baixo", "esq"), 60))  # frase vertical
    regiao(img, (80, 880, w, h), 30, 0.75, (20, 16, 14), (("topo", "esq"), 55))    # rodapé
    return img


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for nome, img in (("lateral-esquerda", esquerda()), ("lateral-direita", direita())):
        destino = SAIDA / f"{nome}.webp"
        img.save(destino, "WEBP", quality=80, method=6)
        print(f"{destino.relative_to(RAIZ)} {img.size[0]}x{img.size[1]} {os.path.getsize(destino) // 1024} KB")


if __name__ == "__main__":
    main()
