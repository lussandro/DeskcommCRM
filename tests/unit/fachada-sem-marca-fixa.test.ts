import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * As telas de acesso são vistas por clientes de revendedor antes de qualquer organização: o nome do
 * produto do fork NUNCA pode estar escrito à mão ali — ele sai de `marcaDaSaida`/`branding()`.
 * A catraca geral (`tests/unit/branding.test.ts`) procura a marca do upstream, não a do fork.
 */
const RAIZ = process.cwd();
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("telas de acesso sem o nome do produto escrito à mão", () => {
  it("app/(public) e components/auth não contêm 'Bacco Adega CRM' fora de comentário", () => {
    const culpados = ["app/(public)", "components/auth"]
      .flatMap((d) => arquivos(path.join(RAIZ, d)))
      .filter((f) => /Bacco Adega CRM/.test(semComentarios(fs.readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));
    expect(culpados).toEqual([]);
  });
});
