import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROTAS = [
  "app/api/v1/groups/disponiveis/route.ts",
  "app/api/v1/groups/cadastrar/route.ts",
];

describe("cadastro de grupo — doutrina", () => {
  it("usa os wrappers ok/fail", () => {
    for (const r of ROTAS) {
      expect(readFileSync(r, "utf-8"), r).toMatch(/from "@\/lib\/api\/wrappers"/);
    }
  });

  it("não lê organization_id do body", () => {
    for (const r of ROTAS) {
      expect(readFileSync(r, "utf-8"), r).not.toMatch(/body\.organization_id/);
    }
  });

  it("o cadastro valida o corpo com Zod", () => {
    const src = readFileSync("app/api/v1/groups/cadastrar/route.ts", "utf-8");
    expect(src).toMatch(/z\.object/);
    expect(src).toMatch(/wa_group_id/);
  });

  it("a carga inicial usa listarGrupos/lerParticipantes, não polling em loop", () => {
    const src = readFileSync("app/api/v1/groups/cadastrar/route.ts", "utf-8");
    expect(src).toMatch(/lerParticipantes|listarGrupos/);
    expect(src).not.toMatch(/setInterval|groups\/refresh/);
  });

  it("nenhuma rota deixa console.log", () => {
    for (const r of ROTAS) {
      expect(readFileSync(r, "utf-8"), r).not.toMatch(/console\.log/);
    }
  });
});
