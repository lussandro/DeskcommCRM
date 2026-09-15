import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAPEIS_DE_FILL_NO_ESCURO, extrairRegua, medirPares, razaoDeContraste } from "@/lib/branding/contraste";
import { compor } from "@/lib/branding/rampa";

/**
 * Os tokens do kit Bacco, medidos no próprio globals.css (spec 2026-09-15 §5.1). Os tons de texto
 * foram ajustados para passar 4,5:1 inclusive sobre a seleção e o fundo translúcido das badges.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function bloco(seletor: string): Record<string, string> {
  const i = CSS.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`bloco ${seletor} ausente`);
  const a = CSS.indexOf("{", i);
  let d = 0;
  let j = a;
  for (; j < CSS.length; j++) {
    if (CSS[j] === "{") d++;
    else if (CSS[j] === "}" && --d === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of CSS.slice(a + 1, j).matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    if (m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

const RAIZ = bloco(":root");
const ESCURO = bloco('[data-theme="dark"]');

function resolve(b: Record<string, string>, valor: string): string {
  const ref = valor.match(/^var\((--[a-z0-9-]+)\)$/);
  if (!ref?.[1]) return valor;
  return resolve(b, b[ref[1]] ?? RAIZ[ref[1]] ?? "");
}
const tok = (b: Record<string, string>, k: string) => resolve(b, b[k] ?? RAIZ[k] ?? "");
function rgba(v: string): { hex: string; alfa: number } {
  const m = v.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
  if (!m) throw new Error(`não é rgba: ${v}`);
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
  return { hex, alfa: Number(m[4]) };
}

const TEMAS = [
  { nome: "claro", b: RAIZ },
  { nome: "escuro", b: ESCURO },
] as const;

const fundos = (b: Record<string, string>) =>
  ["--color-bg", "--color-surface", "--color-surface-elevated", "--color-sidebar", "--color-accent-soft"].map((k) => tok(b, k));

describe("tokens do kit Bacco", () => {
  it("fundos, ação e raios são os do kit", () => {
    expect([tok(RAIZ, "--color-bg"), tok(RAIZ, "--color-surface"), tok(RAIZ, "--color-surface-elevated")]).toEqual(["#fbf8f2", "#fffdf8", "#f5f0e6"]);
    expect([tok(ESCURO, "--color-bg"), tok(ESCURO, "--color-surface"), tok(ESCURO, "--color-surface-elevated")]).toEqual(["#13110f", "#1a1715", "#211d1a"]);
    expect(tok(RAIZ, "--color-accent")).toBe("#6a1730");
    expect(tok(ESCURO, "--color-accent")).toBe("#6a1730");
    expect(["--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"].map((k) => RAIZ[k])).toEqual(["6px", "10px", "16px", "22px"]);
  });

  for (const { nome, b } of TEMAS) {
    it(`${nome}: todo token de texto passa 4,5 em fundo, superfícies, barra lateral e seleção`, () => {
      for (const k of ["--color-text", "--color-text-muted", "--color-accent-text", "--color-gold-text"]) {
        const piores = fundos(b).map((f) => razaoDeContraste(tok(b, k), f));
        expect(Math.min(...piores), `${k} = ${tok(b, k)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${nome}: texto das badges semânticas passa 4,5 sobre o fundo translúcido composto`, () => {
      for (const s of ["success", "warning", "error", "info"]) {
        const { hex, alfa } = rgba(tok(b, `--color-${s}-bg`));
        const base = ["--color-bg", "--color-surface", "--color-surface-elevated", "--color-sidebar"].map((k) => compor(hex, alfa, tok(b, k)));
        const pior = Math.min(...base.map((f) => razaoDeContraste(tok(b, `--color-${s}-fg`), f)));
        expect(pior, `--color-${s}-fg`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${nome}: texto do fill e do botão de perigo passa 4,5`, () => {
      expect(razaoDeContraste(tok(b, "--color-accent-fg"), tok(b, "--color-accent"))).toBeGreaterThanOrEqual(4.5);
      expect(razaoDeContraste("#ffffff", tok(b, "--color-error"))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${nome}: as 6 etiquetas passam 4,5`, () => {
      for (let n = 1; n <= 6; n++) {
        expect(
          razaoDeContraste(tok(b, `--color-etiqueta-${n}-fg`), tok(b, `--color-etiqueta-${n}-bg`)),
          `etiqueta ${n}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("exceção do produto: no escuro só o fill da ação reprova, e texto do fill e anel passam", () => {
    const r = extrairRegua(CSS);
    expect(medirPares(r.claro, r.rampaDoProduto, 0).filter((p) => !p.passa)).toEqual([]);
    const reprovasEscuro = medirPares(r.escuro, r.rampaDoProduto, 0).filter((p) => !p.passa);
    expect(reprovasEscuro.length, "o fill contra as 4 superfícies").toBe(8);
    for (const p of reprovasEscuro) {
      expect(PAPEIS_DE_FILL_NO_ESCURO as readonly string[], `${p.papel}×${p.superficie}`).toContain(p.papel);
    }
  });
});
