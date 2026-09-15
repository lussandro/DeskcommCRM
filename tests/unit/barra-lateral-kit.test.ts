import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FONTE = fs.readFileSync(path.join(process.cwd(), "components/shell/Sidebar.tsx"), "utf8");

describe("barra lateral no padrão do kit Bacco", () => {
  it("usa a superfície própria da barra", () => {
    expect(FONTE).toMatch(/sticky top-0[^"]*bg-sidebar/);
    expect(FONTE).not.toMatch(/sticky top-0[^"]*bg-card/);
  });

  it("item ativo é vinho suave com texto da ação, nunca o fill cheio", () => {
    expect(FONTE).not.toContain('"bg-accent text-accent-foreground"');
    expect((FONTE.match(/"bg-accent-soft font-medium text-accent-text"/g) ?? []).length).toBe(3);
  });

  it("o rodapé ilustrado é decorativo, em CSS e só aparece com altura ≥ 1000 px", () => {
    // `navegacao.spec.ts` reprova a nav rolando em 1280×900 com 19 px de folga medidos.
    expect(FONTE).toMatch(/aria-hidden="true"[^>]*\[@media\(min-height:1000px\)\]:flex/);
    expect(FONTE).toContain("/ilustracoes/rodape-claro.webp");
    // O recorte do kit corta a arte em x = 100: a borda direita se dissolve por máscara.
    expect(FONTE).toContain("[mask-image:linear-gradient(to_right,black_70%,transparent)]");
    expect(FONTE).not.toMatch(/<img[^>]*ilustracoes/);
  });
});
