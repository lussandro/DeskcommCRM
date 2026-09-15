#!/usr/bin/env python3
"""Gera public/ilustracoes/*.webp a partir das ilustrações do kit v2 (Plano 5C).

- vinhedo: empty-state-vineyard-* como vem (limpo; o fundo emenda com --color-bg, razão ≤ 1,026).
- citacao: quote-card-image-* recortado em x 0–134 (borda suavizada por mask-image no CSS). O kit traz
  um sinal de aspas solto em x 136–141, linhas 38–45, nos dois temas (medido em 2026-09-15); o dono
  pediu para tirar. A arte do claro termina em x 132.
- rodape: sidebar-footer-vineyard-* recortado em x 0–100, y 36–106 — só a gravura. O arquivo do kit
  traz "Configurações" gravado (linhas 2–20) e a frase (x > 100); no escuro há ainda um filete na
  linha 33. Medido por linha em 2026-09-15 (diferença máxima contra o canto do fundo): linhas 34–42
  vazias nos dois temas, arte a partir da 43. O corte em x = 100 pega a borda da arte; o CSS da barra
  a dissolve com mask-image.
Uso, da raiz: python3 docs/brand/bacco/preparar-ilustracoes.py
"""
import os
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
KIT = RAIZ / "docs/brand/bacco/kit-v2/ui/illustrations"
SAIDA = RAIZ / "public/ilustracoes"
TEMAS = {"claro": "light", "escuro": "dark"}


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for tema, kit in TEMAS.items():
        pecas = {
            "vinhedo": Image.open(KIT / kit / f"empty-state-vineyard-{kit}.png").convert("RGB"),
            "citacao": Image.open(KIT / kit / f"quote-card-image-{kit}.png").convert("RGB").crop((0, 0, 134, 120)),
            "rodape": Image.open(KIT / kit / f"sidebar-footer-vineyard-{kit}.png").convert("RGB").crop((0, 36, 100, 106)),
        }
        for nome, img in pecas.items():
            destino = SAIDA / f"{nome}-{tema}.webp"
            img.save(destino, "WEBP", quality=82, method=6)
            print(f"{destino.relative_to(RAIZ)} {img.size[0]}x{img.size[1]} {os.path.getsize(destino) // 1024} KB")


if __name__ == "__main__":
    main()
