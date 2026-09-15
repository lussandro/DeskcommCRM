import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAPEIS_DE_FILL_NO_ESCURO, extrairRegua } from "@/lib/branding/contraste";

/**
 * Spec 2026-09-15-bacco-padrao-visual-design §5.3, lido do `app/globals.css` real.
 *  - token `-text` que aponta para a rampa é papel de TEXTO (piso 4,5) contra todas as superfícies;
 *  - a exceção do fill escuro é POLÍTICA DO PRODUTO: a extração continua medindo o fill como
 *    componente nos dois temas, para que marca própria (que usa esta mesma régua na derivação)
 *    mantenha o piso. Decisão do dono, 2026-09-15.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("régua — papéis do kit Bacco", () => {
  it("declara quais tokens são fill no escuro (política do produto)", () => {
    expect([...PAPEIS_DE_FILL_NO_ESCURO]).toEqual(["--color-accent", "--color-accent-hover"]);
  });

  it("--color-accent-text é papel de TEXTO nos dois temas", () => {
    const r = extrairRegua(CSS);
    for (const tema of [r.claro, r.escuro]) {
      const p = tema.papeis.find((x) => x.token === "--color-accent-text");
      expect(p, `${tema.nome}: --color-accent-text fora da régua`).toBeDefined();
      expect(p?.tipo).toBe("texto");
      expect(p?.contra).toBeNull();
    }
  });

  it("a extração NÃO remove o fill: marca própria continua com o piso de componente", () => {
    const r = extrairRegua(CSS);
    for (const tema of [r.claro, r.escuro]) {
      for (const t of PAPEIS_DE_FILL_NO_ESCURO) {
        expect(tema.papeis.find((p) => p.token === t)?.tipo, `${tema.nome}/${t}`).toBe("componente");
      }
    }
  });
});
