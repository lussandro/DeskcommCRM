import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec Bacco §5.3: no escuro `--color-accent` é FILL vinho profundo (1,6:1 como texto).
 * Texto, borda, anel e outline da ação usam `--color-accent-text`. A exceção medida é a
 * borda que acompanha um fill sólido (`border-accent` junto de `bg-accent ` na mesma linha).
 */
const RAIZ = process.cwd();
const PASTAS = ["app", "components", "hooks", "lib"];
const PROIBIDO = /(?:^|[\s"'`:])(?:hover:|focus-visible:|active\]:|group-hover:)?(text|border|ring|outline)-accent(?![-\w])/;

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(p);
    return /\.(tsx?|ts)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("a ação como texto/borda usa accent-text", () => {
  it("nenhum text/border/ring/outline-accent solto fora da borda de fill sólido", () => {
    const culpados: string[] = [];
    for (const pasta of PASTAS) {
      for (const f of arquivos(path.join(RAIZ, pasta))) {
        fs.readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
          if (!PROIBIDO.test(linha)) return;
          const fillSolido = /\bborder-accent\b/.test(linha) && /\bbg-accent\s/.test(linha) && !/\b(text|ring|outline)-accent(?![-\w])/.test(linha);
          if (!fillSolido) culpados.push(`${path.relative(RAIZ, f)}:${i + 1}`);
        });
      }
    }
    expect(culpados).toEqual([]);
  });
});
