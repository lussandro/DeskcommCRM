import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROTAS = [
  "app/api/v1/groups/route.ts",
  "app/api/v1/groups/[id]/route.ts",
  "app/api/v1/groups/[id]/members/route.ts",
];

describe("API de grupos — doutrina", () => {
  it("toda rota usa os wrappers ok/fail", () => {
    for (const r of ROTAS) {
      const src = readFileSync(r, "utf-8");
      expect(src, r).toMatch(/from "@\/lib\/api\/wrappers"/);
    }
  });

  it("nenhuma rota lê organization_id do body", () => {
    for (const r of ROTAS) {
      const src = readFileSync(r, "utf-8");
      expect(src, r).not.toMatch(/body\.organization_id|body\["organization_id"\]/);
    }
  });

  it("nenhuma rota deixa console.log", () => {
    for (const r of ROTAS) {
      expect(readFileSync(r, "utf-8"), r).not.toMatch(/console\.log/);
    }
  });
});
