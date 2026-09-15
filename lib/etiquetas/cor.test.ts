import { describe, expect, it } from "vitest";

import { trilhaDaEtiqueta } from "./cor";

describe("trilhaDaEtiqueta — a mesma tag tem a mesma cor em qualquer tela", () => {
  it("é determinística e fica em 1..6", () => {
    for (const nome of ["Cliente", "Lead", "Distribuidor", "Clube Reserva", "Enoturismo", "VIP", "x"]) {
      const t = trilhaDaEtiqueta(nome);
      expect(t).toBe(trilhaDaEtiqueta(nome));
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(6);
    }
  });

  it("ignora caixa, espaços nas pontas e acento — é a mesma etiqueta", () => {
    expect(trilhaDaEtiqueta("  Pós-visita ")).toBe(trilhaDaEtiqueta("pos-visita"));
    expect(trilhaDaEtiqueta("ENOTURISMO")).toBe(trilhaDaEtiqueta("enoturismo"));
  });

  it("nome vazio não quebra", () => {
    expect(trilhaDaEtiqueta("")).toBe(1);
  });

  it("espalha: os 11 nomes do guia do kit usam ao menos 4 trilhas", () => {
    // Medido em 2026-09-15 com FNV-1a: {1, 4, 5, 6}. Trocar a lista de nomes exige remedir.
    const guia = ["Cliente", "Lead", "Distribuidor", "Comercial", "Clube Reserva", "Enoturismo", "Pós-visita", "Tasting", "On-trade", "Sommelier", "VIP"];
    expect(new Set(guia.map(trilhaDaEtiqueta)).size).toBeGreaterThanOrEqual(4);
  });
});
